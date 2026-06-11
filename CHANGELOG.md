## Translatarr v0.1.1

**Voice support — dictation, spoken translations, and a conversation mode — context-aware translations with tone labels, and a mobile overhaul.**

### Fixed

- **Input that mentions languages or translation was mistranslated.** Text like "This is the project description in mandarin" (targeting Mandarin) had "in mandarin" silently dropped — or worse, flipped the translation direction and came back in English — because the model read it as an instruction. The user text is now wrapped in `<text_to_translate>` tags and the prompt pins it as data: commands inside it are translated literally, never obeyed, and the input language is judged solely from the actual words and script, never from what the text claims about itself.
- **Sanitized translations.** Crude or sexual phrasing was softened in translation. A fidelity clause now requires full meaning, register, and intensity — no euphemisms, asterisks, omissions, refusals, or disclaimers — and the top-ranked option must match the source text's own register instead of cleaning it up (politer variants may follow as lower-ranked options).

- **Whole-page scrolling on mobile.** The shell was sized with `100vh`, which on mobile browsers includes the space behind the collapsible URL bar, so the document overflowed and the entire page scrolled. The shell now uses `100dvh`, the body is pinned (`position: fixed` + `overflow: hidden`) on small screens so the page itself can never move — including iOS standalone-PWA rubber-banding — and inner scrollers (timeline, chat list, settings) use `overscroll-behavior: contain` so a fling can't chain out to the document.
- **Cramped mobile layout.** The sidebar previously stacked above the conversation at up to 240 px tall, leaving almost no room for the timeline. Spacing, control heights, and the composer are also tightened on small screens so the conversation gets the majority of the viewport.
- Settings dialog now caps its height against the dynamic viewport (`100dvh`), so it can't extend behind the URL bar.
- **Missing romanization.** Some non-Latin-script translations (notably Korean) came back without romanization. The server now appends a hard requirement to every system prompt — custom templates included: any translation option, back-translation, or glossary entry in a non-Latin script must carry romanization in that language's standard scheme.
- **Undefined register labels.** The `register` field was never defined in the prompt, so labels were model improvisation. It is now defined language-agnostically as the formality/speech level of each option's phrasing (formal, polite, neutral, casual, intimate, or vulgar/slang, plus the language's native speech-level term where one exists), calibrated so crude phrasing is never under-labeled: *casual* means relaxed but clean, profanity or crude/sexual vocabulary is *vulgar/slang*, sexually familiar partner talk is *intimate* — and it is explicitly not a content-appropriateness rating.
- **Label spacing on collapsed option rows.** With two stamps on a row, the alternative rows spread them across the leftover width; the stamps now sit together at the right edge, matching the featured card. Also fixed the typing-indicator dots overlapping their label.

### Added

- **Context-aware translation.** Translating inside a chat now sends the last 6 turns (each original with its chosen translation) as a `<conversation_context>` block, so follow-up messages resolve correctly: pronoun referents and gender agreement ("She is so generous" → "Es muy generosa" after a turn about a neighbor), word senses (river *bank* vs. the money kind), elided nouns ("The second one" agreeing with *el té*), formality continuity in politeness-system languages, and consistent terminology across turns. Applies to sent turns, conversation mode, and live preview (`POST /api/translate` accepts an optional `chatId`, ownership-checked) — so a reused preview result carries the same context a fresh translation would. The prompt restricts the block to disambiguation only; it is never translated, echoed, or treated as instructions.
- **Tone labels.** Each translation option can now carry `tone` — the attitude of the phrasing (playful, teasing, mocking, affectionate, flirtatious, sarcastic, angry, urgent, somber, excited, or a more precise word) — as a second axis independent of `register`'s formality, so a sentence can be casual *and* mocking. Shown as a jade stamp next to the gold register stamp on every option; omitted when the phrasing is neutral.
- **Persisted option choice.** Featuring an alternative translation on a saved turn now records the choice (`chat_turns.selected_option`, via `PATCH /api/chats/[chatId]/turns/[turnId]`), so it survives reloads, is what conversation context feeds to follow-up translations, and is what conversation mode displays. Live-preview cards stay ephemeral by design; a sent turn starts at the top-ranked option.
- **Optimistic sending.** A sent message appears in the chat immediately, with an animated three-dot indicator on the assistant side while the translation is in flight. If the request fails, the pending turn is removed and the text is restored to the composer, so nothing is lost.
- **Send lives inside the composer.** The Send button is a round up-arrow inside the input bubble (with the focus ring wrapping both), so on a phone it sits right next to the text instead of below the keyboard fold. The character counter, Mic, and Clear sit in a slim row beneath; Enter still sends.
- **Schema-derived response contract.** The prompt's response-format clause is a real JSON Schema generated from the Zod schema (`z.toJSONSchema`) instead of a hand-written example, carrying per-field descriptions, value constraints, and required lists — so the contract shown to the model can never drift from what the server validates. The same field descriptions feed Anthropic structured outputs.
- **Fifteen more translation languages.** The language list grows to 29 with Czech, Dutch, Finnish, Hebrew, Hungarian, Indonesian, Khmer, Mongolian, Persian (Farsi), Polish, Portuguese, Romanian, Swedish, Tagalog, and Thai — all available in the pickers, voice features (matching BCP-47 recognition and synthesis voices), and conversation mode, with romanization on results. Hebrew is translation-only; the others also ship UI locales. RTL scripts (Arabic, Hebrew, Persian) render correctly within the existing LTR layout — no page mirroring yet.
- **Localized UI in 27 languages.** Every label, hint, status message, and language name in the interface is translated; only Hebrew and Ukrainian remain translation-only. The interface language defaults to the browser setting and each user can pin one under Settings → Your preferences → Interface language. Catalogs are typed so a missing translation is a compile error; LLM prompts and server error messages stay English. The language defaults to the browser setting (`zh-HK`/`zh-MO` map to Cantonese) and each user can pin one under Settings → Your preferences → Interface language. Catalogs are typed so a missing translation is a compile error; LLM prompts and server error messages stay English, and the Arabic locale renders in the existing LTR layout (no RTL mirroring yet).
- **Mic dictation in the composer.** A Mic button next to Send dictates into the textarea, appending live interim text as you speak. Dictated text behaves exactly like typed text — including live preview.
- **Speak buttons on translation cards.** Every translation option can be read aloud, with the voice matched to the target language (CJK languages pick CJK voices). Toggles to Stop while playing.
- **Conversation mode.** A Voice button in the top bar opens a Google-Translate-style conversation view: tap a language side, talk, recognition auto-stops on silence, the utterance is saved as a turn in the active chat (the pair reverses when you tap the target side), and the top translation is spoken back in the other language. Failed turns keep the transcript with a Retry button; blocked autoplay falls back to a manual Play button. Requires a concrete (non-auto) source language.
- **Two speech engines, resolved like LLM settings.** The default `browser` engine uses the Web Speech API — free, on-device, zero config. The optional `provider` engine records with MediaRecorder and proxies through two new authenticated routes (`POST /api/speech/transcribe`, `POST /api/speech/synthesize`) to any OpenAI-compatible audio API (`/audio/transcriptions` + `/audio/speech`). Browsers without speech recognition (Firefox) fall back to the provider engine automatically when one is configured; otherwise the mic disables with an explanatory tooltip.
- **Speech settings.** Users pick their engine in Settings → Voice; admins configure the provider (base URL, API key, transcription/speech models, voice) in Settings → Voice provider, or via `SPEECH_ENGINE`, `SPEECH_API_KEY`, `SPEECH_BASE_URL`, `SPEECH_STT_MODEL`, `SPEECH_TTS_MODEL`, and `SPEECH_TTS_VOICE` env vars. When the LLM provider is OpenAI-compatible, the speech key and base URL are reused automatically — provider speech works with zero extra config. Stored in the existing settings tables; no migration. *Privacy note: browser speech recognition may send audio to the browser vendor's recognition service; provider mode sends audio to the configured speech base URL.*
- **Hamburger chat drawer on mobile.** Chats, the New button, and the user/Settings/Log out footer now live in an off-canvas drawer that slides in from the left over a dimmed backdrop. It opens from a hamburger button in the control bar and closes when you pick a chat, create one, or tap the backdrop. Desktop keeps the persistent sidebar.
- `interactive-widget=resizes-content` viewport hint, so the on-screen keyboard on Android resizes the layout instead of covering the composer.

---

## Translatarr v0.1.0

**Provider-agnostic LLM-powered translation with structured, ranked results.**

### What is Translatarr?

Translatarr is a self-hosted translation app that uses any OpenAI-compatible or Anthropic LLM to produce rich, structured translations — not just a single best guess. Each translation returns multiple ranked options with a key-word glossary, romanization, and a back-translation so you can judge quality at a glance.

---

### Features

**Structured translations**
- 2–3 ranked translation options per request, each with a confidence score
- Per-option key-word glossary for vocabulary building
- Auto-detected source language with confidence indicator
- Back-translation for verification

**Multi-provider LLM support**
- OpenAI-compatible providers (default: `gpt-5.4-mini`, configurable base URL)
- Anthropic (`claude-haiku-4-5` default, uses structured outputs for schema-guaranteed JSON)
- API key and base URL configurable in-app or via environment variables

**Persistent translation sessions**
- Chats persist to a local SQLite database (no external dependency)
- Auto-titled from the first turn; renameable, clearable, and deletable
- Per-user chat history scoped to the session

**Multi-user with role-based access**
- Admin and user roles; first run creates the admin account via a setup screen
- Cookie-session auth (HTTP-only, 30-day TTL, scrypt-hashed passwords — no auth library dependency)
- Admins manage users via Settings → Users; deleting a user cascades to their sessions and chats

**Per-user and instance-level settings**
- Users can override the model and system prompt
- Admins set the provider, API key, base URL, and instance-level defaults
- Resolution order: user preference → admin override → env var → built-in default

**Live preview**
- Optional live-preview mode debounces translations (1 500 ms) as you type against the stateless `/api/translate` endpoint
- On send, if the preview matches the submitted text exactly, the result is reused — no duplicate LLM call

**PWA / installable**
- Installable as a standalone web app (manifest + icons included)
- 訳 seal icon with `icon-192`, `icon-512`, and a maskable variant for Android adaptive icons

**Docker**
- Multi-stage Dockerfile; published to GHCR (`ghcr.io/<owner>/translatarr`) as `latest`, `main`, `sha-…`, and semver tags
- Multi-arch: `linux/amd64` + `linux/arm64`
- SQLite stored in `/app/data` — mount a volume to persist across restarts

---

### Quick start

```bash
docker run -d -p 3000:3000 -v translatarr-data:/app/data \
  -e LLM_API_KEY=your-key \
  ghcr.io/<owner>/translatarr
```

Open `http://localhost:3000` — you'll be prompted to create the admin account on first run. See `README.md` for the full configuration reference.

---

### Configuration

| Variable | Default | Notes |
|---|---|---|
| `LLM_API_KEY` | *(required)* | Set in env or via Settings |
| `LLM_PROVIDER` | `openai-compatible` | `openai-compatible` or `anthropic` |
| `LLM_MODEL` | `gpt-5.4-mini` / `claude-haiku-4-5` | Provider-dependent |
| `LLM_BASE_URL` | Provider default | Override for local/proxy endpoints |
| `SQLITE_PATH` | `data/translatarr.sqlite` | Path inside the container |
