/**
 * Supported language codes, mirrored from the server's language registry.
 *
 * `LanguageCode` (in `models.ts`) is the generated union; the constant below is
 * the runtime list for callers that need to enumerate or validate codes. The
 * server is still the source of truth and validates every request, so an
 * out-of-date client only loses the static hint, never correctness.
 */

import type { LanguageCode } from "./models";

/** The auto-detect pseudo-source. */
export const AUTO_DETECT = "auto" as const;

/** Concrete language codes accepted as a translation target (no auto-detect). */
export const SUPPORTED_LANGUAGE_CODES = [
    "en", "ar", "yue", "zh", "cs", "nl", "fi", "fr", "de", "el",
    "he", "hu", "id", "it", "ja", "km", "ko", "mn", "fa", "pl",
    "pt", "ro", "ru", "es", "sv", "tl", "th", "uk", "vi",
] as const;

/** A concrete target language (the `LanguageCode` union minus `auto`). */
export type TargetLang = Exclude<LanguageCode, "auto">;

/** A source language, or "auto" to let the server detect it. */
export type SourceLang = LanguageCode;
