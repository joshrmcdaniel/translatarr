"""Supported language codes, mirrored from the server's language registry.

These `Literal` aliases give callers autocomplete and type-checking on the
`source_lang`/`target_lang` arguments. The server is still the source of truth
and validates every request, so an out-of-date client only loses the static
hint, never correctness.
"""

from __future__ import annotations

from typing import Literal

AUTO_DETECT = "auto"

#: Concrete language codes accepted as a translation target (no auto-detect).
SUPPORTED_LANGUAGE_CODES: tuple[str, ...] = (
    "en", "ar", "yue", "zh", "cs", "nl", "fi", "fr", "de", "el",
    "he", "hu", "id", "it", "ja", "km", "ko", "mn", "fa", "pl",
    "pt", "ro", "ru", "es", "sv", "tl", "th", "uk", "vi",
)

#: A concrete target language.
TargetLang = Literal[
    "en", "ar", "yue", "zh", "cs", "nl", "fi", "fr", "de", "el",
    "he", "hu", "id", "it", "ja", "km", "ko", "mn", "fa", "pl",
    "pt", "ro", "ru", "es", "sv", "tl", "th", "uk", "vi",
]

#: A source language, or "auto" to let the server detect it.
SourceLang = Literal[
    "auto",
    "en", "ar", "yue", "zh", "cs", "nl", "fi", "fr", "de", "el",
    "he", "hu", "id", "it", "ja", "km", "ko", "mn", "fa", "pl",
    "pt", "ro", "ru", "es", "sv", "tl", "th", "uk", "vi",
]
