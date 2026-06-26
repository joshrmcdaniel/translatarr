//! Request-body building, response envelopes, and serialization helpers.
//!
//! `TranslatarrClient` is a thin shell over `reqwest`; everything that does not
//! touch the wire lives here. Request bodies are assembled as camelCase JSON
//! (the API contract) and response envelopes are deserialized into the generated
//! models. The translation-result round-trip needs no manual cleanup: the
//! generated `Translation` derives `skip_serializing_if` on `register`/`tone`
//! (optional, omitted when absent) while keeping `romanization` (nullable), so a
//! plain `serde_json` dump already matches what the server re-validates.

use chrono::{DateTime, SecondsFormat, Utc};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::models::{ApiKey, ChatDetail, ChatSummary, LanguageCode, TranslationResponse};

/// Serialize a language code to its wire string (e.g. `LanguageCode::En` -> "en").
pub(crate) fn language_str(lang: &LanguageCode) -> String {
    serde_json::to_value(lang)
        .ok()
        .and_then(|v| v.as_str().map(str::to_owned))
        .unwrap_or_default()
}

/// Percent-encode a single URL path segment (RFC 3986 unreserved set passes through).
pub(crate) fn encode_segment(segment: &str) -> String {
    let mut out = String::with_capacity(segment.len());
    for byte in segment.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char);
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

// --- request bodies -------------------------------------------------------

pub(crate) fn translate_body(
    text: &str,
    source_lang: &LanguageCode,
    target_lang: &LanguageCode,
    chat_id: Option<&str>,
) -> Value {
    let mut body = json!({ "text": text, "sourceLang": source_lang, "targetLang": target_lang });
    if let Some(id) = chat_id {
        body["chatId"] = json!(id);
    }
    body
}

pub(crate) fn create_chat_body(
    source_lang: &LanguageCode,
    target_lang: &LanguageCode,
    title: Option<&str>,
) -> Value {
    let mut body = json!({ "sourceLang": source_lang, "targetLang": target_lang });
    if let Some(title) = title {
        body["title"] = json!(title);
    }
    body
}

pub(crate) fn rename_chat_body(title: &str) -> Value {
    json!({ "action": "rename", "title": title })
}

pub(crate) fn create_turn_body(
    text: &str,
    source_lang: &LanguageCode,
    target_lang: &LanguageCode,
    result: Option<&TranslationResponse>,
) -> Value {
    let mut body = json!({ "text": text, "sourceLang": source_lang, "targetLang": target_lang });
    if let Some(result) = result {
        body["result"] = serde_json::to_value(result).expect("TranslationResponse is serializable");
    }
    body
}

pub(crate) fn select_option_body(option: u32) -> Value {
    json!({ "selectedOption": option })
}

pub(crate) fn retranslate_body(text: Option<&str>) -> Value {
    let mut body = json!({ "action": "retranslate" });
    if let Some(text) = text {
        body["text"] = json!(text);
    }
    body
}

pub(crate) fn synthesize_body(text: &str, lang: &LanguageCode, voice: Option<&str>) -> Value {
    let mut body = json!({ "text": text, "lang": lang });
    if let Some(voice) = voice {
        body["voice"] = json!(voice);
    }
    body
}

pub(crate) fn create_key_body(name: &str, expires_at: Option<DateTime<Utc>>) -> Value {
    let mut body = json!({ "name": name });
    if let Some(expires_at) = expires_at {
        body["expiresAt"] = json!(expires_at.to_rfc3339_opts(SecondsFormat::Secs, true));
    }
    body
}

pub(crate) fn clear_chat_body() -> Value {
    json!({ "action": "clear" })
}

pub(crate) fn switch_branch_body() -> Value {
    json!({ "action": "switchBranch" })
}

// --- response envelopes ---------------------------------------------------

#[derive(Deserialize)]
pub(crate) struct ChatEnvelope {
    pub chat: ChatDetail,
}

#[derive(Deserialize)]
pub(crate) struct ChatsEnvelope {
    pub chats: Vec<ChatSummary>,
}

#[derive(Deserialize)]
pub(crate) struct KeysEnvelope {
    pub keys: Vec<ApiKey>,
}

#[derive(Deserialize)]
pub(crate) struct TextEnvelope {
    pub text: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn turn_result_omits_absent_register_tone_but_keeps_null_romanization() {
        // A response where the top option has no register/tone and null romanization.
        let response: TranslationResponse = serde_json::from_value(json!({
            "detectedSourceLanguage": "en",
            "confidence": 0.99,
            "translations": [{
                "text": "hola",
                "romanization": null,
                "sourceEquivalent": "hello",
                "keyWords": []
            }],
            "keyWords": []
        })).unwrap();

        let body = create_turn_body("hello", &LanguageCode::En, &LanguageCode::Es, Some(&response));
        let option = &body["result"]["translations"][0];
        assert!(option.get("register").is_none(), "register omitted when absent");
        assert!(option.get("tone").is_none(), "tone omitted when absent");
        assert!(option["romanization"].is_null(), "romanization present as null");
        assert_eq!(body["result"]["keyWords"], json!([]));
    }

    #[test]
    fn create_key_body_formats_expiry_with_z_suffix() {
        let when = "2026-06-26T10:00:00Z".parse::<DateTime<Utc>>().unwrap();
        let body = create_key_body("ci", Some(when));
        assert_eq!(body["expiresAt"], json!("2026-06-26T10:00:00Z"));
    }

    #[test]
    fn language_str_uses_wire_codes() {
        assert_eq!(language_str(&LanguageCode::Yue), "yue");
        assert_eq!(language_str(&LanguageCode::Auto), "auto");
    }
}
