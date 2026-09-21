# Translatarr keyboard

A system-wide iOS keyboard that translates in place, talking to a
[Translatarr](../../README.md) instance's `/api/translate`. Type in
Messages/WhatsApp/etc., hit translate, the text is replaced in place.

See [CLAUDE.md](CLAUDE.md) for the full design (server contract, context
strategy, keyboard-extension constraints) and the milestone plan this client
is being built against.

## Status

All six original milestones are done and confirmed working on-device:
skeleton → paste path → extension v1 → options strip → context → failure
states. Beyond that:

- Full QWERTY keyboard with numbers/symbols pages (`123` / `#+=`, matching
  the system keyboard's three-page layout), press feedback, click sound, and
  long-press-to-repeat delete.
- Roomier keys with consistent widths and staggered letter rows, a wide
  space bar, and a separate toolbar for translation, language, conversations,
  and reading replies. The keyboard requests enough height for the typing
  area plus its toolbar and suggestions; landscape uses shorter rows.
- A smiley key beside `123` uses the system keyboard switcher. Hold it and
  select **Emoji** to use Apple's emoji keyboard. A tap switches to the next
  keyboard chosen by iOS; extensions cannot jump directly to a specific
  keyboard. If Emoji is missing, add it in Settings → General → Keyboard →
  Keyboards → Add New Keyboard. The space bar stays wide.
- On-device spelling suggestions and conservative autocorrection, automatic
  capitalization, double-tap Shift for caps lock, and double-space periods.
- Reading a reply: paste (via the system Edit Menu, not `UIPasteboard`
  directly — see CLAUDE.md's Networking section for why) translates the
  other side of the conversation into your own language in a temporary
  reading pane.
- Long-press a translation-option chip for a callout with its
  back-translation and romanization.
- Switch conversation: a menu (fed by `GET /api/chats`) lets you pin a
  specific existing chat instead of the default one-chat-per-language-pair
  behavior, or go back to "Automatic".

There's no prebuilt binary — see **Install** below for why, and what to do
instead.

## Typing features

Auto-Correction, Word Suggestions, Auto-Capitalization, and Double-Space
Period are enabled by default. Change them in the container app's
**Settings → Typing**, then tap **Save**. The source language controls
spelling; `auto` uses the device language. Corrections require an available
iOS spelling dictionary and respect the host field's spelling preferences.
Email, URL, and numeric fields do not receive automatic spelling changes.

Tap a suggestion to finish a word, or the quoted original to keep your
spelling. Press Delete immediately after an automatic correction to restore
the original word. Apple's supplementary lexicon supplies personal words and
text shortcuts when available. Typing assistance runs locally.

This is a custom keyboard with basic spelling assistance. It does not inherit
Apple's full predictive engine, swipe typing, or dictation. Translation
options occupy the suggestion strip after a translation; typing brings word
suggestions back.

## Install

There's no prebuilt `.ipa`, and **CI does not publish one** (see
`.github/workflows/ios-keyboard.yml` — it only verifies the code compiles,
for the Simulator SDK, signing disabled). That's not an oversight: this
app's whole design depends on the container app and keyboard extension
sharing an App Group, and an unsigned build carries **no entitlements
information anywhere in the bundle** (entitlements only exist inside a code
signature or an `embedded.mobileprovision`, neither of which an unsigned
build produces). A re-signing tool like AltStore/SideStore would have
nothing to tell it this app needs that App Group, so it wouldn't get
granted — and since the host URL and API token are only ever set in the
container app and reach the keyboard *through* that App Group, the keyboard
would never see them. It would install, then simply never work.

The only path that actually works — for the original author and anyone else
— is building from source with your own Apple ID, so your own Xcode signing
session is the one requesting the App Group for your own account. That's
what **Build** below walks through; it's genuinely just a few minutes even
on the free tier.

## Requirements

- Xcode (full install, not just Command Line Tools)
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) — `brew install xcodegen`
- An Apple ID signed into Xcode. A free personal team works fine, App Groups
  included — the only cost is that its provisioning expires every 7 days, so
  you re-run Build & Run that often. A paid Apple Developer Program
  membership ($99/year) gets you a year of provisioning at once, worth it if
  you're relying on this daily.

Zero third-party runtime dependencies: `TranslatarrKit` is URLSession +
Codable, nothing from SPM or CocoaPods.

## Build

`Translatarr.xcodeproj` is generated from [`project.yml`](project.yml) via
XcodeGen — don't hand-edit the `.xcodeproj`, regenerate it instead:

```bash
scripts/regenerate.sh
```

Then in Xcode:

1. Open `Translatarr.xcodeproj`.
2. Select your team in **Signing & Capabilities** for all three targets
   (`Translatarr`, `TranslatarrKeyboard`, `TranslatarrKit`), or set
   `DEVELOPMENT_TEAM` in `project.yml` and regenerate.
3. The bundle ID prefix and App Group identifier (`project.yml`,
   `*.entitlements`, `AppGroup.identifier` in `TranslatarrKit`) default to
   `dev.joshrmcdaniel.translatarr` — change all of them together if you fork
   this for your own team/bundle ID.
4. Build & run `Translatarr` (the container app) on a device — keyboard
   extensions with Full Access don't work in the Simulator's network stack
   reliably; test on-device.
5. In iOS Settings → General → Keyboard → Keyboards, add "Translatarr" and
   enable **Allow Full Access** (required — see CLAUDE.md's Networking
   section for why).

## Project layout

```
clients/ios-keyboard/
  project.yml            XcodeGen spec — source of truth for the Xcode project
  Translatarr.xcodeproj  generated, gitignored — run scripts/regenerate.sh first
  TranslatarrKit/         shared framework: API client, config, keychain/App Group helpers
  Translatarr/            container app: settings screen, paste-and-translate field
  TranslatarrKeyboard/    the keyboard extension
  scripts/regenerate.sh   wraps `xcodegen generate`
```

`TranslatarrKit` is embedded in both the app and the extension; anything
touching the network or config lives there, never duplicated into the
extension target.

## Validation

After regenerating the project, run the typing and layout tests with an
installed simulator (replace the device name if needed):

```bash
xcodebuild -project Translatarr.xcodeproj -scheme Translatarr \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro Max' \
  CODE_SIGNING_ALLOWED=NO test
```

The tests cover correction undo, stale cursor/document protection, field
preferences, Unicode words, double-space periods, translation replacement
spans, and key geometry at several phone widths, including host resizing
without a forced keyboard width constraint. Light and dark keyboard
previews are attached to the layout test results. The UI test enables the
installed extension in the simulator's Settings and checks its width and
key height in portrait and landscape, switching to Apple's Emoji keyboard,
and returning to Translatarr, with screenshots attached. Use an
iPhone simulator in English for that test. Validate Full Access and typing
in your usual apps on a device as well.
