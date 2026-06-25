import { NextResponse } from "next/server";
import { createApiKey, listApiKeys } from "../../lib/api-key-store";
import { getSessionUser } from "../../lib/auth";
import { createKeyBodySchema, type CreateKeyBody } from "../../lib/request-schemas";

export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  return NextResponse.json({ keys: listApiKeys(user.id) });
}

export async function POST(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: CreateKeyBody;

  try {
    body = createKeyBodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Send a key name (1-64 chars) and an optional ISO 8601 expiry date." },
      { status: 400 },
    );
  }

  if (body.expiresAt && body.expiresAt < new Date().toISOString()) {
    return NextResponse.json({ error: "Expiry must be in the future." }, { status: 400 });
  }

  const { apiKey, token } = createApiKey({ userId: user.id, name: body.name, expiresAt: body.expiresAt ?? null });
  return NextResponse.json({ apiKey, token }, { status: 201 });
}
