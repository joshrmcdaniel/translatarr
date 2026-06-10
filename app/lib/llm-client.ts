import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ResolvedLLMSettings } from "./settings-types";
import { translationResponseSchema } from "./translation-schema";

export interface LLMClient {
  complete(systemPrompt: string, userText: string): Promise<string>;
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
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
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

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`LLM request failed (${response.status}): ${detail}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("LLM response did not include message content.");
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
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userText }],
      output_config: { format: zodOutputFormat(translationResponseSchema) },
    });

    if (!response.parsed_output) {
      throw new Error(`Anthropic response had no parsed output (stop_reason: ${response.stop_reason}).`);
    }

    return JSON.stringify(response.parsed_output);
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
