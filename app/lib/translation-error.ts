import { NextResponse } from "next/server";
import { ProviderError, type ProviderErrorKind, providerErrorStatus } from "./provider-error";
import { MalformedLLMResponseError } from "./translation-service";

const messages: Record<ProviderErrorKind, string> = {
  auth: "The translation provider rejected the configured API key. Check it in Settings.",
  rate_limit: "The translation provider is rate limiting requests. Try again in a moment.",
  quota: "The translation provider account is out of quota or credit.",
  model_not_found: "The configured model isn't available from the provider. Check the model and base URL in Settings.",
  context_length: "The text is too long for the model's context window. Shorten it and try again.",
  bad_request: "The translation provider rejected the request.",
  server: "The translation provider is having problems. Try again shortly.",
  network: "Couldn't reach the translation provider. Check the base URL and your connection.",
  unknown: "The translation service is unavailable.",
};

/** Maps a translation failure to the shared HTTP error response used by every translate route. */
export function translationErrorResponse(error: unknown): NextResponse {
  if (error instanceof MalformedLLMResponseError) {
    console.error("Malformed translation response", error);
    return NextResponse.json(
      { error: "The translation service returned an invalid response. Please try again.", code: "malformed" },
      { status: 422 },
    );
  }

  if (error instanceof ProviderError) {
    console.error(`Translation provider error [${error.kind}] status=${error.status ?? "n/a"}`, error.detail ?? error.message);
    return NextResponse.json({ error: messages[error.kind], code: error.kind }, { status: providerErrorStatus[error.kind] });
  }

  console.error("Translation provider error", error);
  return NextResponse.json({ error: "The translation service is unavailable.", code: "unknown" }, { status: 502 });
}
