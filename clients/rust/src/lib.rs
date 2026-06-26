//! Async Rust client for the [Translatarr](https://github.com/joshrmcdaniel/translatarr) API.
//!
//! A single `async` [`TranslatarrClient`] over the documented REST endpoints,
//! with serde models generated from the server's OpenAPI spec.
//!
//! ```no_run
//! use translatarr_client::{ClientOptions, LanguageCode, TranslatarrClient};
//!
//! #[tokio::main]
//! async fn main() -> translatarr_client::Result<()> {
//!     let tra = TranslatarrClient::new(
//!         "https://translatarr.example",
//!         ClientOptions::with_token("tra_…"),
//!     )?;
//!     let result = tra
//!         .translate("Good morning", LanguageCode::En, LanguageCode::Ja, None)
//!         .await?;
//!     println!("{}", result.translations[0].text);
//!     Ok(())
//! }
//! ```

#[allow(dead_code, clippy::all)]
mod generated;

mod client;
mod core;
mod error;
pub mod models;

/// The crate version, read from `Cargo.toml` at compile time.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

pub use client::{ClientOptions, TranscribeOptions, TranslatarrClient};
pub use error::{ApiError, Error, Result};
pub use models::{
    ApiKey, ChatDetail, ChatSummary, ChatTurn, CreatedApiKey, KeyWord, LanguageCode, Translation,
    TranslationResponse,
};
