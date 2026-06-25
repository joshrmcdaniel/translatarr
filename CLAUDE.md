# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Translatarr is a provider-agnostic LLM translation app built on Next.js 15 (App Router) and React 19. It produces structured translations (multiple ranked options, key-word glossary, romanization, and a back-translation) and persists translation sessions ("chats") to a local SQLite database.

`README.md` is the user-facing install/usage doc (Docker via GHCR, configuration table, screenshots in `docs/`); this file is the contributor-facing map. Keep both in sync when commands or env vars change.

## Commands

```bash
bun install            # install dependencies (bun.lock is the source of truth; package-lock.json also present)
bun run dev            # start dev server (http://localhost:3000)
bun run build          # production build
bun run start          # serve the production build
bun run typecheck      # tsc --noEmit — primary correctness gate
bun run lint           # next lint
bun run openapi:dump   # write clients/python/openapi.json from buildOpenApiDocument() (for the Python client)
```

There is no test suite. Use `bun run typecheck` to validate changes.

```bash
docker build -t translatarr .                                  # multi-stage: bun installs/builds, node:22-slim runs the standalone output
docker run -d -p 3000:3000 -v translatarr-data:/app/data translatarr
```

`next.config.ts` sets `output: "standalone"` for the Docker runtime. SQLite lives in `/app/data` (mount a volume); LLM env vars are optional since config can be done in-app.

CI: `.github/workflows/docker.yml` builds the image (linux/amd64 + linux/arm64 via QEMU) and pushes it to GHCR as `ghcr.io/<owner>/<repo>` on pushes to `main` (tagged `latest`, `main`, `sha-…`) and on `v*` tags (semver tags). It authenticates with the workflow's own `GITHUB_TOKEN` — no secrets to configure.

`.github/workflows/publish-python.yml` builds the Python client (`clients/python`) and attaches its sdist + wheel to the GitHub Release for each `v*` tag (also `workflow_dispatch` with a `version` input for test builds, which upload as artifacts only). GitHub Packages has no Python registry, so distribution is via Release assets installed by URL. The package version is stamped from the tag (`v1.2.3` → `translatarr-client 1.2.3`), so a tagged release publishes the app image and the matching client together; it builds from the committed generated models, uses `GITHUB_TOKEN` (`contents: write`), and configures no secrets.

## Multi-user & auth

The app is multi-user with cookie-session auth and two roles (`admin`, `user`). First run shows a setup screen that creates the admin account (and adopts any pre-auth chats); afterwards admins create accounts via Settings → Users. Passwords are scrypt-hashed (`node:crypto`, no auth dependency); sessions are opaque tokens in the `sessions` table carried by an HTTP-only cookie (`translatarr_session`, 30-day TTL). `app/lib/auth.ts#getSessionUser()` is the single auth entry point — every API route calls it and returns 401 when unauthenticated (admin-only routes additionally 403). It resolves either a session cookie **or** an `Authorization: Bearer <token>` header (bearer wins when present), so adding bearer support there covered every route without touching them. Chats are scoped by `chats.user_id`; cross-user access reads as 404. Deleting a user cascades to their sessions, settings, chats, and API keys.

API keys are personal access tokens for programmatic/non-browser clients (every user manages their own under Settings → API keys; a key inherits its owner's identity and role). `app/lib/api-key-store.ts` issues `tra_`-prefixed tokens, stores only their SHA-256 hash (tokens are high-entropy, so no scrypt), returns the plaintext exactly once at creation, and self-evicts a key on use once past its optional `expires_at` (mirroring session-expiry cleanup). The `api_keys` table is created in `db.ts`.

## Configuration

LLM settings resolve per value as: **user preference** (model, system prompt — stored in `user_settings`) → **instance override** (admin-managed via Settings, stored in `app_settings`) → env var → built-in provider default. Resolution lives in `app/lib/settings-store.ts` (`resolveLLMSettings(userId)`). Provider, API key, and base URL are instance-only (admin); model and system prompt can be overridden per user.

- `LLM_API_KEY` — an API key is required (env or Settings); `createLLMClient()` throws without one, so every translate request 502s until it is set.
- `LLM_PROVIDER` — `openai-compatible` (default), `anthropic`, or `custom`. `openai-compatible` and `anthropic` are implemented; `custom` is a `StubClient` that throws on use.
- `LLM_MODEL` — provider-dependent default: `gpt-5.4-mini` (openai-compatible) or `claude-haiku-4-5` (anthropic).
- `LLM_BASE_URL` — provider-dependent default: `https://api.openai.com/v1` or `https://api.anthropic.com`.
- `SQLITE_PATH` — overrides the default DB path (`data/translatarr.sqlite`); env-only.

Speech settings follow the same chain via `resolveSpeechSettings(userId)`: the engine (`browser` | `provider`, default `browser`) is the only per-user value; `SPEECH_API_KEY`, `SPEECH_BASE_URL`, `SPEECH_STT_MODEL` (`whisper-1`), `SPEECH_TTS_MODEL` (`gpt-4o-mini-tts`), and `SPEECH_TTS_VOICE` (`alloy`) are instance/env-level and stored under `speech.*` keys in the same settings tables. When the resolved LLM provider is `openai-compatible`, the speech apiKey/baseUrl default to the LLM values, so OpenAI/OpenRouter users get provider speech with zero extra config; Anthropic has no audio API, so those instances must set speech credentials explicitly (`SettingsView.speech.effective.providerConfigured` gates the UI).

The Settings dialog can also override the system prompt (template supports `{{source}}`/`{{target}}` placeholders); the JSON schema clause is always appended server-side so output parsing keeps working.

## Architecture

Request flow: `Translator` (client component) → API route → `translation-service` → `llm-client` → provider, with results validated by Zod and optionally persisted via `chat-store`.

### Layers (`app/lib/`)

- **`translation-schema.ts`** — the contract for the whole app. The Zod `translationResponseSchema` (detected language, confidence, 2–3 ranked translation options, each carrying its own complete `keyWords` glossary) defines the JSON the LLM must return and the shape stored in the DB. Top-level `keyWords` is a legacy field kept (with `.default([])`) so pre-existing stored turns still parse; the UI falls back to it when an option has no glossary. Changing this schema ripples to the system prompt, the stored `result_json`, and the UI.
- **`llm-client.ts`** — the `LLMClient` interface (`complete(systemPrompt, userText)`) wraps providers behind a single abstraction. `createLLMClient(settings)` takes a `ResolvedLLMSettings`; add new providers by implementing the interface and wiring them into its `switch`, replacing the relevant `StubClient`. `OpenAICompatibleClient` uses raw fetch with `response_format: json_object`; `AnthropicClient` uses the official `@anthropic-ai/sdk` with structured outputs (`messages.parse` + `zodOutputFormat(translationResponseSchema)`), so its responses are schema-guaranteed JSON. Because of that helper, `translation-schema.ts` imports from `zod/v4` (the v4 API shipped inside zod 3.25+), as do the OpenAPI-documented routes' request schemas in `request-schemas.ts`; the remaining API routes (auth, users, settings) still use classic `zod`.
- **`db.ts`** — shared lazy `better-sqlite3` connection and all migrations (chats, chat_turns, app_settings, users, sessions, user_settings; conditional `ALTER TABLE`s add `chats.user_id` and `chat_turns.selected_option`).
- **`auth.ts` / `user-store.ts` / `api-key-store.ts`** — scrypt password hashing, cookie/bearer sessions (`getSessionUser`), user CRUD (`claimOrphanChats` adopts pre-auth chats during setup), and API-key issue/list/resolve/revoke (`resolveApiKeyUser` is the bearer-token side of auth).
- **`settings-store.ts` / `settings-types.ts`** — instance overrides (`app_settings`) and per-user prefs (`user_settings`), plus `resolveLLMSettings(userId)` (user → instance → env → default) and the redacted `SettingsView` served to the UI (the API key is never returned to the client; non-admins don't see instance overrides at all).
- **`translation-service.ts`** — builds the system prompt that pins the LLM to the schema (the JSON-Schema clause is generated from the Zod schema via `z.toJSONSchema`), wraps the user text in `<text_to_translate>` tags, calls the client, strips code fences, and `parse`s against the schema. Retries **once** on `MalformedLLMResponseError` (schema/JSON failures); any other error bubbles up. Translation is conversation-aware: callers pass `context` (built with `contextFromTurns`, the last 6 turns as original/translation pairs using each turn's user-selected option) and it is prepended to the user message in a `<conversation_context>` block the prompt instructs the model to use only for disambiguation. This is the only module that knows how to turn raw text into a `TranslationResponse`.
- **`languages.ts`** — the supported-language registry plus the special `auto` (auto-detect) source. `isSupportedLanguage` gates all API input; `auto` is valid as a source but rejected as a target. The English `name`s feed the LLM prompt; UI display goes through `i18n/language-names.ts` instead. `request-schemas.ts` builds `zod/v4` source/target language enums from this registry (source includes `auto`, target excludes it), so the documented routes validate language codes against it directly rather than via a separate `isSupportedLanguage` call.
- **`i18n/`** — UI localization in 27 locales (every supported language except Hebrew and Ukrainian, which are translation-only). `messages-en.ts` defines `MessageKey`; the other `messages-*.ts` catalogs are `Record<MessageKey, string>`, so a new key won't compile until every locale carries it. `messages.ts` has the `Locale` registry, `resolveLocale`, `detectBrowserLocale`, and `{param}` interpolation; `language-names.ts` localizes language display names (exhaustive per locale against `LanguageCode`); `i18n-context.tsx` is the client provider — `useI18n()` returns `t`, `setLocale`, and `languageLabel`, and `speechErrorMessage` maps `SpeechError` codes to localized text. The locale resolves user pref (key `locale` in `user_settings`, surfaced as `SettingsView.locale`) → browser language → English. Server-generated error strings remain English (clients display them verbatim).
- **`chat-store.ts`** — synchronous `better-sqlite3` access. Lazily opens the DB, runs idempotent `CREATE TABLE IF NOT EXISTS` migrations on first use (WAL mode, foreign keys on), and maps snake_case rows to camelCase types. Tables: `chats` and `chat_turns` (cascade-deleted). `addTurn` stores the translation as JSON and auto-titles a chat from its first turn.
- **`chat-types.ts`** — camelCase API/UI types (`ChatSummary`, `ChatTurn`, `ChatDetail`).
- **`speech/`** — voice support. `locale-map.ts` maps app language codes to BCP-47 (typed against `LanguageCode`, so adding a language won't compile until mapped) plus voice picking/`getVoicesAsync`; `web-speech.d.ts` holds ambient `SpeechRecognition` declarations missing from `lib.dom`; `provider-audio.ts` is the server-side OpenAI-compatible audio client (`/audio/transcriptions`, `/audio/speech`); `speech-client.ts` is the client-side engine abstraction (browser Web Speech API vs provider via the speech routes, with automatic fallback — e.g. Firefox has no browser STT — and `unlockAudio()` for autoplay policies); `use-speech.ts` exposes the `useSpeechInput`/`useSpeechOutput` hooks.

### API routes (`app/api/`)

All routes (except auth) require a session. Chat data is scoped to the session user.

- `GET /api/auth/me` — current user, or 401 with `needsSetup` flag; `POST /api/auth/setup` — create the first admin (403 once any user exists); `POST /api/auth/login` / `POST /api/auth/logout`.
- `GET|POST /api/users`, `DELETE /api/users/[userId]` — admin-only user management (cannot delete self; duplicate username → 409).
- `GET|POST /api/keys`, `DELETE /api/keys/[keyId]` — the caller's own API keys (any authenticated user, scoped to `user_id`; revoking another user's key reads as 404). `POST {name, expiresAt?}` returns the plaintext `token` once (the only time it is ever sent); `expiresAt` is an optional ISO 8601 timestamp, rejected if in the past.
- `GET /api/docs` — Swagger UI for the "callable from outside" routes (translate, chats + turns, speech, keys), serving the OpenAPI 3.1 spec from `GET /api/docs/openapi.json` and its own static assets from `GET /api/docs/[asset]`. Everything lives under `/api/docs` and requires a session (the page 302s to `/` otherwise; the spec and assets 401) — nothing is public, which works because a logged-in browser sends the session cookie on every same-origin request. The spec is built at request time by `app/lib/openapi.ts`: request bodies are generated from the routes' own `zod/v4` request schemas (`request-schemas.ts`, the same objects the handlers `parse` against) via `z.toJSONSchema` — including the source/target language-code enums — so documented inputs can't drift from validation, and the `TranslationResponse` schema is generated the same way. Responses (handlers build them ad hoc, so there's no runtime schema) and paths/methods (App Router exposes no route metadata) are described by hand. The Swagger UI assets are copied from the `swagger-ui-dist` devDependency into `.swagger-ui/` by `bun run swagger:ui` (auto-run from `dev`/`build`, gitignored, never committed) and served by the `[asset]` route rather than from `public/` so they stay behind auth; the Dockerfile copies `.swagger-ui/` into the standalone image.
- `POST /api/translate` — one-off translation (no persistence); optional `chatId` pulls that chat's recent turns in as conversation context (404 if not the caller's chat).
- `GET|POST /api/chats` — list / create the user's chats.
- `GET|PATCH|DELETE /api/chats/[chatId]` — fetch a chat; `PATCH {action:"clear"}` wipes turns; `PATCH {action:"rename", title}` renames it; `DELETE` removes it.
- `POST /api/chats/[chatId]/turns` — translate **and** persist a turn to the chat. Accepts an optional `result` (validated against `translationResponseSchema`) so the client can persist its live-preview translation without a second LLM call.
- `PATCH /api/chats/[chatId]/turns/[turnId]` — `{selectedOption: n}` records which translation option the user chose (stored in `chat_turns.selected_option`, default 0); the chosen option is what `contextFromTurns` feeds to later translations and what voice mode displays. `{action: "retranslate", text?}` re-runs the translation (optionally with edited text) using context from the turns *before* that turn, replacing the stored text/result and resetting the selection to 0.
- `POST /api/speech/transcribe` — multipart audio (≤15 MB, optional `language`) → `{ text }` via the provider STT endpoint; `POST /api/speech/synthesize` — `{ text, lang, voice? }` → streamed `audio/mpeg`. Both 400 when no speech provider key resolves (browser-engine users never call them unless falling back).
- `GET|PUT /api/settings` — per-user prefs (model/systemPrompt/speechEngine/locale) + effective view; admins also see the instance section. `PUT /api/settings/instance` — admin-only instance overrides (LLM + `speech*` fields). PUT semantics per field: omitted = unchanged, `null`/empty = clear, value = set.

All routes validate input with Zod and share an error convention: `400` invalid input, `401` unauthenticated, `403` forbidden, `404` missing chat/user, `409` conflict, `422` malformed LLM output (`MalformedLLMResponseError`), `502` provider failure.

### MCP endpoint

`app/api/[transport]/route.ts` serves a Model Context Protocol endpoint over Streamable HTTP at **`/api/mcp`** (the `mcp-handler` package, with `basePath: "/api"`). The `[transport]` segment is a dynamic catch-all, but every static `/api/*` route (translate, chats, …) takes precedence, so only otherwise-unmatched single segments (`mcp`, `sse`) reach it. `withMcpAuth` gates it on the same auth as the REST API via `getSessionUser` (`app/lib/mcp/auth.ts`, which resolves a `tra_` bearer token or the session cookie), so clients connect with a personal API key: `claude mcp add --transport http https://<host>/api/mcp --header "Authorization: Bearer tra_…"`. Tools are registered in `app/lib/mcp/tools.ts` and call the same `translation-service`/`chat-store` functions as the REST routes (one shared code path), scoping data to the authenticated user via `extra.authInfo.clientId`: `translate`, `list_chats`, `get_chat`, `create_chat`, `add_turn`, `list_languages`. Tool inputs use **classic `zod`** (the MCP SDK's schema dialect, distinct from the `zod/v4` request schemas; language codes are enums built from the registry); results are returned as JSON text, and expected failures (missing chat, provider/LLM errors) come back as `isError` results rather than thrown exceptions (the MCP-convention caller boundary, like the REST handlers' HTTP mapping). The endpoint runs on the Node runtime (better-sqlite3) and is intentionally **not** in the OpenAPI/Swagger spec — it is JSON-RPC, not REST.

### Frontend

Design language ("documents on a translator's desk"): dark ink-green chrome with warm paper cards for translated content and the composer; vermilion accent, jade/gold secondary. Fonts via `next/font` in `layout.tsx`: Bricolage Grotesque (UI, `--font-ui`), Newsreader (translated text, `--font-serif`), JetBrains Mono (metadata stamps, `--font-mono`). All tokens are CSS variables in `globals.css`; keep new UI on those tokens.

`app/components/auth-gate.tsx` wraps everything: it checks the session and renders the login form, the first-run admin-setup form, or the app. `app/components/translator.tsx` is a single large `"use client"` component holding all UI state; it receives the session user (for the sidebar user badge / logout and to show admin settings sections). `settings-dialog.tsx` has per-user preference fields plus admin-only instance and user-management (`user-admin.tsx`) sections. Live preview is **off by default**; when enabled it debounces a translation (`DEBOUNCE_MS`, 1500ms, against `/api/translate`) while the user types. "Sending" persists a turn to the active chat; if the current preview matches the submitted text and language pair exactly, the client sends it as `result` so the server skips the duplicate LLM call. Featuring an option on a saved turn persists the choice (`selectedOption`); on live-preview cards it is deliberately local-only and does not carry over to the sent turn, which always starts at the top-ranked option. Voice UI: a Mic button in the composer dictates (appending) into the textarea, translation cards get a Speak button, and the top-bar Voice button opens `voice-mode.tsx` — a conversation overlay where tapping a language side listens, persists the utterance as a turn (the turns route accepts per-turn language pairs, reversed when the target side is tapped), and auto-speaks the top translation; it requires a concrete (non-auto) source language. `app/page.tsx` wraps `AuthGate` in `I18nProvider`; all visible strings go through `useI18n().t` (catalogs in `app/lib/i18n/`) — don't hardcode UI copy. `app/layout.tsx` is a thin shell. `MAX_CHARS` (12000) is duplicated between the client and the route schemas — keep them in sync.

The app is an installable PWA: `app/manifest.ts` (served at `/manifest.webmanifest`, `display: standalone`, ink theme color) references PNG icons in `public/` rendered from the 訳 seal (`icon-192`/`icon-512` plus a full-bleed `icon-maskable-512` for Android adaptive masks); `app/apple-icon.png` is auto-linked by Next for iOS. Standalone install requires HTTPS in practice (expects a reverse proxy in front); there is no service worker / offline support. The Dockerfile copies `public/` explicitly because Next standalone output does not include it.

## Clients

`clients/python/` is a typed Python SDK (`translatarr-client`) over the documented API — synchronous `TranslatarrClient` and async `AsyncTranslatarrClient` (both in `src/translatarr/`), thin shells over httpx whose shared request-building, response-parsing, and error-mapping live in `_core.py`/`_errors.py` (so the two clients can't drift). Response models in `src/translatarr/_models.py` are **generated** from the OpenAPI spec via `clients/python/scripts/regenerate.sh` — do not hand-edit them; that script runs `bun run openapi:dump` (→ `clients/python/openapi.json`, a gitignored regenerated artifact) then `datamodel-codegen` (only `_models.py` is committed). Because the spec's response schemas are themselves generated from the server's Zod (`request-schemas.ts`, `translation-schema.ts`), the Python models can't drift from the server. Request bodies are hand-built small dicts in `_core.py` (a few fields — `createKey.expiresAt` UTC `Z` formatting, `createTurn.result` register/tone-vs-romanization cleanup — need custom serialization a generated model wouldn't do). Wrapper shapes returned to callers (e.g. `CreatedApiKey`) are named `components.schemas` entries so codegen produces them; trivial envelopes (`{chat}`, `{chats}`) are unwrapped in the readers. See `clients/python/README.md`.

## Conventions

- TypeScript `strict` is on; keep `bun run typecheck` clean.
- Codebase style is camelCase for variables/functions and PascalCase for types/components (TS/React idiom), which differs from the snake_case preference in global instructions — match the existing code here.
- DB columns are snake_case and mapped to camelCase at the `chat-store` boundary; do not leak snake_case past that layer.
- Let errors bubble to the route handlers, which own the HTTP error mapping.
