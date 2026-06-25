"""Transport-agnostic request building, response parsing, and serialization.

Both `TranslatarrClient` and `AsyncTranslatarrClient` are thin shells over httpx;
everything that does not touch the wire lives here so the two clients cannot
drift from one another. Request bodies are assembled as camelCase dicts (the API
contract), responses are validated into the generated pydantic models, and the
translation-result round-trip is handled with care for the schema's mix of
optional and nullable fields.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import cast

from ._models import ApiKey, ChatDetail, ChatSummary, CreatedApiKey, TranslationResponse

JsonObject = dict[str, object]


def _without_none(values: JsonObject) -> JsonObject:
    """Drop keys whose value is None (omitted fields mean "unchanged"/"unset")."""
    return {key: value for key, value in values.items() if value is not None}


def _expiry_to_iso(value: str | datetime | None) -> str | None:
    """Render an API-key expiry as a UTC ISO 8601 string with a `Z` suffix.

    The server validates expiries as RFC 3339 UTC. A `str` is passed through
    untouched; a naive `datetime` is assumed to be UTC.
    """
    if value is None or isinstance(value, str):
        return value

    moment = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def result_to_payload(result: TranslationResponse | JsonObject) -> JsonObject:
    """Serialize a translation result for the turns route's optional `result`.

    The server re-validates this against the translation schema, where
    `register`/`tone` are optional (and reject an explicit null) while
    `romanization` is nullable (must be present, may be null). A plain dump emits
    `register`/`tone` as null and fails validation, so they are dropped when
    absent; `romanization` is left in place. A dict is trusted as-is.
    """
    if not isinstance(result, TranslationResponse):
        return result

    data = result.model_dump(by_alias=True)
    for option in data["translations"]:
        for absent_when_unset in ("register", "tone"):
            if option.get(absent_when_unset) is None:
                option.pop(absent_when_unset, None)
    return data


# --- request bodies -------------------------------------------------------

def translate_body(text: str, source_lang: str, target_lang: str, chat_id: str | None) -> JsonObject:
    return _without_none(
        {"text": text, "sourceLang": source_lang, "targetLang": target_lang, "chatId": chat_id}
    )


def create_chat_body(source_lang: str, target_lang: str, title: str | None) -> JsonObject:
    return _without_none({"sourceLang": source_lang, "targetLang": target_lang, "title": title})


def rename_chat_body(title: str) -> JsonObject:
    return {"action": "rename", "title": title}


def create_turn_body(
    text: str,
    source_lang: str,
    target_lang: str,
    result: TranslationResponse | JsonObject | None,
) -> JsonObject:
    body: JsonObject = {"text": text, "sourceLang": source_lang, "targetLang": target_lang}
    if result is not None:
        body["result"] = result_to_payload(result)
    return body


def select_option_body(option: int) -> JsonObject:
    return {"selectedOption": option}


def retranslate_body(text: str | None) -> JsonObject:
    return _without_none({"action": "retranslate", "text": text})


def synthesize_body(text: str, lang: str, voice: str | None) -> JsonObject:
    return _without_none({"text": text, "lang": lang, "voice": voice})


def create_key_body(name: str, expires_at: str | datetime | None) -> JsonObject:
    return _without_none({"name": name, "expiresAt": _expiry_to_iso(expires_at)})


CLEAR_CHAT_BODY: JsonObject = {"action": "clear"}
SWITCH_BRANCH_BODY: JsonObject = {"action": "switchBranch"}


# --- response readers -----------------------------------------------------

def read_translation(payload: JsonObject) -> TranslationResponse:
    return TranslationResponse.model_validate(payload)


def read_chat(payload: JsonObject) -> ChatDetail:
    return ChatDetail.model_validate(payload["chat"])


def read_chats(payload: JsonObject) -> list[ChatSummary]:
    chats = cast("list[object]", payload["chats"])
    return [ChatSummary.model_validate(item) for item in chats]


def read_keys(payload: JsonObject) -> list[ApiKey]:
    keys = cast("list[object]", payload["keys"])
    return [ApiKey.model_validate(item) for item in keys]


def read_created_key(payload: JsonObject) -> CreatedApiKey:
    return CreatedApiKey.model_validate(payload)


def read_text(payload: JsonObject) -> str:
    text = payload["text"]
    assert isinstance(text, str)
    return text
