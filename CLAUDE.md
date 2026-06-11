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
```

There is no test suite. Use `bun run typecheck` to validate changes.

```bash
docker build -t translatarr .                                  # multi-stage: bun installs/builds, node:22-slim runs the standalone output
docker run -d -p 3000:3000 -v translatarr-data:/app/data translatarr
```

`next.config.ts` sets `output: "standalone"` for the Docker runtime. SQLite lives in `/app/data` (mount a volume); LLM env vars are optional since config can be done in-app.

CI: `.github/workflows/docker.yml` builds the image (linux/amd64 + linux/arm64 via QEMU) and pushes it to GHCR as `ghcr.io/<owner>/<repo>` on pushes to `main` (tagged `latest`, `main`, `sha-…`) and on `v*` tags (semver tags). It authenticates with the workflow's own `GITHUB_TOKEN` — no secrets to configure.

## Multi-user & auth

The app is multi-user with cookie-session auth and two roles (`admin`, `user`). First run shows a setup screen that creates the admin account (and adopts any pre-auth chats); afterwards admins create accounts via Settings → Users. Passwords are scrypt-hashed (`node:crypto`, no auth dependency); sessions are opaque tokens in the `sessions` table carried by an HTTP-only cookie (`translatarr_session`, 30-day TTL). `app/lib/auth.ts#getSessionUser()` is the single auth entry point — every API route calls it and returns 401 when unauthenticated (admin-only routes additionally 403). Chats are scoped by `chats.user_id`; cross-user access reads as 404. Deleting a user cascades to their sessions, settings, and chats.

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
- **`llm-client.ts`** — the `LLMClient` interface (`complete(systemPrompt, userText)`) wraps providers behind a single abstraction. `createLLMClient(settings)` takes a `ResolvedLLMSettings`; add new providers by implementing the interface and wiring them into its `switch`, replacing the relevant `StubClient`. `OpenAICompatibleClient` uses raw fetch with `response_format: json_object`; `AnthropicClient` uses the official `@anthropic-ai/sdk` with structured outputs (`messages.parse` + `zodOutputFormat(translationResponseSchema)`), so its responses are schema-guaranteed JSON. Because of that helper, `translation-schema.ts` imports from `zod/v4` (the v4 API shipped inside zod 3.25+); the API routes still use classic `zod`.
- **`db.ts`** — shared lazy `better-sqlite3` connection and all migrations (chats, chat_turns, app_settings, users, sessions, user_settings; conditional `ALTER TABLE` adds `chats.user_id`).
- **`auth.ts` / `user-store.ts`** — scrypt password hashing, cookie sessions (`getSessionUser`), and user CRUD (`claimOrphanChats` adopts pre-auth chats during setup).
- **`settings-store.ts` / `settings-types.ts`** — instance overrides (`app_settings`) and per-user prefs (`user_settings`), plus `resolveLLMSettings(userId)` (user → instance → env → default) and the redacted `SettingsView` served to the UI (the API key is never returned to the client; non-admins don't see instance overrides at all).
- **`translation-service.ts`** — builds the system prompt that pins the LLM to the schema, calls the client, strips code fences, and `parse`s against the schema. Retries **once** on `MalformedLLMResponseError` (schema/JSON failures); any other error bubbles up. This is the only module that knows how to turn raw text into a `TranslationResponse`.
- **`languages.ts`** — the supported-language registry plus the special `auto` (auto-detect) source. `isSupportedLanguage` gates all API input; `auto` is valid as a source but rejected as a target. The English `name`s feed the LLM prompt; UI display goes through `i18n/language-names.ts` instead.
- **`i18n/`** — UI localization in 27 locales (every supported language except Hebrew and Ukrainian, which are translation-only). `messages-en.ts` defines `MessageKey`; the other `messages-*.ts` catalogs are `Record<MessageKey, string>`, so a new key won't compile until every locale carries it. `messages.ts` has the `Locale` registry, `resolveLocale`, `detectBrowserLocale`, and `{param}` interpolation; `language-names.ts` localizes language display names (exhaustive per locale against `LanguageCode`); `i18n-context.tsx` is the client provider — `useI18n()` returns `t`, `setLocale`, and `languageLabel`, and `speechErrorMessage` maps `SpeechError` codes to localized text. The locale resolves user pref (key `locale` in `user_settings`, surfaced as `SettingsView.locale`) → browser language → English. Server-generated error strings remain English (clients display them verbatim).
- **`chat-store.ts`** — synchronous `better-sqlite3` access. Lazily opens the DB, runs idempotent `CREATE TABLE IF NOT EXISTS` migrations on first use (WAL mode, foreign keys on), and maps snake_case rows to camelCase types. Tables: `chats` and `chat_turns` (cascade-deleted). `addTurn` stores the translation as JSON and auto-titles a chat from its first turn.
- **`chat-types.ts`** — camelCase API/UI types (`ChatSummary`, `ChatTurn`, `ChatDetail`).
- **`speech/`** — voice support. `locale-map.ts` maps app language codes to BCP-47 (typed against `LanguageCode`, so adding a language won't compile until mapped) plus voice picking/`getVoicesAsync`; `web-speech.d.ts` holds ambient `SpeechRecognition` declarations missing from `lib.dom`; `provider-audio.ts` is the server-side OpenAI-compatible audio client (`/audio/transcriptions`, `/audio/speech`); `speech-client.ts` is the client-side engine abstraction (browser Web Speech API vs provider via the speech routes, with automatic fallback — e.g. Firefox has no browser STT — and `unlockAudio()` for autoplay policies); `use-speech.ts` exposes the `useSpeechInput`/`useSpeechOutput` hooks.

### API routes (`app/api/`)

All routes (except auth) require a session. Chat data is scoped to the session user.

- `GET /api/auth/me` — current user, or 401 with `needsSetup` flag; `POST /api/auth/setup` — create the first admin (403 once any user exists); `POST /api/auth/login` / `POST /api/auth/logout`.
- `GET|POST /api/users`, `DELETE /api/users/[userId]` — admin-only user management (cannot delete self; duplicate username → 409).
- `POST /api/translate` — stateless one-off translation (no persistence).
- `GET|POST /api/chats` — list / create the user's chats.
- `GET|PATCH|DELETE /api/chats/[chatId]` — fetch a chat; `PATCH {action:"clear"}` wipes turns; `PATCH {action:"rename", title}` renames it; `DELETE` removes it.
- `POST /api/chats/[chatId]/turns` — translate **and** persist a turn to the chat. Accepts an optional `result` (validated against `translationResponseSchema`) so the client can persist its live-preview translation without a second LLM call.
- `POST /api/speech/transcribe` — multipart audio (≤15 MB, optional `language`) → `{ text }` via the provider STT endpoint; `POST /api/speech/synthesize` — `{ text, lang, voice? }` → streamed `audio/mpeg`. Both 400 when no speech provider key resolves (browser-engine users never call them unless falling back).
- `GET|PUT /api/settings` — per-user prefs (model/systemPrompt/speechEngine/locale) + effective view; admins also see the instance section. `PUT /api/settings/instance` — admin-only instance overrides (LLM + `speech*` fields). PUT semantics per field: omitted = unchanged, `null`/empty = clear, value = set.

All routes validate input with Zod and share an error convention: `400` invalid input, `401` unauthenticated, `403` forbidden, `404` missing chat/user, `409` conflict, `422` malformed LLM output (`MalformedLLMResponseError`), `502` provider failure.

### Frontend

Design language ("documents on a translator's desk"): dark ink-green chrome with warm paper cards for translated content and the composer; vermilion accent, jade/gold secondary. Fonts via `next/font` in `layout.tsx`: Bricolage Grotesque (UI, `--font-ui`), Newsreader (translated text, `--font-serif`), JetBrains Mono (metadata stamps, `--font-mono`). All tokens are CSS variables in `globals.css`; keep new UI on those tokens.

`app/components/auth-gate.tsx` wraps everything: it checks the session and renders the login form, the first-run admin-setup form, or the app. `app/components/translator.tsx` is a single large `"use client"` component holding all UI state; it receives the session user (for the sidebar user badge / logout and to show admin settings sections). `settings-dialog.tsx` has per-user preference fields plus admin-only instance and user-management (`user-admin.tsx`) sections. Live preview is **off by default**; when enabled it debounces a translation (`DEBOUNCE_MS`, 1500ms, against `/api/translate`) while the user types. "Sending" persists a turn to the active chat; if the current preview matches the submitted text and language pair exactly, the client sends it as `result` so the server skips the duplicate LLM call. Voice UI: a Mic button in the composer dictates (appending) into the textarea, translation cards get a Speak button, and the top-bar Voice button opens `voice-mode.tsx` — a conversation overlay where tapping a language side listens, persists the utterance as a turn (the turns route accepts per-turn language pairs, reversed when the target side is tapped), and auto-speaks the top translation; it requires a concrete (non-auto) source language. `app/page.tsx` wraps `AuthGate` in `I18nProvider`; all visible strings go through `useI18n().t` (catalogs in `app/lib/i18n/`) — don't hardcode UI copy. `app/layout.tsx` is a thin shell. `MAX_CHARS` (12000) is duplicated between the client and the route schemas — keep them in sync.

The app is an installable PWA: `app/manifest.ts` (served at `/manifest.webmanifest`, `display: standalone`, ink theme color) references PNG icons in `public/` rendered from the 訳 seal (`icon-192`/`icon-512` plus a full-bleed `icon-maskable-512` for Android adaptive masks); `app/apple-icon.png` is auto-linked by Next for iOS. Standalone install requires HTTPS in practice (expects a reverse proxy in front); there is no service worker / offline support. The Dockerfile copies `public/` explicitly because Next standalone output does not include it.

## Conventions

- TypeScript `strict` is on; keep `bun run typecheck` clean.
- Codebase style is camelCase for variables/functions and PascalCase for types/components (TS/React idiom), which differs from the snake_case preference in global instructions — match the existing code here.
- DB columns are snake_case and mapped to camelCase at the `chat-store` boundary; do not leak snake_case past that layer.
- Let errors bubble to the route handlers, which own the HTTP error mapping.
