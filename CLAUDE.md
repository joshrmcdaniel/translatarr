# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Translatarr is a provider-agnostic LLM translation app built on Next.js 15 (App Router) and React 19. It produces structured translations (multiple ranked options, key-word glossary, romanization, and a back-translation) and persists translation sessions ("chats") to a local SQLite database.

Note: `README.md` is stale `bun init` boilerplate and does not describe this project. The repo runs as a Next.js app, not via `bun run index.ts`.

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

## Multi-user & auth

The app is multi-user with cookie-session auth and two roles (`admin`, `user`). First run shows a setup screen that creates the admin account (and adopts any pre-auth chats); afterwards admins create accounts via Settings → Users. Passwords are scrypt-hashed (`node:crypto`, no auth dependency); sessions are opaque tokens in the `sessions` table carried by an HTTP-only cookie (`translatarr_session`, 30-day TTL). `app/lib/auth.ts#getSessionUser()` is the single auth entry point — every API route calls it and returns 401 when unauthenticated (admin-only routes additionally 403). Chats are scoped by `chats.user_id`; cross-user access reads as 404. Deleting a user cascades to their sessions, settings, and chats.

## Configuration

LLM settings resolve per value as: **user preference** (model, system prompt — stored in `user_settings`) → **instance override** (admin-managed via Settings, stored in `app_settings`) → env var → built-in provider default. Resolution lives in `app/lib/settings-store.ts` (`resolveLLMSettings(userId)`). Provider, API key, and base URL are instance-only (admin); model and system prompt can be overridden per user.

- `LLM_API_KEY` — an API key is required (env or Settings); `createLLMClient()` throws without one, so every translate request 502s until it is set.
- `LLM_PROVIDER` — `openai-compatible` (default), `anthropic`, or `custom`. `openai-compatible` and `anthropic` are implemented; `custom` is a `StubClient` that throws on use.
- `LLM_MODEL` — provider-dependent default: `gpt-4.1-mini` (openai-compatible) or `claude-opus-4-8` (anthropic).
- `LLM_BASE_URL` — provider-dependent default: `https://api.openai.com/v1` or `https://api.anthropic.com`.
- `SQLITE_PATH` — overrides the default DB path (`data/translatarr.sqlite`); env-only.

The Settings dialog can also override the system prompt (template supports `{{source}}`/`{{target}}` placeholders); the JSON schema clause is always appended server-side so output parsing keeps working.

## Architecture

Request flow: `Translator` (client component) → API route → `translation-service` → `llm-client` → provider, with results validated by Zod and optionally persisted via `chat-store`.

### Layers (`app/lib/`)

- **`translation-schema.ts`** — the contract for the whole app. The Zod `translationResponseSchema` (detected language, confidence, 2–3 ranked translation options, key-word list) defines the JSON the LLM must return and the shape stored in the DB. Changing this schema ripples to the system prompt, the stored `result_json`, and the UI.
- **`llm-client.ts`** — the `LLMClient` interface (`complete(systemPrompt, userText)`) wraps providers behind a single abstraction. `createLLMClient(settings)` takes a `ResolvedLLMSettings`; add new providers by implementing the interface and wiring them into its `switch`, replacing the relevant `StubClient`. `OpenAICompatibleClient` uses raw fetch with `response_format: json_object`; `AnthropicClient` uses the official `@anthropic-ai/sdk` with structured outputs (`messages.parse` + `zodOutputFormat(translationResponseSchema)`), so its responses are schema-guaranteed JSON. Because of that helper, `translation-schema.ts` imports from `zod/v4` (the v4 API shipped inside zod 3.25+); the API routes still use classic `zod`.
- **`db.ts`** — shared lazy `better-sqlite3` connection and all migrations (chats, chat_turns, app_settings, users, sessions, user_settings; conditional `ALTER TABLE` adds `chats.user_id`).
- **`auth.ts` / `user-store.ts`** — scrypt password hashing, cookie sessions (`getSessionUser`), and user CRUD (`claimOrphanChats` adopts pre-auth chats during setup).
- **`settings-store.ts` / `settings-types.ts`** — instance overrides (`app_settings`) and per-user prefs (`user_settings`), plus `resolveLLMSettings(userId)` (user → instance → env → default) and the redacted `SettingsView` served to the UI (the API key is never returned to the client; non-admins don't see instance overrides at all).
- **`translation-service.ts`** — builds the system prompt that pins the LLM to the schema, calls the client, strips code fences, and `parse`s against the schema. Retries **once** on `MalformedLLMResponseError` (schema/JSON failures); any other error bubbles up. This is the only module that knows how to turn raw text into a `TranslationResponse`.
- **`languages.ts`** — the supported-language registry plus the special `auto` (auto-detect) source. `isSupportedLanguage` gates all API input; `auto` is valid as a source but rejected as a target.
- **`chat-store.ts`** — synchronous `better-sqlite3` access. Lazily opens the DB, runs idempotent `CREATE TABLE IF NOT EXISTS` migrations on first use (WAL mode, foreign keys on), and maps snake_case rows to camelCase types. Tables: `chats` and `chat_turns` (cascade-deleted). `addTurn` stores the translation as JSON and auto-titles a chat from its first turn.
- **`chat-types.ts`** — camelCase API/UI types (`ChatSummary`, `ChatTurn`, `ChatDetail`).

### API routes (`app/api/`)

All routes (except auth) require a session. Chat data is scoped to the session user.

- `GET /api/auth/me` — current user, or 401 with `needsSetup` flag; `POST /api/auth/setup` — create the first admin (403 once any user exists); `POST /api/auth/login` / `POST /api/auth/logout`.
- `GET|POST /api/users`, `DELETE /api/users/[userId]` — admin-only user management (cannot delete self; duplicate username → 409).
- `POST /api/translate` — stateless one-off translation (no persistence).
- `GET|POST /api/chats` — list / create the user's chats.
- `GET|PATCH|DELETE /api/chats/[chatId]` — fetch a chat; `PATCH {action:"clear"}` wipes turns; `PATCH {action:"rename", title}` renames it; `DELETE` removes it.
- `POST /api/chats/[chatId]/turns` — translate **and** persist a turn to the chat.
- `GET|PUT /api/settings` — per-user prefs (model/systemPrompt) + effective view; admins also see the instance section. `PUT /api/settings/instance` — admin-only instance overrides. PUT semantics per field: omitted = unchanged, `null`/empty = clear, value = set.

All routes validate input with Zod and share an error convention: `400` invalid input, `401` unauthenticated, `403` forbidden, `404` missing chat/user, `409` conflict, `422` malformed LLM output (`MalformedLLMResponseError`), `502` provider failure.

### Frontend

Design language ("documents on a translator's desk"): dark ink-green chrome with warm paper cards for translated content and the composer; vermilion accent, jade/gold secondary. Fonts via `next/font` in `layout.tsx`: Bricolage Grotesque (UI, `--font-ui`), Newsreader (translated text, `--font-serif`), JetBrains Mono (metadata stamps, `--font-mono`). All tokens are CSS variables in `globals.css`; keep new UI on those tokens.

`app/components/auth-gate.tsx` wraps everything: it checks the session and renders the login form, the first-run admin-setup form, or the app. `app/components/translator.tsx` is a single large `"use client"` component holding all UI state; it receives the session user (for the sidebar user badge / logout and to show admin settings sections). `settings-dialog.tsx` has per-user preference fields plus admin-only instance and user-management (`user-admin.tsx`) sections. It debounces a live-preview translation (`DEBOUNCE_MS`, against `/api/translate`) while the user types, and "sending" persists a turn to the active chat. `app/page.tsx` and `app/layout.tsx` are thin shells. `MAX_CHARS` (12000) is duplicated between the client and the route schemas — keep them in sync.

## Conventions

- TypeScript `strict` is on; keep `bun run typecheck` clean.
- Codebase style is camelCase for variables/functions and PascalCase for types/components (TS/React idiom), which differs from the snake_case preference in global instructions — match the existing code here.
- DB columns are snake_case and mapped to camelCase at the `chat-store` boundary; do not leak snake_case past that layer.
- Let errors bubble to the route handlers, which own the HTTP error mapping.
