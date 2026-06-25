/**
 * Normalized error model for upstream OpenAI-compatible providers, shared by the
 * translation LLM client and the speech audio client. Pure logic — the HTTP
 * response mapping lives with each service's route helpers.
 */

export type ProviderErrorKind =
  | "auth"
  | "rate_limit"
  | "quota"
  | "model_not_found"
  | "context_length"
  | "bad_request"
  | "server"
  | "network"
  | "unknown";

/** A normalized failure from an upstream provider, carrying its HTTP status and a classified kind. */
export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly status: number | null;
  readonly detail: string | null;

  constructor(input: { message: string; kind: ProviderErrorKind; status?: number | null; detail?: string | null }) {
    super(input.message);
    this.name = "ProviderError";
    this.kind = input.kind;
    this.status = input.status ?? null;
    this.detail = input.detail ?? null;
  }
}

/** Maps an upstream HTTP status (refined by a provider error code when available) to a normalized kind. */
export function classifyProviderStatus(status: number, code?: string | null): ProviderErrorKind {
  if (code === "context_length_exceeded") {
    return "context_length";
  }
  if (code === "model_not_found") {
    return "model_not_found";
  }
  if (code === "insufficient_quota") {
    return "quota";
  }

  if (status === 401 || status === 403) {
    return "auth";
  }
  if (status === 429) {
    return "rate_limit";
  }
  if (status === 404) {
    return "model_not_found";
  }
  if (status === 400 || status === 422) {
    return "bad_request";
  }
  if (status >= 500) {
    return "server";
  }

  return "unknown";
}

/** Pulls the `error.code`/`error.type` discriminator out of an OpenAI-style error body, when present. */
export function parseOpenAIErrorCode(detail: string): string | null {
  try {
    const body = JSON.parse(detail) as { error?: { code?: string | null; type?: string | null } };
    return body.error?.code ?? body.error?.type ?? null;
  } catch {
    return null;
  }
}

/** Builds a ProviderError from a failed OpenAI-compatible HTTP response (consumes the body). */
export async function providerErrorFromResponse(response: Response): Promise<ProviderError> {
  const detail = await response.text();

  return new ProviderError({
    message: `Provider request failed (${response.status}).`,
    kind: classifyProviderStatus(response.status, parseOpenAIErrorCode(detail)),
    status: response.status,
    detail,
  });
}

/** HTTP status each error kind maps to in API responses. */
export const providerErrorStatus: Record<ProviderErrorKind, number> = {
  auth: 502,
  rate_limit: 429,
  quota: 402,
  model_not_found: 502,
  context_length: 413,
  bad_request: 502,
  server: 502,
  network: 504,
  unknown: 502,
};
