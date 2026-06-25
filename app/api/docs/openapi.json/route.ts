import { NextResponse } from "next/server";
import { getSessionUser } from "../../../lib/auth";
import { buildOpenApiDocument } from "../../../lib/openapi";

export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  return NextResponse.json(buildOpenApiDocument());
}
