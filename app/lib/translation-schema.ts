import { z } from "zod/v4";

export const keyWordSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  romanization: z.string().nullable(),
});

export const translationOptionSchema = z.object({
  text: z.string().min(1),
  romanization: z.string().nullable(),
  sourceEquivalent: z.string().min(1),
  register: z.string().optional(),
  keyWords: z.array(keyWordSchema).default([]),
});

export const translationResponseSchema = z.object({
  detectedSourceLanguage: z.string().min(2),
  confidence: z.number().min(0).max(1),
  translations: z.array(translationOptionSchema).min(2).max(3),
  /** Legacy shared glossary; modern responses carry keyWords per option. */
  keyWords: z.array(keyWordSchema).default([]),
});

export type TranslationResponse = z.infer<typeof translationResponseSchema>;
export type TranslationOption = z.infer<typeof translationOptionSchema>;
export type KeyWord = z.infer<typeof keyWordSchema>;
