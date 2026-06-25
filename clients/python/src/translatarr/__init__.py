"""Python client for the Translatarr API.

Synchronous and asynchronous clients over the documented REST endpoints, with
pydantic response models generated from the server's OpenAPI spec.

    from translatarr import TranslatarrClient

    with TranslatarrClient("https://translatarr.example", token="tra_…") as tra:
        result = tra.translate("Good morning", source_lang="en", target_lang="ja")
        print(result.translations[0].text)
"""

from __future__ import annotations

from ._errors import (
    APIError,
    AuthenticationError,
    ConflictError,
    ForbiddenError,
    InvalidRequestError,
    MalformedResponseError,
    NotFoundError,
    ProviderError,
    TranslatarrError,
)
from ._models import (
    ApiKey,
    ChatDetail,
    ChatSummary,
    ChatTurn,
    CreatedApiKey,
    KeyWord,
    Translation,
    TranslationResponse,
)
from .aio import AsyncTranslatarrClient
from .client import TranslatarrClient
from .languages import AUTO_DETECT, SUPPORTED_LANGUAGE_CODES, SourceLang, TargetLang

__version__ = "0.1.0"

__all__ = [
    "__version__",
    # clients
    "TranslatarrClient",
    "AsyncTranslatarrClient",
    # models
    "ApiKey",
    "ChatDetail",
    "ChatSummary",
    "ChatTurn",
    "CreatedApiKey",
    "KeyWord",
    "Translation",
    "TranslationResponse",
    # languages
    "AUTO_DETECT",
    "SUPPORTED_LANGUAGE_CODES",
    "SourceLang",
    "TargetLang",
    # errors
    "TranslatarrError",
    "APIError",
    "InvalidRequestError",
    "AuthenticationError",
    "ForbiddenError",
    "NotFoundError",
    "ConflictError",
    "MalformedResponseError",
    "ProviderError",
]
