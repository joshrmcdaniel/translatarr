/**
 * Request body schemas for the routes documented in the OpenAPI spec, on the
 * `zod/v4` API so they can be turned into JSON Schema via `z.toJSONSchema`.
 *
 * These are the single source of truth shared by the route handlers (which
 * `parse` against them) and `openapi.ts` (which renders them into the spec), so
 * the documented request contracts can never drift from what the routes accept.
 * Language fields are real enums built from the supported-language registry, so
 * the spec lists every valid code and invalid codes are rejected at parse time.
 */

import { z } from "zod/v4";
import { autoDetectLanguage, languages, type LanguageCode } from "./languages";

const MAX_TEXT_CHARS = 12000;
const MAX_TTS_CHARS = 4096;

const supportedCodes = languages.map((language) => language.code);

/** A concrete target language (no auto-detect). */
export const targetLangSchema = z.enum(supportedCodes as [LanguageCode, ...LanguageCode[]]);

/** A source language, or `auto` to detect it. */
export const sourceLangSchema = z.enum([autoDetectLanguage.code, ...supportedCodes]);

export const translateBodySchema = z.object({
  text: z.string().trim().min(1).max(MAX_TEXT_CHARS),
  sourceLang: sourceLangSchema,
  targetLang: targetLangSchema,
  chatId: z.string().optional().describe("Borrow this chat's recent turns as context; the result is not persisted."),
});

export const createChatBodySchema = z.object({
  title: z.string().trim().max(80).optional(),
  sourceLang: sourceLangSchema,
  targetLang: targetLangSchema,
});

export const updateChatBodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("clear") }),
  z.object({ action: z.literal("rename"), title: z.string().trim().min(1).max(80) }),
]);

export const createTurnBodySchema = z.object({
  text: z.string().trim().min(1).max(MAX_TEXT_CHARS),
  sourceLang: sourceLangSchema,
  targetLang: targetLangSchema,
  result: z
    .unknown()
    .optional()
    .describe("Optional precomputed TranslationResponse for this exact text, persisted without a second LLM call."),
});

export const updateTurnBodySchema = z.union([
  z.object({ selectedOption: z.number().int().min(0) }),
  z.object({ action: z.literal("retranslate"), text: z.string().trim().min(1).max(MAX_TEXT_CHARS).optional() }),
  z.object({ action: z.literal("switchBranch") }),
]);

export const synthesizeBodySchema = z.object({
  text: z.string().trim().min(1).max(MAX_TTS_CHARS),
  lang: targetLangSchema,
  voice: z.string().trim().max(100).optional().describe("Provider voice id, e.g. alloy."),
});

export const createKeyBodySchema = z.object({
  name: z.string().trim().min(1).max(64),
  expiresAt: z.iso.datetime().nullish().describe("Optional future ISO 8601 expiry; omit or null for none."),
});

export type TranslateBody = z.infer<typeof translateBodySchema>;
export type CreateChatBody = z.infer<typeof createChatBodySchema>;
export type UpdateChatBody = z.infer<typeof updateChatBodySchema>;
export type CreateTurnBody = z.infer<typeof createTurnBodySchema>;
export type UpdateTurnBody = z.infer<typeof updateTurnBodySchema>;
export type SynthesizeBody = z.infer<typeof synthesizeBodySchema>;
export type CreateKeyBody = z.infer<typeof createKeyBodySchema>;
