/**
 * Clean, named aliases over the generated OpenAPI schema.
 *
 * `_schema.ts` is generated from the server's spec and is shaped as
 * `components["schemas"][...]`; this module re-exports those under stable names
 * so callers import `TranslationResponse` rather than reaching into the
 * generated tree. Because every alias resolves to a generated type, the models
 * cannot drift from what the server returns.
 */

import type { components } from "./_schema";

type Schemas = components["schemas"];

/** A supported language code, or "auto" for source detection. */
export type LanguageCode = Schemas["LanguageCode"];

/** A glossary entry mapping a source word/phrase to its translated counterpart. */
export type KeyWord = Schemas["TranslationResponse"]["translations"][number]["keyWords"][number];

/** A single ranked translation option. */
export type Translation = Schemas["TranslationResponse"]["translations"][number];

/** The full structured result of a translation request. */
export type TranslationResponse = Schemas["TranslationResponse"];

/** A chat without its turns. */
export type ChatSummary = Schemas["ChatSummary"];

/** A single persisted translation turn within a chat. */
export type ChatTurn = Schemas["ChatTurn"];

/** A chat together with its ordered turns. */
export type ChatDetail = Schemas["ChatDetail"];

/** API-key metadata (never the secret token). */
export type ApiKey = Schemas["ApiKey"];

/** A freshly minted API key — the only place the plaintext `token` is returned. */
export type CreatedApiKey = Schemas["CreatedApiKey"];
