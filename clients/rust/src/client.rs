//! The async Translatarr API client.
//!
//! A single Promise-free, `async` client over `reqwest`. Authenticate with a
//! personal API key (`Authorization: Bearer <token>`, minted under Settings →
//! API keys) or, for a browser-derived session, the `translatarr_session`
//! cookie value.

use chrono::{DateTime, Utc};
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, COOKIE};
use reqwest::{multipart, Client, Method};
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::time::Duration;

use crate::core;
use crate::error::{Error, Result};
use crate::models::{
    ApiKey, ChatDetail, ChatSummary, CreatedApiKey, LanguageCode, TranslationResponse,
};

const DEFAULT_TIMEOUT: Duration = Duration::from_secs(30);

/// Options for constructing a [`TranslatarrClient`].
///
/// At least one of `token` / `session_cookie` is required.
#[derive(Debug, Default, Clone)]
pub struct ClientOptions {
    /// Personal API key (`tra_…`).
    pub token: Option<String>,
    /// Browser `translatarr_session` cookie value, as an alternative to `token`.
    pub session_cookie: Option<String>,
    /// Per-request timeout (default 30s).
    pub timeout: Option<Duration>,
}

impl ClientOptions {
    /// Authenticate with a personal API key.
    pub fn with_token(token: impl Into<String>) -> Self {
        Self { token: Some(token.into()), ..Self::default() }
    }

    /// Authenticate with a browser session cookie value.
    pub fn with_session_cookie(cookie: impl Into<String>) -> Self {
        Self { session_cookie: Some(cookie.into()), ..Self::default() }
    }
}

/// Optional inputs to [`TranslatarrClient::transcribe`].
#[derive(Debug, Clone)]
pub struct TranscribeOptions {
    /// File name reported to the server (default `audio.webm`).
    pub filename: String,
    /// MIME type of the clip, when known.
    pub content_type: Option<String>,
    /// Source language hint for the transcriber.
    pub language: Option<LanguageCode>,
}

impl Default for TranscribeOptions {
    fn default() -> Self {
        Self { filename: "audio.webm".to_owned(), content_type: None, language: None }
    }
}

enum Body {
    None,
    Json(Value),
    Multipart(multipart::Form),
}

/// An async client for a Translatarr instance.
///
/// ```no_run
/// use translatarr_client::{ClientOptions, LanguageCode, TranslatarrClient};
///
/// # async fn run() -> translatarr_client::Result<()> {
/// let tra = TranslatarrClient::new(
///     "https://translatarr.example",
///     ClientOptions::with_token("tra_…"),
/// )?;
/// let result = tra
///     .translate("Good morning", LanguageCode::En, LanguageCode::Ja, None)
///     .await?;
/// println!("{}", result.translations[0].text);
/// # Ok(())
/// # }
/// ```
#[derive(Debug, Clone)]
pub struct TranslatarrClient {
    http: Client,
    base_url: String,
}

impl TranslatarrClient {
    /// Build a client for `base_url` with the given auth/options.
    pub fn new(base_url: impl Into<String>, options: ClientOptions) -> Result<Self> {
        if options.token.is_none() && options.session_cookie.is_none() {
            return Err(Error::Config(
                "provide either token or session_cookie to authenticate".to_owned(),
            ));
        }

        let mut headers = HeaderMap::new();
        headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
        if let Some(token) = &options.token {
            let mut value = HeaderValue::from_str(&format!("Bearer {token}"))
                .map_err(|err| Error::Config(err.to_string()))?;
            value.set_sensitive(true);
            headers.insert(AUTHORIZATION, value);
        }
        if let Some(cookie) = &options.session_cookie {
            let value = HeaderValue::from_str(&format!("translatarr_session={cookie}"))
                .map_err(|err| Error::Config(err.to_string()))?;
            headers.insert(COOKIE, value);
        }

        let http = Client::builder()
            .default_headers(headers)
            .timeout(options.timeout.unwrap_or(DEFAULT_TIMEOUT))
            .build()?;

        Ok(Self { http, base_url: base_url.into().trim_end_matches('/').to_owned() })
    }

    async fn send(&self, method: Method, path: &str, body: Body) -> Result<reqwest::Response> {
        let mut request = self.http.request(method, format!("{}{path}", self.base_url));
        request = match body {
            Body::None => request,
            Body::Json(value) => request.json(&value),
            Body::Multipart(form) => request.multipart(form),
        };

        let response = request.send().await?;
        let status = response.status();
        if status.is_client_error() || status.is_server_error() {
            let text = response.text().await.unwrap_or_default();
            return Err(Error::from_response(status.as_u16(), &text));
        }
        Ok(response)
    }

    async fn request_json<T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        body: Body,
    ) -> Result<T> {
        Ok(self.send(method, path, body).await?.json::<T>().await?)
    }

    fn turn_path(chat_id: &str, turn_id: &str) -> String {
        format!(
            "/api/chats/{}/turns/{}",
            core::encode_segment(chat_id),
            core::encode_segment(turn_id),
        )
    }

    // --- translation -----------------------------------------------------

    /// Translate `text` without persisting it. Pass `chat_id` to borrow that
    /// chat's recent turns as disambiguation context; the result is still not
    /// stored.
    pub async fn translate(
        &self,
        text: &str,
        source_lang: LanguageCode,
        target_lang: LanguageCode,
        chat_id: Option<&str>,
    ) -> Result<TranslationResponse> {
        let body = core::translate_body(text, &source_lang, &target_lang, chat_id);
        self.request_json(Method::POST, "/api/translate", Body::Json(body)).await
    }

    // --- chats -----------------------------------------------------------

    /// List the caller's chats, newest first.
    pub async fn list_chats(&self) -> Result<Vec<ChatSummary>> {
        let env: core::ChatsEnvelope =
            self.request_json(Method::GET, "/api/chats", Body::None).await?;
        Ok(env.chats)
    }

    /// Create an empty chat for a language pair.
    pub async fn create_chat(
        &self,
        source_lang: LanguageCode,
        target_lang: LanguageCode,
        title: Option<&str>,
    ) -> Result<ChatDetail> {
        let body = core::create_chat_body(&source_lang, &target_lang, title);
        let env: core::ChatEnvelope =
            self.request_json(Method::POST, "/api/chats", Body::Json(body)).await?;
        Ok(env.chat)
    }

    /// Fetch a chat together with its ordered turns.
    pub async fn get_chat(&self, chat_id: &str) -> Result<ChatDetail> {
        let path = format!("/api/chats/{}", core::encode_segment(chat_id));
        let env: core::ChatEnvelope = self.request_json(Method::GET, &path, Body::None).await?;
        Ok(env.chat)
    }

    /// Rename a chat.
    pub async fn rename_chat(&self, chat_id: &str, title: &str) -> Result<ChatDetail> {
        let path = format!("/api/chats/{}", core::encode_segment(chat_id));
        let body = core::rename_chat_body(title);
        let env: core::ChatEnvelope =
            self.request_json(Method::PATCH, &path, Body::Json(body)).await?;
        Ok(env.chat)
    }

    /// Delete every turn in a chat, keeping the chat itself.
    pub async fn clear_chat(&self, chat_id: &str) -> Result<ChatDetail> {
        let path = format!("/api/chats/{}", core::encode_segment(chat_id));
        let env: core::ChatEnvelope = self
            .request_json(Method::PATCH, &path, Body::Json(core::clear_chat_body()))
            .await?;
        Ok(env.chat)
    }

    /// Delete a chat and all of its turns.
    pub async fn delete_chat(&self, chat_id: &str) -> Result<()> {
        let path = format!("/api/chats/{}", core::encode_segment(chat_id));
        self.send(Method::DELETE, &path, Body::None).await?;
        Ok(())
    }

    // --- turns -----------------------------------------------------------

    /// Translate `text` and append it to a chat as a new turn. Supply `result`
    /// (a [`TranslationResponse`] already obtained for this exact text and
    /// language pair) to persist it without a second LLM call.
    pub async fn add_turn(
        &self,
        chat_id: &str,
        text: &str,
        source_lang: LanguageCode,
        target_lang: LanguageCode,
        result: Option<&TranslationResponse>,
    ) -> Result<ChatDetail> {
        let path = format!("/api/chats/{}/turns", core::encode_segment(chat_id));
        let body = core::create_turn_body(text, &source_lang, &target_lang, result);
        let env: core::ChatEnvelope =
            self.request_json(Method::POST, &path, Body::Json(body)).await?;
        Ok(env.chat)
    }

    /// Record which translation option (0-based) the user chose for a turn.
    pub async fn select_option(
        &self,
        chat_id: &str,
        turn_id: &str,
        option: u32,
    ) -> Result<ChatDetail> {
        let path = Self::turn_path(chat_id, turn_id);
        let body = core::select_option_body(option);
        let env: core::ChatEnvelope =
            self.request_json(Method::PATCH, &path, Body::Json(body)).await?;
        Ok(env.chat)
    }

    /// Re-run a turn's translation, optionally with edited `text`, as a new branch.
    pub async fn retranslate_turn(
        &self,
        chat_id: &str,
        turn_id: &str,
        text: Option<&str>,
    ) -> Result<ChatDetail> {
        let path = Self::turn_path(chat_id, turn_id);
        let body = core::retranslate_body(text);
        let env: core::ChatEnvelope =
            self.request_json(Method::PATCH, &path, Body::Json(body)).await?;
        Ok(env.chat)
    }

    /// Switch the chat's active branch to the sibling version at this turn.
    pub async fn switch_branch(&self, chat_id: &str, turn_id: &str) -> Result<ChatDetail> {
        let path = Self::turn_path(chat_id, turn_id);
        let env: core::ChatEnvelope = self
            .request_json(Method::PATCH, &path, Body::Json(core::switch_branch_body()))
            .await?;
        Ok(env.chat)
    }

    // --- speech ----------------------------------------------------------

    /// Transcribe an audio clip (≤ 15 MB) to text via the speech provider.
    pub async fn transcribe(&self, audio: Vec<u8>, options: TranscribeOptions) -> Result<String> {
        let mut part = multipart::Part::bytes(audio).file_name(options.filename);
        if let Some(content_type) = options.content_type {
            part = part.mime_str(&content_type)?;
        }
        let mut form = multipart::Form::new().part("file", part);
        if let Some(language) = &options.language {
            form = form.text("language", core::language_str(language));
        }
        let env: core::TextEnvelope = self
            .request_json(Method::POST, "/api/speech/transcribe", Body::Multipart(form))
            .await?;
        Ok(env.text)
    }

    /// Synthesize `text` to MP3 audio bytes via the speech provider.
    pub async fn synthesize(
        &self,
        text: &str,
        lang: LanguageCode,
        voice: Option<&str>,
    ) -> Result<Vec<u8>> {
        let body = core::synthesize_body(text, &lang, voice);
        let response = self.send(Method::POST, "/api/speech/synthesize", Body::Json(body)).await?;
        Ok(response.bytes().await?.to_vec())
    }

    // --- API keys --------------------------------------------------------

    /// List the caller's API keys (metadata only, never the secrets).
    pub async fn list_keys(&self) -> Result<Vec<ApiKey>> {
        let env: core::KeysEnvelope =
            self.request_json(Method::GET, "/api/keys", Body::None).await?;
        Ok(env.keys)
    }

    /// Mint an API key. The plaintext token is returned only here, once.
    pub async fn create_key(
        &self,
        name: &str,
        expires_at: Option<DateTime<Utc>>,
    ) -> Result<CreatedApiKey> {
        let body = core::create_key_body(name, expires_at);
        self.request_json(Method::POST, "/api/keys", Body::Json(body)).await
    }

    /// Revoke one of the caller's API keys.
    pub async fn revoke_key(&self, key_id: &str) -> Result<()> {
        let path = format!("/api/keys/{}", core::encode_segment(key_id));
        self.send(Method::DELETE, &path, Body::None).await?;
        Ok(())
    }
}
