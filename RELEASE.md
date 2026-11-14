# v0.2.3

More natural translations, request timeouts with send recovery, model tuning, web UI and iOS keyboard improvements, and an updated MCP interface. See the [full v0.2.3 changelog](CHANGELOG.md#translatarr-v023).

## Upgrading

- **Runtime:** Node.js 22 or newer is now required, matching the Docker image.
- **MCP integrations:** `list_chats` now returns a paged object instead of an array, `get_chat` returns paged turn previews, and `add_turn` returns a save acknowledgement with the new turn ID. Follow continuation IDs and use `get_turn` for full saved translations. See the [MCP response contract](README.md#mcp-use-translatarr-from-an-ai-assistant).
- **MCP transport:** Connect to `/api/mcp`. Existing 2025 Streamable HTTP clients remain supported; the legacy `/api/sse` endpoint is no longer served.
- **Model default:** The built-in OpenAI-compatible default is now `gpt-6-luna`. Existing user, instance, and environment model overrides still take precedence.

## Translation

- The shared prompt favors idiomatic phrasing and natural sentence structure while preserving meaning, appropriate politeness, and formal or technical style. The guidance applies across languages and models.
- Glossaries group idioms and implicit meaning into phrases after composing the translation. Alternatives vary wording within the appropriate register instead of manufacturing a formal/casual ladder.
- Slang and profanity retain their social intensity. Romanization follows each translation or glossary entry's own script, independently of the back-translation.
- An optional tone selector offers localized presets and custom descriptions. The source tone is preserved when no tone is selected. The optional `tone` input is also available through the REST API, MCP tools, and all three client SDKs.

## Reliability and settings

- Provider requests time out after two minutes by default, with a configurable limit and a clear error. Failed sends check whether the turn was saved before restoring the draft, avoiding duplicate submissions.
- Admins can tune temperature, output-token limits, request timeouts, and supported gateway reasoning settings in Settings or through environment variables. Reasoning fields are omitted when unset.
- API requests now produce access logs with status and duration; failed requests include error information. The health check stays out of the access log.

## MCP

- Tools expose explicit operation annotations, concise server instructions, searchable descriptions, and parameter limits that remain visible when clients strip schema keywords.
- Results include matching structured data and JSON text. Errors include recovery guidance without exposing provider internals.
- Chat history uses previews and continuation IDs. Results have a 24,000-byte UTF-8 budget; `get_turn` retrieves large saved translations in lossless JSON chunks. Oversized unsaved translations return an explicit recovery error.
- Translation context loads only the latest six turns. The server uses mcp-handler 2.3 and MCP server SDK 2.4 with Zod object schemas and authentication on each request.

## Web UI

- **Mobile composer:** Send, Mic, and Clear stay visible on narrow screens when a custom tone is selected.
- **Multilingual typing:** Confirming an IME candidate with Enter no longer sends an unfinished message or submits a chat title.
- **Chat navigation:** Delayed loads, translations, and regenerations respect the latest chat selection. Failed background submissions are available when their original chat is reopened.
- **Live previews:** Changing chat notes, branches, or selected translations refreshes the preview. Sending reuses a preview only when its input and chat context still match.
- **Text formatting:** Translations, back-translations, and voice transcripts retain their line breaks and paragraphs.
- **Keyboard access:** Settings, Chat notes, and Voice conversation contain focus, close with Escape, and return focus to the opening control.
- **Chat titles:** Submitting or leaving an unchanged or blank title closes the rename editor. Canceling an edit does not interfere with the next rename.

## iOS keyboard

- Larger keys, staggered letter rows, a wider space bar, and separate controls for translation and suggestions.
- Correct keyboard width and updated height after rotation, including landscape.
- Hold the new smiley key to choose Emoji from the iOS keyboard switcher; tapping switches to the next enabled keyboard.
- On-device spelling suggestions, autocorrection with Delete to undo, capitalization, caps lock, and double-space periods, with typing preferences in Settings.
- Sentence and trailing-space handling for translation, with document and cursor checks before replacing text.

## Development

- Updated to Next.js 16.4, React 19.3, TypeScript 7, Zod 4.6, Anthropic SDK 1.8, better-sqlite3 13.1, and current browser-test and API-doc dependencies. Bun and npm lockfiles are synchronized.
- Added `bun run test:mcp` with 13 tests covering discovery, schema validation, authentication, pagination, active branches, Unicode output, both MCP protocol generations, and Anthropic structured-output parsing. Tests use temporary SQLite and stubbed providers.
- Added `bun run test:ui` and 13 Playwright regression tests for the web UI, including composer layout checks at widths from 320 to 1024 pixels. Tests use mocked APIs without calling a translation provider and launch the app's normal development command.
- Added `bun run eval:translations` with 20 synthetic Korean, Japanese, Spanish, and French cases, saved-prompt replay, repeated samples, and dry runs. Reports support qualitative review alongside structural checks. Live evaluations incur provider charges without changing settings or chats.
- Removed the unsupported `next lint` command. Use `bun run typecheck`, the MCP/browser suites, and `bun run build` for validation.
- Validation passed: TypeScript checks, production build, all 13 MCP tests, and all 13 browser tests. The dependency audit reported no vulnerabilities.
