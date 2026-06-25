import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { classifyProviderStatus, ProviderError, providerErrorFromResponse } from "./provider-error";
import type { ResolvedLLMSettings } from "./settings-types";
import { translationResponseSchema } from "./translation-schema";

export interface LLMClient {
  complete(systemPrompt: string, userText: string): Promise<string>;
}

function toAnthropicProviderError(error: unknown): ProviderError {
  if (error instanceof Anthropic.APIError) {
    const status = typeof error.status === "number" ? error.status : null;

    return new ProviderError({
      message: status === null ? "Could not reach Anthropic." : `Anthropic request failed (${status}).`,
      kind: status === null ? "network" : classifyProviderStatus(status, error.type),
      status,
      detail: error.message,
    });
  }

  return new ProviderError({
    message: "The Anthropic request failed unexpectedly.",
    kind: "unknown",
    detail: error instanceof Error ? error.message : String(error),
  });
}

export function createLLMClient(settings: ResolvedLLMSettings): LLMClient {
  if (!settings.apiKey) {
    throw new Error("LLM API key is not configured. Add one in Settings or set LLM_API_KEY.");
  }

  switch (settings.provider) {
    case "openai-compatible":
      return new OpenAICompatibleClient(settings.apiKey, settings.model, settings.baseUrl);
    case "anthropic":
      return new AnthropicClient(settings.apiKey, settings.model, settings.baseUrl);
    case "custom":
      return new StubClient(settings.provider);
    default:
      throw new Error(`Unsupported LLM provider: ${settings.provider as string}`);
  }
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
}

class OpenAICompatibleClient implements LLMClient {
  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    baseUrl: string,
  ) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  async complete(systemPrompt: string, userText: string): Promise<string> {
    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userText },
          ],
          temperature: 0.2,
          response_format: { type: "json_object" },
        }),
      });
    } catch (error) {
      throw new ProviderError({
        message: `Could not reach the LLM provider at ${this.baseUrl}.`,
        kind: "network",
        detail: error instanceof Error ? error.message : String(error),
      });
    }

    if (!response.ok) {
      throw await providerErrorFromResponse(response);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new ProviderError({
        message: "The LLM response did not include any message content.",
        kind: "unknown",
        status: response.status,
      });
    }

    return content;
  }
}

class AnthropicClient implements LLMClient {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
    baseUrl: string,
  ) {
    this.client = new Anthropic({ apiKey, baseURL: baseUrl });
  }

  async complete(systemPrompt: string, userText: string): Promise<string> {
    try {
      const response = await this.client.messages.parse({
        model: this.model,
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: "user", content: userText }],
        output_config: { format: zodOutputFormat(translationResponseSchema) },
      });

      if (!response.parsed_output) {
        throw new ProviderError({
          message: `Anthropic returned no parsed output (stop_reason: ${response.stop_reason}).`,
          kind: "unknown",
          detail: response.stop_reason ?? null,
        });
      }

      return JSON.stringify(response.parsed_output);
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }

      throw toAnthropicProviderError(error);
    }
  }
}

class StubClient implements LLMClient {
  constructor(private readonly provider: string) {}

  complete(): Promise<string> {
    throw new Error(
      `The "${this.provider}" provider is a stub. Add this provider's request/response mapping in app/lib/llm-client.ts.`,
    );
  }
}
