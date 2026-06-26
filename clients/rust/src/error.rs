//! Error type mapping Translatarr's HTTP error convention to Rust.
//!
//! The API answers every failure with a JSON `{error, code?}` body and a status
//! code from a small fixed set (see the project's API docs). [`Error`] turns
//! those into typed variants so callers can `match` on the failure mode instead
//! of inspecting status codes themselves.

use serde::Deserialize;
use std::fmt;

/// A structured error response returned by the server.
#[derive(Debug, Clone)]
pub struct ApiError {
    /// The HTTP status code.
    pub status: u16,
    /// The server's machine-readable code, when present (mainly on provider failures).
    pub code: Option<String>,
    /// The human-readable error message.
    pub message: String,
}

impl fmt::Display for ApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "HTTP {}: {}", self.status, self.message)
    }
}

/// Every error this client can return.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// 400 — the request was malformed or failed input validation.
    #[error("invalid request: {0}")]
    InvalidRequest(ApiError),
    /// 401 — missing or invalid credentials.
    #[error("authentication failed: {0}")]
    Authentication(ApiError),
    /// 403 — authenticated but not allowed to perform this action.
    #[error("forbidden: {0}")]
    Forbidden(ApiError),
    /// 404 — the chat, turn, or key does not exist (or isn't the caller's).
    #[error("not found: {0}")]
    NotFound(ApiError),
    /// 409 — the request conflicts with existing state (e.g. duplicate name).
    #[error("conflict: {0}")]
    Conflict(ApiError),
    /// 422 — the LLM returned output that did not match the expected schema.
    #[error("malformed response: {0}")]
    MalformedResponse(ApiError),
    /// 502 — the upstream LLM or speech provider failed.
    #[error("provider error: {0}")]
    Provider(ApiError),
    /// Any other HTTP error status.
    #[error("api error: {0}")]
    Api(ApiError),
    /// The client was constructed without credentials.
    #[error("client configuration error: {0}")]
    Config(String),
    /// A transport-level failure (connection, timeout, decoding).
    #[error(transparent)]
    Transport(#[from] reqwest::Error),
}

#[derive(Deserialize)]
struct ErrorBody {
    error: Option<String>,
    code: Option<String>,
}

impl Error {
    /// Build the mapped error from a failed response's status and raw body.
    pub(crate) fn from_response(status: u16, body: &str) -> Self {
        let parsed: Option<ErrorBody> = serde_json::from_str(body).ok();
        let code = parsed.as_ref().and_then(|b| b.code.clone());
        let message = parsed
            .and_then(|b| b.error)
            .filter(|m| !m.is_empty())
            .unwrap_or_else(|| {
                if body.is_empty() {
                    format!("HTTP {status}")
                } else {
                    body.to_owned()
                }
            });
        let api = ApiError { status, code, message };
        match status {
            400 => Error::InvalidRequest(api),
            401 => Error::Authentication(api),
            403 => Error::Forbidden(api),
            404 => Error::NotFound(api),
            409 => Error::Conflict(api),
            422 => Error::MalformedResponse(api),
            502 => Error::Provider(api),
            _ => Error::Api(api),
        }
    }
}

/// Convenience alias for results returned by this crate.
pub type Result<T> = std::result::Result<T, Error>;
