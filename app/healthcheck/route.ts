import { NextResponse } from "next/server";
import { APP_VERSION } from "../lib/version";

/**
 * Public liveness + version probe. The one intentionally unauthenticated route:
 * a 200 means the server is up, and the body carries the running version so a
 * Docker `HEALTHCHECK`, reverse proxy, or uptime monitor can read it without a
 * session. Deliberately shallow (no DB hit) so a probe can't be expensive.
 */
export function GET() {
  return NextResponse.json({ status: "ok", service: "translatarr", version: APP_VERSION });
}
