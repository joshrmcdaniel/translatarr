/**
 * TypeScript client for the Translatarr API.
 *
 * A single Promise-based client over the documented REST endpoints, with types
 * generated from the server's OpenAPI spec.
 *
 *     import { TranslatarrClient } from "@joshrmcdaniel/translatarr-client";
 *
 *     const tra = new TranslatarrClient("https://translatarr.example", { token: "tra_…" });
 *     const result = await tra.translate("Good morning", { sourceLang: "en", targetLang: "ja" });
 *     console.log(result.translations[0].text);
 */

export const VERSION = "0.1.0";

export { TranslatarrClient } from "./client";
export type { TranslatarrClientOptions, AudioInput } from "./client";

export type {
    ApiKey,
    ChatDetail,
    ChatSummary,
    ChatTurn,
    CreatedApiKey,
    KeyWord,
    LanguageCode,
    Translation,
    TranslationResponse,
} from "./models";

export { AUTO_DETECT, SUPPORTED_LANGUAGE_CODES } from "./languages";
export type { SourceLang, TargetLang } from "./languages";

export {
    APIError,
    AuthenticationError,
    ConflictError,
    ForbiddenError,
    InvalidRequestError,
    MalformedResponseError,
    NotFoundError,
    ProviderError,
    TranslatarrError,
} from "./errors";
