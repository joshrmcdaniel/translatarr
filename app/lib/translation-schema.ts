import { z } from "zod/v4";

export const keyWordSchema = z.object({
  source: z.string().min(1).describe("A meaningful word or phrase exactly as it appears in the source text."),
  target: z.string().min(1).describe("Its counterpart in this specific translation option."),
  romanization: z
    .string()
    .nullable()
    .describe("Romanization of target when it is written in a non-Latin script; otherwise null."),
});

export const translationOptionSchema = z.object({
  text: z.string().min(1).describe("The translation itself, in the output language."),
  romanization: z
    .string()
    .nullable()
    .describe("Romanization of text when it is written in a non-Latin script (pinyin, romaji, etc.); otherwise null."),
  sourceEquivalent: z
    .string()
    .min(1)
    .describe("Back-translation of text into the source language so the user can verify the meaning."),
  register: z
    .string()
    .optional()
    .describe(
      "Formality of this option's phrasing: formal, polite, neutral, casual, intimate, or vulgar/slang, with the language's native politeness or speech-level term in parentheses when one exists. Casual means relaxed but clean; phrasing with profanity or crude/sexual vocabulary is vulgar/slang; sexually familiar talk between partners is intimate.",
    ),
  tone: z
    .string()
    .optional()
    .describe(
      "Attitude or emotional coloring of this option's phrasing — a separate axis from register's formality. Prefer one of: playful, teasing, mocking, affectionate, flirtatious, sarcastic, angry, urgent, somber, excited; coin a more precise single word when none fits. Omit entirely when the phrasing is emotionally neutral.",
    ),
  keyWords: z
    .array(keyWordSchema)
    .default([])
    .describe(
      "Complete glossary for this option, in source order: every meaningful word or phrase of the source text mapped to its counterpart in this option (omit only pure function words).",
    ),
});

export const translationResponseSchema = z.object({
  detectedSourceLanguage: z
    .string()
    .min(2)
    .describe('Code of the language the input text is actually written in (e.g. "en", "zh").'),
  confidence: z.number().min(0).max(1).describe("Confidence in the language detection, from 0 to 1."),
  translations: z
    .array(translationOptionSchema)
    .min(2)
    .max(3)
    .describe("2-3 natural translation options, ranked best-first."),
  /** Legacy shared glossary; modern responses carry keyWords per option. */
  keyWords: z
    .array(keyWordSchema)
    .default([])
    .describe("Legacy shared glossary; always return an empty array — each translation option carries its own keyWords."),
});

export type TranslationResponse = z.infer<typeof translationResponseSchema>;
export type TranslationOption = z.infer<typeof translationOptionSchema>;
export type KeyWord = z.infer<typeof keyWordSchema>;
