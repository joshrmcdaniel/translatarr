# translatarr-client

An async Rust client for the [Translatarr](../../README.md) API, with serde
models generated from the server's OpenAPI spec. One `async` client over
`reqwest`, TLS via `rustls` (no system OpenSSL).

## Install

Not published to crates.io (that would require a registry token; this repo keeps
a no-secrets-to-configure setup). Depend on it from git, pinned to a release tag:

```toml
[dependencies]
translatarr-client = { git = "https://github.com/joshrmcdaniel/translatarr", tag = "v1.2.3", package = "translatarr-client" }
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

Each `v*` release also attaches a packaged `.crate` to the GitHub Release for
vendoring. Requires an async runtime (the examples use `tokio`).

## Authentication

Mint a personal API key in the web UI under **Settings → API keys** (tokens are
prefixed `tra_` and shown only once). Pass it via `ClientOptions`:

```rust
use translatarr_client::{ClientOptions, LanguageCode, TranslatarrClient};

#[tokio::main]
async fn main() -> translatarr_client::Result<()> {
    let tra = TranslatarrClient::new(
        "https://translatarr.example",
        ClientOptions::with_token("tra_…"),
    )?;

    let result = tra
        .translate("Good morning", LanguageCode::En, LanguageCode::Ja, None)
        .await?;
    let best = &result.translations[0];
    println!("{} ({:?})", best.text, best.romanization);
    Ok(())
}
```

A browser session works too, via `ClientOptions::with_session_cookie("…")`.

## What you can do

| Area      | Methods |
| --------- | ------- |
| Translate | `translate` |
| Chats     | `list_chats`, `create_chat`, `get_chat`, `rename_chat`, `clear_chat`, `delete_chat` |
| Turns     | `add_turn`, `select_option`, `retranslate_turn`, `switch_branch` |
| Speech    | `transcribe`, `synthesize` |
| API keys  | `list_keys`, `create_key`, `revoke_key` |

### Persisting a chat without paying for a second translation

`translate` does not store anything; `add_turn` translates *and* persists. To
avoid a duplicate LLM call, pass the `result` you already have:

```rust
# use translatarr_client::{LanguageCode, TranslatarrClient};
# async fn run(tra: TranslatarrClient) -> translatarr_client::Result<()> {
let chat = tra.create_chat(LanguageCode::En, LanguageCode::Ja, None).await?;
let preview = tra
    .translate("Let's ship it", LanguageCode::En, LanguageCode::Ja, Some(&chat.id))
    .await?;
let chat = tra
    .add_turn(&chat.id, "Let's ship it", LanguageCode::En, LanguageCode::Ja, Some(&preview))
    .await?;
# Ok(())
# }
```

### Errors

Every fallible call returns `translatarr_client::Result<T>`. Failures map the
server's HTTP error convention to [`Error`] variants you can `match` on:

| Variant | Status |
| ------- | ------ |
| `Error::InvalidRequest`    | 400 |
| `Error::Authentication`    | 401 |
| `Error::Forbidden`         | 403 |
| `Error::NotFound`          | 404 |
| `Error::Conflict`          | 409 |
| `Error::MalformedResponse` | 422 |
| `Error::Provider`          | 502 |
| `Error::Transport`         | connection/timeout/decode |

```rust
# use translatarr_client::{Error, TranslatarrClient};
# async fn run(tra: TranslatarrClient) {
match tra.get_chat("does-not-exist").await {
    Err(Error::NotFound(api)) => eprintln!("no such chat: {}", api.message),
    _ => {}
}
# }
```

## Development

The serde models in `src/generated.rs` are **generated** from the server's
OpenAPI document — do not edit them by hand; `src/models.rs` re-exports them
under stable names. To regenerate after the API schema changes:

```bash
cargo binstall cargo-typify   # one-time tooling install (or `cargo install`)
clients/rust/scripts/regenerate.sh
```

The script dumps the spec via `bun scripts/dump-openapi.ts`, lifts its schemas
into a JSON Schema document (`scripts/openapi-to-schema.mjs`), runs
`cargo typify`, and `rustfmt`s the result. Only `src/generated.rs` is committed,
so the crate builds without a running server; `openapi.json` and `schema.json`
are regenerated, gitignored artifacts.
