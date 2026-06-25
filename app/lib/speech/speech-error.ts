import { NextResponse } from "next/server";
import { ProviderError, type ProviderErrorKind, providerErrorStatus } from "../provider-error";

const messages: Record<ProviderErrorKind, string> = {
  auth: "The speech provider rejected the configured API key. Check it in Settings.",
  rate_limit: "The speech provider is rate limiting requests. Try again in a moment.",
  quota: "The speech provider account is out of quota or credit.",
  model_not_found: "The configured speech model isn't available from the provider. Check it in Settings.",
  context_length: "The audio or text was too large for the speech provider.",
  bad_request: "The speech provider rejected the request.",
  server: "The speech provider is having problems. Try again shortly.",
  network: "Couldn't reach the speech provider. Check the base URL and your connection.",
  unknown: "The speech service is unavailable.",
};

/** Maps a speech provider failure to the shared HTTP error response used by the speech routes. */
export function speechErrorResponse(error: unknown): NextResponse {
  if (error instanceof ProviderError) {
    console.error(`Speech provider error [${error.kind}] status=${error.status ?? "n/a"}`, error.detail ?? error.message);
    return NextResponse.json({ error: messages[error.kind], code: error.kind }, { status: providerErrorStatus[error.kind] });
  }

  console.error("Speech provider error", error);
  return NextResponse.json({ error: "The speech service is unavailable.", code: "unknown" }, { status: 502 });
}
