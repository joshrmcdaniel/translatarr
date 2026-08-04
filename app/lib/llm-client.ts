import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { classifyProviderStatus, ProviderError, providerErrorFromResponse } from "./provider-error";
import type { ResolvedLLMSettings } from "./settings-types";
import { translationResponseSchema } from "./translation-schema";

export interface LLMClient {
  complete(systemPrompt: string, userText: string): Promise<string>;
}

function toAnthropicProviderError(error: unknown): ProviderError {
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new ProviderError({
      message: "The Anthropic request timed out.",
      kind: "timeout",
      detail: error.message,
    });
  }

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
  const { apiKey } = settings;

  if (!apiKey) {
    throw new Error("LLM API key is not configured. Add one in Settings or set LLM_API_KEY.");
  }

  switch (settings.provider) {
    case "openai-compatible":
      return new OpenAICompatibleClient({ ...settings, apiKey });
    case "anthropic":
      return new AnthropicClient({ ...settings, apiKey });
    case "custom":
      return new StubClient(settings.provider);
    default:
      throw new Error(`Unsupported LLM provider: ${settings.provider as string}`);
  }
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
}

function isAbortTimeout(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
}

class OpenAICompatibleClient implements LLMClient {
  private readonly baseUrl: string;

  constructor(private readonly settings: ResolvedLLMSettings & { apiKey: string }) {
    this.baseUrl = normalizeBaseUrl(settings.baseUrl);
  }

  async complete(systemPrompt: string, userText: string): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.settings.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
      temperature: this.settings.temperature,
      max_tokens: this.settings.maxTokens,
      response_format: { type: "json_object" },
    };

    // OpenRouter-style reasoning control; omitted entirely when unset so vanilla
    // OpenAI endpoints (which reject unknown parameters) are unaffected.
    if (this.settings.reasoning === "off") {
      body.reasoning = { enabled: false };
    } else if (this.settings.reasoning !== null) {
      body.reasoning = { effort: this.settings.reasoning };
    }

    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.settings.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.settings.timeoutMs),
      });
    } catch (error) {
      if (isAbortTimeout(error)) {
        throw new ProviderError({
          message: `The LLM request exceeded the ${Math.round(this.settings.timeoutMs / 1000)}s timeout.`,
          kind: "timeout",
          detail: `model=${this.settings.model}`,
        });
      }

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

  constructor(private readonly settings: ResolvedLLMSettings & { apiKey: string }) {
    this.client = new Anthropic({
      apiKey: settings.apiKey,
      baseURL: settings.baseUrl,
      timeout: settings.timeoutMs,
      maxRetries: 1,
    });
  }

  async complete(systemPrompt: string, userText: string): Promise<string> {
    try {
      const response = await this.client.messages.parse({
        model: this.settings.model,
        max_tokens: this.settings.maxTokens,
        temperature: this.settings.temperature,
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
