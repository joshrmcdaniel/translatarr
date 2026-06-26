# <img width="24px" src="./app/icon.svg" alt="Translatarr"></img> Translatarr
Structured translations for your homelab. Provider-agnostic LLM translation app with ranked options, glossaries, and back-translation, built on Next.js.


**This is completely vibe-coded. It solves an problem I had. It works fine for me**

![Translatarr chat view: a translation card with ranked options, romanization, back-translation, and a key-word glossary](docs/screenshot-chat.png)

## Features

- **Ranked translation options** — every request returns 2–3 natural translations, best first, each tagged with its register (formal → vulgar/slang, with native politeness terms) and tone (playful, mocking, flirtatious, …)
- **Context-aware** — within a chat, recent turns are sent along as context, so pronouns, word senses, names, and formality carry across messages ("She starts on Monday" knows who *she* is)
- **Faithful by design** — translates slang, profanity, and sensitive text at full intensity and labels it, instead of softening or censoring it
- **Back-translation** — each option includes a translation back into the source language so you can verify the meaning before you send it to someone
- **Key-word glossary** — a per-option breakdown mapping each meaningful word or phrase of your input to its counterpart in the translation
- **Romanization** — pinyin, romaji, etc. for non-Latin scripts, on both the translations and the glossary
- **Chats** — translation sessions are persisted to SQLite; live preview translates as you type, sending saves the turn
- **Provider-agnostic** — works with any OpenAI-compatible API (OpenAI, OpenRouter, local llama.cpp/Ollama gateways, …) or the Anthropic API
- **Multi-user** — admin and user roles; the admin configures the instance provider/credentials, each user can override the model and system prompt for themselves
- **API keys** — mint personal bearer tokens to call the translation API from scripts or other apps (optional expiry, revocable any time)
- **MCP server** — a built-in Model Context Protocol endpoint at `/api/mcp`, so AI assistants (Claude Desktop, …) can translate and manage chats as tools
- **Localized UI** — the interface is available in several languages; defaults to your browser language, switchable per user in Settings
- **PWA** — add it to your phone's home screen and it runs as a standalone app
- **29 languages** — Arabic, Cantonese, Chinese (Mandarin), Czech, Dutch, English, Finnish, French, German, Greek, Hebrew, Hungarian, Indonesian, Italian, Japanese, Khmer, Korean, Mongolian, Persian (Farsi), Polish, Portuguese, Romanian, Russian, Spanish, Swedish, Tagalog, Thai, Ukrainian, Vietnamese — plus auto-detect

## Installation

### Docker (recommended)

```shell
docker run -d \
  --name translatarr \
  -p 3000:3000 \
  -v translatarr-data:/app/data \
  ghcr.io/joshrmcdaniel/translatarr:latest
```

Or with compose:

```yaml
services:
  translatarr:
    image: ghcr.io/joshrmcdaniel/translatarr:latest
    ports:
      - "3000:3000"
    volumes:
      - translatarr-data:/app/data
    restart: unless-stopped

volumes:
  translatarr-data:
```

The SQLite database (users, chats, settings) lives in `/app/data` — keep it on a volume.

### Build from source

Requires [bun](https://bun.sh) (and a C++ toolchain for `better-sqlite3` if no prebuilt binary matches your platform).

```shell
git clone https://github.com/joshrmcdaniel/translatarr.git
cd translatarr
bun install
bun run build
bun run start        # serves on http://localhost:3000
```

Or build the image yourself: `docker build -t translatarr .`

## First-run setup

1. Open the app. The first visit shows a setup screen — create the **admin** account.
2. Open **Settings** (bottom of the sidebar) and fill in the *Instance settings* section: provider, API key, and optionally a base URL and default model. Nothing translates until an API key is set.
3. Add more accounts under **Settings → Users** if you're sharing the instance. Each user's chats are private, and users can override the model and system prompt for themselves without touching the instance defaults.

## Configuration

Everything can be configured in-app, so environment variables are optional. When set, they act as defaults that admin settings override:

| Variable | Description | Default |
| --- | --- | --- |
| `LLM_API_KEY` | API key for the provider. Required (here or in Settings) before anything translates. | — |
| `LLM_PROVIDER` | `openai-compatible` or `anthropic` | `openai-compatible` |
| `LLM_MODEL` | Model name | `gpt-5.4-mini` (openai-compatible), `claude-haiku-4-5` (anthropic) |
| `LLM_BASE_URL` | API base URL, e.g. `https://openrouter.ai/api/v1` | provider default |
| `SQLITE_PATH` | Database file location | `data/translatarr.sqlite` |
| `SPEECH_ENGINE` | Where speech runs: `browser` (Web Speech API, free) or `provider` (server-side audio API) | `browser` |
| `SPEECH_API_KEY` | API key for provider speech | reuses `LLM_API_KEY` when the LLM provider is OpenAI-compatible |
| `SPEECH_BASE_URL` | OpenAI-compatible audio API root | reuses `LLM_BASE_URL` when OpenAI-compatible, else `https://api.openai.com/v1` |
| `SPEECH_STT_MODEL` | Transcription model | `whisper-1` |
| `SPEECH_TTS_MODEL` | Text-to-speech model | `gpt-4o-mini-tts` |
| `SPEECH_TTS_VOICE` | Text-to-speech voice id | `alloy` |

Settings resolve per value as: **user preference** → **instance setting (admin)** → **environment variable** → built-in default.

The system prompt is also editable (per user or instance-wide) and supports `{{source}}`/`{{target}}` placeholders; the JSON output contract and input-handling rules are appended server-side so responses always parse.

![Settings dialog with per-user preferences and admin instance settings](docs/screenshot-settings.png)

## Usage

- Pick a source and target language (source can be *Auto-detect*), type, and send.
- Optionally enable **Live preview** (top bar) to translate as you type, after a short pause. Sending reuses the preview when the text hasn't changed, so it doesn't cost a second LLM call.
- Press **Enter** (or the ↑ button in the composer) to save the turn to the current chat — the message appears immediately while the translation is in flight.
- Translation direction is automatic within the pair: type in either language and it translates to the other one.
- Click an alternative option on a translation card to feature it; the key-word glossary follows the selected option, and on saved turns the choice is remembered and used as conversation context for follow-up messages.
- Every sent message has pencil (edit) and refresh (regenerate) buttons: edit the source text and it re-translates in place; regenerate re-rolls the translation for the same text.
- **Rename**/**Clear**/**Delete** manage the current chat from the top bar.

### Voice

- **Mic** (next to Send) dictates into the composer; **Speak** on a translation card reads it aloud.
- **Voice** (top bar) opens conversation mode: tap a language, talk, and the translation is spoken back in the other language. Each utterance is saved as a turn in the current chat.
- By default speech runs in the browser (Web Speech API). Microphone input needs Chrome, Edge, or Safari — or switch the engine to **provider** in Settings to use an OpenAI-compatible audio API (`/audio/transcriptions` + `/audio/speech`), which also covers Firefox.
- Privacy note: browser speech recognition may send audio to the browser vendor's recognition service; provider mode sends audio to the configured speech base URL.

### API access

To call Translatarr from a script or another app, mint a personal API key under **Settings → API keys** (every user can create their own; optionally set an expiry). The full token is shown **once** at creation — copy it then. Send it as a bearer token on any API route; a key acts as its owner, with that user's role and chats.

```bash
curl https://your-host/api/translate \
  -H "Authorization: Bearer tra_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"text":"Good morning","sourceLang":"en","targetLang":"es"}'
```

`sourceLang` may be `auto`; `targetLang` must be a concrete language. The response is the structured translation JSON (ranked options, glossary, romanization, back-translation). Revoke a key any time from the same screen — clients using it stop working immediately.

Interactive API reference (Swagger UI) lives at **`/api/docs`** while logged in, with the raw OpenAPI spec at `/api/docs/openapi.json`. Both require a session — they aren't public.

### MCP (use Translatarr from an AI assistant)

Translatarr exposes a [Model Context Protocol](https://modelcontextprotocol.io) server over Streamable HTTP at **`/api/mcp`**, so MCP-capable assistants (Claude Desktop, …) can translate and manage chats as tools. It authenticates with the same personal API key as the REST API, so first mint one under **Settings → API keys** — the `tra_…` token is shown once, copy it then.

**Claude Desktop / other MCP clients** — clients that only speak stdio reach the HTTP endpoint through the [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) bridge (needs Node.js). Add this to the client's MCP config — for Claude Desktop that's `claude_desktop_config.json` (**Settings → Developer → Edit Config**) — then restart it:

```json
{
  "mcpServers": {
    "translatarr": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://translatarr.example.com/api/mcp",
        "--header",
        "Authorization: Bearer tra_xxxxxxxxxxxx"
      ]
    }
  }
}
```

Available tools: `translate`, `list_chats`, `get_chat`, `create_chat`, `add_turn`, and `list_languages`. Each acts as the key's owner, scoped to that user's chats. Serve the endpoint over HTTPS (see [reverse proxy](#behind-a-reverse-proxy--pwa-install) below) for any non-localhost host.

Once it's connected (Translatarr shows up under the tools/🔌 menu), just ask in plain language and Claude picks the right tool:

> **You:** Use translatarr to translate "Where's the nearest train station?" into Japanese.
>
> **Claude:** *(calls `translate`)* Top option: 一番近い駅はどこですか？ (*ichiban chikai eki wa doko desu ka?*) — polite/neutral. Back-translation: "Where is the closest station?" …

> **You:** Start a French chat in translatarr called "Paris trip" and save a translation of "Two tickets, please."
>
> **Claude:** *(calls `create_chat`, then `add_turn`)* Created the chat and saved the turn — top option: « Deux billets, s'il vous plaît. » …

Chats you create this way are the same ones in the Translatarr web UI, so you can open them there afterward.

### Behind a reverse proxy / PWA install

Translatarr speaks plain HTTP on port 3000 and is meant to sit behind a reverse proxy (nginx, Caddy, Traefik) that terminates TLS. With HTTPS in front, **Add to Home Screen** on Android/iOS installs it as a standalone app with the 訳 icon.

## Development

```bash
bun install
bun run dev          # dev server on http://localhost:3000
bun run typecheck    # primary correctness gate (there is no test suite)
bun run lint
```

CI builds and pushes the Docker image to GHCR (`linux/amd64` + `linux/arm64`) on every push to `main` and on `v*` tags — see `.github/workflows/docker.yml`.
