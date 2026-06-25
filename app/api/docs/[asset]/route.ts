import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { getSessionUser } from "../../../lib/auth";

// The Swagger UI assets, copied out of swagger-ui-dist into .swagger-ui/ by the
// `swagger:ui` script. Served here (rather than from public/) so they sit under
// /api/docs and require a session, like the page and spec they belong to.
const assetsDir = join(process.cwd(), ".swagger-ui");

const contentTypes: Record<string, string> = {
  "swagger-ui.css": "text/css; charset=utf-8",
  "swagger-ui-bundle.js": "text/javascript; charset=utf-8",
  "swagger-ui-standalone-preset.js": "text/javascript; charset=utf-8",
};

const cache = new Map<string, Blob>();

type RouteContext = {
  params: Promise<{ asset: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { asset } = await context.params;
  const contentType = contentTypes[asset];

  if (!contentType) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let body = cache.get(asset);

  if (!body) {
    body = new Blob([new Uint8Array(await readFile(join(assetsDir, asset)))]);
    cache.set(asset, body);
  }

  return new Response(body, {
    headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=3600" },
  });
}
