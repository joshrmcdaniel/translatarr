/**
 * Access logging for API route handlers — one line per request with method,
 * path, status, and duration, the way a production reverse proxy would log.
 * 4xx/5xx lines carry the response's JSON error message, and a handler that
 * throws is logged with its stack and mapped to a generic 500, so no request
 * can fail silently. The healthcheck route stays unwrapped on purpose (the
 * Docker probe would flood the log).
 */

import { NextResponse } from "next/server";

type RouteHandler<Args extends unknown[]> = (request: Request, ...args: Args) => Response | Promise<Response>;

async function responseErrorMessage(response: Response): Promise<string | null> {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    return null;
  }

  try {
    const body = (await response.clone().json()) as { error?: string };
    return typeof body.error === "string" ? body.error : null;
  } catch {
    return null;
  }
}

/** Wraps a route handler so every request is access-logged and every crash becomes a logged 500. */
export function logged<Args extends unknown[]>(handler: RouteHandler<Args>): RouteHandler<Args> {
  return async (request: Request, ...args: Args): Promise<Response> => {
    const startedAt = performance.now();
    const { pathname, search } = new URL(request.url);
    const target = `${request.method} ${pathname}${search}`;

    let response: Response;

    try {
      response = await handler(request, ...args);
    } catch (error) {
      const duration = Math.round(performance.now() - startedAt);
      console.error(`${new Date().toISOString()} ${target} 500 ${duration}ms — unhandled error`, error);
      return NextResponse.json({ error: "Internal server error." }, { status: 500 });
    }

    const duration = Math.round(performance.now() - startedAt);
    const line = `${new Date().toISOString()} ${target} ${response.status} ${duration}ms`;

    if (response.status >= 400) {
      const message = await responseErrorMessage(response);
      const emit = response.status >= 500 ? console.error : console.warn;
      emit(message ? `${line} — ${message}` : line);
    } else {
      console.log(line);
    }

    return response;
  };
}
