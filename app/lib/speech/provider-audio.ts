/**
 * Server-side speech provider calls (OpenAI-compatible audio endpoints).
 *
 * Mirrors the role `llm-client.ts` plays for translation: the speech API
 * routes own auth/validation/HTTP error mapping, this module owns the
 * upstream requests. Errors bubble to the caller.
 */

import { ProviderError, providerErrorFromResponse } from "../provider-error";
import type { ResolvedSpeechSettings } from "../settings-types";

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function unreachableError(baseUrl: string, error: unknown): ProviderError {
  return new ProviderError({
    message: `Could not reach the speech provider at ${baseUrl}.`,
    kind: "network",
    detail: error instanceof Error ? error.message : String(error),
  });
}

function requireApiKey(settings: ResolvedSpeechSettings): string {
  if (!settings.apiKey) {
    throw new Error("Speech provider API key is not configured.");
  }

  return settings.apiKey;
}

/**
 * Transcribes an audio blob via `POST {baseUrl}/audio/transcriptions`.
 * Omit `language` (or pass undefined) to let the model auto-detect.
 */
export async function transcribeAudio(
  settings: ResolvedSpeechSettings,
  file: Blob,
  filename: string,
  language?: string,
): Promise<string> {
  const apiKey = requireApiKey(settings);
  const form = new FormData();
  form.append("file", file, filename);
  form.append("model", settings.sttModel);

  if (language) {
    form.append("language", language);
  }

  let response: Response;

  try {
    response = await fetch(`${normalizeBaseUrl(settings.baseUrl)}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } catch (error) {
    throw unreachableError(settings.baseUrl, error);
  }

  if (!response.ok) {
    throw await providerErrorFromResponse(response);
  }

  const payload = (await response.json()) as { text?: string };

  if (typeof payload.text !== "string") {
    throw new ProviderError({
      message: "The transcription response did not include text.",
      kind: "unknown",
      status: response.status,
    });
  }

  return payload.text;
}

/**
 * Synthesizes speech via `POST {baseUrl}/audio/speech` and returns the successful
 * upstream response so the route can stream the audio body through. Throws a
 * `ProviderError` when the provider is unreachable or rejects the request.
 */
export async function synthesizeAudio(
  settings: ResolvedSpeechSettings,
  text: string,
  voice?: string,
): Promise<Response> {
  const apiKey = requireApiKey(settings);
  let response: Response;

  try {
    response = await fetch(`${normalizeBaseUrl(settings.baseUrl)}/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: settings.ttsModel,
        voice: voice ?? settings.ttsVoice,
        input: text,
        response_format: "mp3",
      }),
    });
  } catch (error) {
    throw unreachableError(settings.baseUrl, error);
  }

  if (!response.ok || !response.body) {
    throw await providerErrorFromResponse(response);
  }

  return response;
}
