# @joshrmcdaniel/translatarr-client

A typed TypeScript client for the [Translatarr](../../README.md) API, with types
generated from the server's OpenAPI spec. One Promise-based client, zero runtime
dependencies (uses the platform `fetch`), works in Node 18+ and the browser.

## Install

Published to the GitHub Packages npm registry for each `v*` tag (the same tags
that release the app); the package version matches the tag. Point the scope at
the registry, then install:

```bash
# .npmrc
@joshrmcdaniel:registry=https://npm.pkg.github.com

npm install @joshrmcdaniel/translatarr-client
```

Or build straight from this repo:

```bash
cd clients/typescript && npm install && npm run build
```

## Authentication

Mint a personal API key in the web UI under **Settings → API keys** (tokens are
prefixed `tra_` and shown only once). Pass it as `token`:

```ts
import { TranslatarrClient } from "@joshrmcdaniel/translatarr-client";

const tra = new TranslatarrClient("https://translatarr.example", { token: "tra_…" });

const result = await tra.translate("Good morning", { sourceLang: "en", targetLang: "ja" });
const best = result.translations[0];
console.log(best.text, best.romanization);
```

A browser session cookie works too, via `{ sessionCookie: "…" }` instead of
`token`.

## What you can do

| Area      | Methods |
| --------- | ------- |
| Translate | `translate` |
| Chats     | `listChats`, `createChat`, `getChat`, `renameChat`, `clearChat`, `deleteChat` |
| Turns     | `addTurn`, `selectOption`, `retranslateTurn`, `switchBranch` |
| Speech    | `transcribe`, `synthesize` |
| API keys  | `listKeys`, `createKey`, `revokeKey` |

### Persisting a chat without paying for a second translation

`translate` does not store anything; `addTurn` translates *and* persists. To
avoid a duplicate LLM call, pass the `result` you already have:

```ts
const chat = await tra.createChat({ sourceLang: "en", targetLang: "ja" });
const preview = await tra.translate("Let's ship it", {
    sourceLang: "en",
    targetLang: "ja",
    chatId: chat.id,
});
const updated = await tra.addTurn(chat.id, "Let's ship it", {
    sourceLang: "en",
    targetLang: "ja",
    result: preview,
});
```

### Errors

Failures throw a subclass of `APIError`, each carrying `status`, the server's
`code` (when present), and the raw `response`:

| Error | Status |
| ----- | ------ |
| `InvalidRequestError`    | 400 |
| `AuthenticationError`    | 401 |
| `ForbiddenError`         | 403 |
| `NotFoundError`          | 404 |
| `ConflictError`          | 409 |
| `MalformedResponseError` | 422 |
| `ProviderError`          | 502 |

```ts
import { NotFoundError } from "@joshrmcdaniel/translatarr-client";

try {
    await tra.getChat("does-not-exist");
} catch (error) {
    if (error instanceof NotFoundError) {
        // ...
    }
}
```

## Development

The OpenAPI types in `src/_schema.ts` are **generated** from the server's
OpenAPI document — do not edit them by hand; the named aliases in `src/models.ts`
re-export them under stable names. To regenerate after the API schema changes:

```bash
cd clients/typescript
npm install
npm run regenerate
```

The script dumps the spec via `bun scripts/dump-openapi.ts` (the same document
served at `/api/docs/openapi.json`) and runs `openapi-typescript` over it. Only
`src/_schema.ts` is committed, so the client builds and installs without a
running server; `openapi.json` is a regenerated, gitignored artifact.
