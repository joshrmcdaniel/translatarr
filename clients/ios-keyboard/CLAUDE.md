# iOS keyboard client

A system-wide iOS keyboard that translates in place via this instance's `/api/translate`. Lives in this repo as a sibling client — not a separate repository.

Root `CLAUDE.md` — repo-wide conventions take precedence over this file.

## Read before writing any code

- Root `CLAUDE.md` — repo-wide conventions take precedence over this file.
- `clients/` — other clients already exist here. Match their layout, naming, and README style rather than inventing a new one.
- `app/api/translate/` and the chat/turn routes — the route handlers are the source of truth for request and response shapes. The README's curl example is abbreviated.
- `/api/docs/openapi.json` from a running instance, if one is reachable.

Do not guess a field name. If a shape is still ambiguous after reading the handler, stop and ask.

## Goal

Reduce app-switching. The user is typing in Messages/WhatsApp/etc., hits one key, and the text they just typed is replaced by its translation.

## In scope

- Keyboard extension: type, translate, insert. Alternate options selectable.
- Container app: settings, plus a paste-a-blob text field that does the same call without the text-proxy gymnastics.
- Rolling conversational context, so pronouns and formality carry between turns.

## Out of scope — the web UI already does these, don't rebuild them

- Chat list / rename / delete
- Glossary browser, romanization panel, back-translation display
- Voice, live preview, admin settings, user management

Glossary and back-translation come back in the response payload. Ignore them in v1. They are the best part of translatarr on a desktop and completely wrong for a 216pt strip.

## Layout

```
clients/ios-keyboard/
  Translatarr.xcodeproj
  TranslatarrKit/        shared framework: API client, config, models
  Translatarr/           container app (settings + paste field)
  TranslatarrKeyboard/   keyboard extension
  README.md
  CLAUDE.md              this file
```

`TranslatarrKit` is embedded in both targets. Anything touching the network or config belongs there, never duplicated into the extension.

Zero third-party dependencies. URLSession + Codable. No SPM packages, no CocoaPods. The extension runs under a tight jetsam budget and every dependency is memory you don't get back.

## Server contract

Verify all of this against the handlers before implementing.

Auth is a personal API key minted at Settings → API keys, sent as `Authorization: Bearer tra_…`. A key acts as its owner, scoped to that user's chats.

```
POST /api/translate
{ "text": "...", "sourceLang": "auto", "targetLang": "es" }
```

`sourceLang` may be `auto`; `targetLang` must be concrete. The response is the structured translation JSON: ranked options best-first, each with register, tone, back-translation, and a key-word glossary.

Model the response in `TranslatarrKit` as `Codable` structs with everything optional except the option text, and decode leniently — the server owns this shape and it will change under you.

### Context

Two modes exist; the keyboard wants the second.

1. Stateless — plain `/api/translate`. Each call isolated, no context.
2. Chat-backed — create a chat, append turns. Context carries across messages.

Strategy: one long-lived chat per language pair. Create on first use, cache the chat ID in the App Group keyed by `"<source>-<target>"`, append every translation as a turn. Rolling context for free, zero chat-management UI, and the turns show up in the web app afterward. If context drifts, the user clears that chat from the web UI and the cached ID still resolves.

Check whether `/api/translate` accepts a chat ID directly or whether this needs `create_chat` + `add_turn` as separate calls. That decides whether one translation is one round trip or two, which matters a great deal at keyboard latency.

## Config and storage

One App Group (e.g. `group.<reverse-dns>.translatarr`) shared by both targets.

- `UserDefaults(suiteName:)` — host URL, source/target language, cached chat IDs.
- Keychain for the `tra_…` token, with a keychain access group so the extension can read it. Never `UserDefaults`, never the app bundle, never source.

The container app writes, the keyboard only reads. The keyboard needs no settings UI.

## Keyboard extension specifics

This is where the time actually goes. Everything above is the easy part.

**Full Access is mandatory.** `NSExtension → NSExtensionAttributes → RequestsOpenAccess = YES`. Without it the extension has no network at all. The user enables it by hand in Settings; the container app should detect the disabled state (requests failing instantly with no connection) and say so plainly rather than letting the keyboard look broken.

**Text replacement.** Order of preference for getting the input text:

1. `textDocumentProxy.selectedText` when non-nil — cleanest, no deletion math.
2. `documentContextBeforeInput`, back to the last sentence boundary.

Then `deleteBackward()` once per `Character` (grapheme cluster — not unicode scalar, not UTF-16 unit; emoji and combining marks will break a naive count), re-read `documentContextBeforeInput` to confirm the deletion landed where you expected, then `insertText`.

Track what you inserted so the alternate-option chips can swap it without re-deriving anything from the proxy.

Known limitation to design around rather than fight: `documentContextBeforeInput` is truncated by many host apps and unavailable in secure fields. Cap the translate unit at a sentence or paragraph; don't promise whole-field translation.

**Latency.** LLM round trip is 1–3s, so there is no as-you-type preview. Explicit translate key, inline loading state in the options strip, ~8s timeout, cancel the in-flight request on any new keystroke.

**Height.** Keep `UIInputViewController`'s default root view so UIKit can negotiate the extension's size with its host. A required root height constraint and `preferredContentSize` request room for the full key grid, toolbar, and accessory strip. `KeyboardLayoutMetrics` adapts row heights to phone width, landscape, and iPad. Keycaps are inset inside full-row touch targets; translation controls stay above the grid so they do not narrow the space bar. Internal row heights remain below required priority to tolerate transient presentation sizes. The reading pane fills the same area as the grid.

**Width.** iOS owns the extension's root frame. Preserve its default view and autoresizing; only the constrained content inside opts out of autoresizing-mask translation. Turning translation off on the root can collapse the entire keyboard to its minimum content width. Layout tests must exercise host-assigned frames and host resizing without adding a test-only width constraint to the keyboard.

**Typing.** `KeyboardTypingAssistant` uses `UITextChecker` and the supplementary `UILexicon` for local spelling suggestions, conservative boundary corrections, and text shortcuts. It also handles correction undo and double-space periods. The controller handles automatic capitalization and caps lock. Preferences live in `Config` and the container app's Typing section; the source language selects the spelling dictionary. Respect host field traits and revalidate document identity and cursor context before applying suggestions or asynchronous translations. The native predictive engine, swipe typing, and dictation are not supplied by these APIs.

**Emoji.** The smiley key uses `handleInputModeList(from:with:)` for all touch events, just like the globe. Holding opens Apple's keyboard selector, where the user can choose Emoji; tapping advances to the keyboard chosen by iOS. Public extension APIs cannot enumerate enabled keyboards or switch directly to a named keyboard. Use Apple's Emoji keyboard, without a custom emoji panel. Keep the smiley key at least 44 points wide and the space bar at least half the bottom row. When iOS requires an extension-provided globe key, it lives in the toolbar.

**Validation.** The `Translatarr` scheme includes `TranslatarrKeyboardTests`: typing behavior with a text-proxy double, plus real UIKit geometry checks and light/dark render attachments. `TranslatarrExtensionUITests` enables the installed extension through the simulator's Settings and verifies portrait and landscape key geometry; use an iPhone simulator in English. Run `xcodebuild -project Translatarr.xcodeproj -scheme Translatarr -destination 'platform=iOS Simulator,name=iPhone 17 Pro Max' CODE_SIGNING_ALLOWED=NO test` after regenerating the project. Full Access and host-app behavior still need on-device testing.

## Networking

The instance is homelab-hosted and reached over a WireGuard tunnel.

- WireGuard on iOS is a system-wide `NetworkExtension` tunnel. Extension traffic routes through it with no per-app work.
- Do not implement a custom `URLSessionDelegate` trust override. TLS trust comes from the CA root installed as a configuration profile with full trust enabled under Certificate Trust Settings. An untrusted cert is a device configuration problem to fix on the device. A trust bypass inside a keyboard extension that sees everything the user types is not acceptable, in debug builds either.
- Short connect timeout (~2s). With on-demand VPN rules the tunnel may be down at the moment the keyboard fires.
- Distinguish the failure modes and surface them distinctly: `cannotConnectToHost`, `timedOut`, `notConnectedToInternet`, `serverCertificateUntrusted`, HTTP 401. "Can't reach server — VPN?" and "Bad API key" call for different user actions. A keyboard that spins forever is miserable; fail fast and visibly.
- If the host is a name, it must resolve through the tunnel's DNS. Accept a raw tunnel IP as the host value.
- Reading a reply (translating what the other person wrote, so the user can understand it) needs the clipboard, but never call `UIPasteboard.general` programmatically — iOS 16+ shows an "Allow Paste" consent prompt on every such read from a third-party keyboard, with no API to suppress it, since Apple added this specifically to stop keyboards from silently sniffing the clipboard. Instead hand the user an editable field and let them invoke the system Edit Menu's own Paste (long-press → Paste): that's `UIResponderStandardEditActions.paste(_:)` driven directly by the user's own gesture, and isn't gated by the same prompt.

## Monolith hygiene

The point of keeping this in-repo is one version, one changelog, one place where the API contract changes. Preserve that:

- Don't modify `app/` to suit the client. If the API genuinely needs something new, make it additive and backwards-compatible, update the OpenAPI spec, and note it in `CHANGELOG.md`. The web UI and MCP consumers must not break.
- `bun run typecheck` is the primary correctness gate for anything TypeScript. There is no test suite.
- Add `clients/ios-keyboard/` to `.dockerignore`. Xcode projects and DerivedData have no business in the image build context.
- CI: `.github/workflows/docker.yml` builds and pushes on every push to `main`. Add path filters to both it and any new iOS workflow, so an iOS-only commit doesn't rebuild and republish the container image.
- If the docker workflow triggers on `v*` tags, pick a separate tag prefix for app releases (`ios-v*`) before tagging anything.

## Milestones

1. **Skeleton** — three targets, App Group, keychain helper, settings screen writing host + token. Nothing else.
2. **Paste path** — container app text field → `/api/translate` → render options. Proves auth, TLS, VPN reachability, and decoding with none of the proxy complexity. Do not start the extension until this works end to end.
3. **Extension v1** — key grid, translate key, single language pair read from settings, insert top option. Stateless calls.
4. **Options strip** — chips for options 2–3, swapping the inserted text.
5. **Context** — per-pair chat, turns appended.
6. **Failure states** — the error taxonomy above, surfaced in the strip.

Stop after each milestone and confirm before moving on.

## Signing

Personal use, sideloaded. A paid developer account gives a year of provisioning; the free tier expires every 7 days, which will not be tolerable for a keyboard you depend on daily. App Store submission is out of scope — a Full Access keyboard pointed at a user-supplied server invites privacy review questions, and there's no reviewer-facing demo instance.
