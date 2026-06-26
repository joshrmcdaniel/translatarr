/**
 * Transport-agnostic request building, response parsing, and serialization.
 *
 * `TranslatarrClient` is a thin shell over `fetch`; everything that does not
 * touch the wire lives here. Request bodies are assembled as camelCase objects
 * (the API contract), responses are read into the generated models, and the
 * translation-result round-trip is handled with care for the schema's mix of
 * optional and nullable fields.
 */

import type {
    ApiKey,
    ChatDetail,
    ChatSummary,
    CreatedApiKey,
    TranslationResponse,
} from "./models";

export type JsonObject = Record<string, unknown>;

/** Drop keys whose value is null/undefined (omitted fields mean "unchanged"/"unset"). */
function withoutNullish(values: JsonObject): JsonObject {
    return Object.fromEntries(Object.entries(values).filter(([, value]) => value != null));
}

/**
 * Render an API-key expiry as a UTC ISO 8601 string with a `Z` suffix.
 *
 * The server validates expiries as RFC 3339 UTC. A `string` is passed through
 * untouched; a `Date` is normalized to UTC with a `Z` suffix.
 */
function expiryToIso(value: string | Date | null | undefined): string | undefined {
    if (value == null) {
        return undefined;
    }
    if (typeof value === "string") {
        return value;
    }
    return value.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Serialize a translation result for the turns route's optional `result`.
 *
 * The server re-validates this against the translation schema, where
 * `register`/`tone` are optional (and reject an explicit null) while
 * `romanization` is nullable (must be present, may be null). Dropping
 * `register`/`tone` when absent keeps such a result valid on the round-trip.
 */
export function resultToPayload(result: TranslationResponse): JsonObject {
    const data = structuredClone(result) as TranslationResponse;
    for (const option of data.translations) {
        for (const absentWhenUnset of ["register", "tone"] as const) {
            if (option[absentWhenUnset] == null) {
                delete option[absentWhenUnset];
            }
        }
    }
    return data as unknown as JsonObject;
}

// --- request bodies -------------------------------------------------------

export function translateBody(
    text: string,
    sourceLang: string,
    targetLang: string,
    chatId: string | undefined,
): JsonObject {
    return withoutNullish({ text, sourceLang, targetLang, chatId });
}

export function createChatBody(
    sourceLang: string,
    targetLang: string,
    title: string | undefined,
): JsonObject {
    return withoutNullish({ sourceLang, targetLang, title });
}

export function renameChatBody(title: string): JsonObject {
    return { action: "rename", title };
}

export function createTurnBody(
    text: string,
    sourceLang: string,
    targetLang: string,
    result: TranslationResponse | undefined,
): JsonObject {
    const body: JsonObject = { text, sourceLang, targetLang };
    if (result !== undefined) {
        body.result = resultToPayload(result);
    }
    return body;
}

export function selectOptionBody(option: number): JsonObject {
    return { selectedOption: option };
}

export function retranslateBody(text: string | undefined): JsonObject {
    return withoutNullish({ action: "retranslate", text });
}

export function synthesizeBody(text: string, lang: string, voice: string | undefined): JsonObject {
    return withoutNullish({ text, lang, voice });
}

export function createKeyBody(name: string, expiresAt: string | Date | undefined): JsonObject {
    return withoutNullish({ name, expiresAt: expiryToIso(expiresAt) });
}

export const CLEAR_CHAT_BODY: JsonObject = { action: "clear" };
export const SWITCH_BRANCH_BODY: JsonObject = { action: "switchBranch" };

// --- response readers -----------------------------------------------------

export function readTranslation(payload: unknown): TranslationResponse {
    return payload as TranslationResponse;
}

export function readChat(payload: unknown): ChatDetail {
    return (payload as { chat: ChatDetail }).chat;
}

export function readChats(payload: unknown): ChatSummary[] {
    return (payload as { chats: ChatSummary[] }).chats;
}

export function readKeys(payload: unknown): ApiKey[] {
    return (payload as { keys: ApiKey[] }).keys;
}

export function readCreatedKey(payload: unknown): CreatedApiKey {
    return payload as CreatedApiKey;
}

export function readText(payload: unknown): string {
    return (payload as { text: string }).text;
}
