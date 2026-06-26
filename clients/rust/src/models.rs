//! Clean re-exports of the generated serde models.
//!
//! `generated.rs` is rendered from the server's OpenAPI spec; this module
//! surfaces the types callers actually use under stable names (hiding the
//! generated `Error`/`Ok` body shapes and the typify `error` helper module).
//! Because every type resolves to a generated one, the models cannot drift from
//! what the server returns.

pub use crate::generated::{
    ApiKey, ChatDetail, ChatSummary, ChatTurn, CreatedApiKey, KeyWord, LanguageCode, Translation,
    TranslationResponse,
};
