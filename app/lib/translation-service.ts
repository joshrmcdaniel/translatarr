import { createLLMClient } from "./llm-client";
import { languageName } from "./languages";
import { resolveLLMSettings } from "./settings-store";
import { translationResponseSchema } from "./translation-schema";

export class MalformedLLMResponseError extends Error {}

export const defaultPromptTemplate = `You are a translation engine. Translate between {{source}} and {{target}}. Auto-detect the input language: if the input is in {{target}}, translate to {{source}}; otherwise translate to {{target}}. If the selected source language is Auto-detect, infer the source language first and translate to {{target}}; if the input is already in {{target}}, translate to a likely source language when clear. Return 2-3 natural translation options, ranked best-first. For EACH translation option, include keyWords: a complete glossary mapping every meaningful word or phrase of the source text to its counterpart in that specific option, in source order — comprehensive enough that nothing in the sentence is left unexplained (omit only pure function words with no standalone meaning). For any non-Latin-script output, include romanization (pinyin for Chinese, romaji for Japanese, etc.) on translations and keyWords alike; otherwise set romanization to null. Include sourceEquivalent, a back-translation into the source language, so the user can verify the meaning.`;

const responseFormatClause = `Respond with ONLY valid JSON matching this schema: {"detectedSourceLanguage":"string","confidence":0.0,"translations":[{"text":"string","romanization":null,"sourceEquivalent":"string","register":"string","keyWords":[{"source":"string","target":"string","romanization":null}]}]}. Do not include markdown, code fences, or commentary.`;

function buildSystemPrompt(sourceLang: string, targetLang: string, promptTemplate: string | null) {
  const instructions = (promptTemplate ?? defaultPromptTemplate)
    .replaceAll("{{source}}", `${languageName(sourceLang)} (${sourceLang})`)
    .replaceAll("{{target}}", `${languageName(targetLang)} (${targetLang})`);

  return `${instructions} ${responseFormatClause}`;
}

function stripCodeFences(raw: string) {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseTranslation(raw: string) {
  try {
    const cleaned = stripCodeFences(raw);
    const json = JSON.parse(cleaned) as unknown;
    return translationResponseSchema.parse(json);
  } catch (error) {
    throw new MalformedLLMResponseError(error instanceof Error ? error.message : "Malformed LLM JSON.");
  }
}

export async function translateText(input: { text: string; sourceLang: string; targetLang: string; userId: string }) {
  const settings = resolveLLMSettings(input.userId);
  const client = createLLMClient(settings);
  const prompt = buildSystemPrompt(input.sourceLang, input.targetLang, settings.systemPrompt);
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await client.complete(prompt, input.text);
      return parseTranslation(raw);
    } catch (error) {
      if (!(error instanceof MalformedLLMResponseError)) {
        throw error;
      }

      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new MalformedLLMResponseError("Malformed LLM JSON.");
}
