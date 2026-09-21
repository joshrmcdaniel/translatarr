# Upcoming release

This draft covers the [Unreleased changes](CHANGELOG.md#unreleased).

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

- Added `bun run test:ui` and 13 Playwright regression tests for the web UI. Tests use mocked APIs without calling a translation provider.
- Web UI validation passed: TypeScript checks, production build, and all 13 browser tests, including composer layout checks at widths from 320 to 1024 pixels.
