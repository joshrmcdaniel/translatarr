# AUTO-GENERATED FILE — DO NOT EDIT.
#
# Pydantic models for the Translatarr API, rendered from
# clients/python/openapi.json (dumped from the server's Zod schemas in app/lib).
# Regenerate with: clients/python/scripts/regenerate.sh

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


class Error(BaseModel):
    error: str
    code: Annotated[
        str | None, Field(description='Provider error code, when applicable.')
    ] = None


class Ok(BaseModel):
    ok: Literal[True]


class KeyWord(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    source: Annotated[
        str,
        Field(
            description='A meaningful word or phrase exactly as it appears in the source text.',
            min_length=1,
        ),
    ]
    target: Annotated[
        str,
        Field(
            description='Its counterpart in this specific translation option.',
            min_length=1,
        ),
    ]
    romanization: Annotated[
        str | None,
        Field(
            description='Romanization of target when it is written in a non-Latin script; otherwise null.'
        ),
    ]


class Translation(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    text: Annotated[
        str,
        Field(
            description='The translation itself, in the output language.', min_length=1
        ),
    ]
    romanization: Annotated[
        str | None,
        Field(
            description='Romanization of text when it is written in a non-Latin script (pinyin, romaji, etc.); otherwise null.'
        ),
    ]
    source_equivalent: Annotated[
        str,
        Field(
            alias='sourceEquivalent',
            description='Back-translation of text into the source language so the user can verify the meaning.',
            min_length=1,
        ),
    ]
    register_: Annotated[
        str | None,
        Field(
            alias='register',
            description="Formality of this option's phrasing: formal, polite, neutral, casual, intimate, or vulgar/slang, with the language's native politeness or speech-level term in parentheses when one exists. Casual means relaxed but clean; phrasing with profanity or crude/sexual vocabulary is vulgar/slang; sexually familiar talk between partners is intimate.",
        ),
    ] = None
    tone: Annotated[
        str | None,
        Field(
            description="Attitude or emotional coloring of this option's phrasing — a separate axis from register's formality. Prefer one of: playful, teasing, mocking, affectionate, flirtatious, sarcastic, angry, urgent, somber, excited; coin a more precise single word when none fits. Omit entirely when the phrasing is emotionally neutral."
        ),
    ] = None
    key_words: Annotated[
        list[KeyWord],
        Field(
            alias='keyWords',
            description='Complete glossary for this option, in source order: every meaningful word or phrase of the source text mapped to its counterpart in this option (omit only pure function words).',
        ),
    ]


class TranslationResponse(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    detected_source_language: Annotated[
        str,
        Field(
            alias='detectedSourceLanguage',
            description='Code of the language the input text is actually written in (e.g. "en", "zh").',
            min_length=2,
        ),
    ]
    confidence: Annotated[
        float,
        Field(
            description='Confidence in the language detection, from 0 to 1.',
            ge=0.0,
            le=1.0,
        ),
    ]
    translations: Annotated[
        list[Translation],
        Field(
            description='2-3 natural translation options, ranked best-first.',
            max_length=3,
            min_length=2,
        ),
    ]
    key_words: Annotated[
        list[KeyWord],
        Field(
            alias='keyWords',
            description='Legacy shared glossary; always return an empty array — each translation option carries its own keyWords.',
        ),
    ]


class ChatSummary(BaseModel):
    id: str
    title: str
    source_lang: Annotated[
        Literal[
            'en',
            'ar',
            'yue',
            'zh',
            'cs',
            'nl',
            'fi',
            'fr',
            'de',
            'el',
            'he',
            'hu',
            'id',
            'it',
            'ja',
            'km',
            'ko',
            'mn',
            'fa',
            'pl',
            'pt',
            'ro',
            'ru',
            'es',
            'sv',
            'tl',
            'th',
            'uk',
            'vi',
            'auto',
        ],
        Field(
            alias='sourceLang',
            description='A supported language code, or "auto" for source detection.',
        ),
    ]
    target_lang: Annotated[
        Literal[
            'en',
            'ar',
            'yue',
            'zh',
            'cs',
            'nl',
            'fi',
            'fr',
            'de',
            'el',
            'he',
            'hu',
            'id',
            'it',
            'ja',
            'km',
            'ko',
            'mn',
            'fa',
            'pl',
            'pt',
            'ro',
            'ru',
            'es',
            'sv',
            'tl',
            'th',
            'uk',
            'vi',
            'auto',
        ],
        Field(
            alias='targetLang',
            description='A supported language code, or "auto" for source detection.',
        ),
    ]
    created_at: Annotated[datetime, Field(alias='createdAt')]
    updated_at: Annotated[datetime, Field(alias='updatedAt')]


class ChatTurn(BaseModel):
    id: str
    chat_id: Annotated[str, Field(alias='chatId')]
    text: str
    source_lang: Annotated[
        Literal[
            'en',
            'ar',
            'yue',
            'zh',
            'cs',
            'nl',
            'fi',
            'fr',
            'de',
            'el',
            'he',
            'hu',
            'id',
            'it',
            'ja',
            'km',
            'ko',
            'mn',
            'fa',
            'pl',
            'pt',
            'ro',
            'ru',
            'es',
            'sv',
            'tl',
            'th',
            'uk',
            'vi',
            'auto',
        ],
        Field(
            alias='sourceLang',
            description='A supported language code, or "auto" for source detection.',
        ),
    ]
    target_lang: Annotated[
        Literal[
            'en',
            'ar',
            'yue',
            'zh',
            'cs',
            'nl',
            'fi',
            'fr',
            'de',
            'el',
            'he',
            'hu',
            'id',
            'it',
            'ja',
            'km',
            'ko',
            'mn',
            'fa',
            'pl',
            'pt',
            'ro',
            'ru',
            'es',
            'sv',
            'tl',
            'th',
            'uk',
            'vi',
            'auto',
        ],
        Field(
            alias='targetLang',
            description='A supported language code, or "auto" for source detection.',
        ),
    ]
    result: TranslationResponse
    selected_option: Annotated[
        int,
        Field(
            alias='selectedOption',
            description='Index into result.translations of the chosen option.',
            ge=0,
        ),
    ]
    created_at: Annotated[datetime, Field(alias='createdAt')]
    parent_id: Annotated[
        str | None,
        Field(alias='parentId', description='Parent turn id; null for a root turn.'),
    ]
    branch_index: Annotated[int, Field(alias='branchIndex')]
    branch_count: Annotated[int, Field(alias='branchCount')]
    sibling_ids: Annotated[list[str], Field(alias='siblingIds')]


class ChatDetail(ChatSummary):
    turns: list[ChatTurn]


class ApiKey(BaseModel):
    id: str
    user_id: Annotated[str, Field(alias='userId')]
    name: str
    prefix: Annotated[
        str, Field(description='Leading characters of the token, for display.')
    ]
    created_at: Annotated[datetime, Field(alias='createdAt')]
    last_used_at: Annotated[datetime | None, Field(alias='lastUsedAt')]
    expires_at: Annotated[datetime | None, Field(alias='expiresAt')]


class CreatedApiKey(BaseModel):
    api_key: Annotated[ApiKey, Field(alias='apiKey')]
    token: Annotated[str, Field(description='The plaintext token, shown only once.')]
