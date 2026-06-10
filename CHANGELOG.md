## Translatarr v0.1.1

**Mobile overhaul: a real app-shell layout on phones.**

### Fixed

- **Whole-page scrolling on mobile.** The shell was sized with `100vh`, which on mobile browsers includes the space behind the collapsible URL bar, so the document overflowed and the entire page scrolled. The shell now uses `100dvh` (with a `vh` fallback), only the timeline scrolls, and `overscroll-behavior` stops rubber-band scrolling on the chrome.
- **Cramped mobile layout.** The sidebar previously stacked above the conversation at up to 240 px tall, leaving almost no room for the timeline. Spacing, control heights, and the composer are also tightened on small screens so the conversation gets the majority of the viewport.
- Settings dialog now caps its height against the dynamic viewport (`100dvh`), so it can't extend behind the URL bar.
- **Missing romanization.** Some non-Latin-script translations (notably Korean) came back without romanization. The server now appends a hard requirement to every system prompt — custom templates included: any translation option, back-translation, or glossary entry in a non-Latin script must carry romanization in that language's standard scheme.
- **Undefined register labels.** The `register` field was never defined in the prompt, so labels were model improvisation. It is now defined language-agnostically as the formality/speech level of each option's phrasing (formal, polite, neutral, casual, intimate, or vulgar/slang, plus the language's native speech-level term where one exists) — and explicitly not a content-appropriateness rating.

### Added

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
