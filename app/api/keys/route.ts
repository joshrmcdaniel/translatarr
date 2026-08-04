import { NextResponse } from "next/server";
import { createApiKey, listApiKeys } from "../../lib/api-key-store";
import { getSessionUser } from "../../lib/auth";
import { createKeyBodySchema, type CreateKeyBody } from "../../lib/request-schemas";
import { logged } from "../../lib/request-log";

async function handleGET() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  return NextResponse.json({ keys: listApiKeys(user.id) });
}

async function handlePOST(request: Request) {
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

  if (body.expiresAt && Date.parse(body.expiresAt) < Date.now()) {
    return NextResponse.json({ error: "Expiry must be in the future." }, { status: 400 });
  }

  const { apiKey, token } = createApiKey({ userId: user.id, name: body.name, expiresAt: body.expiresAt ?? null });
  return NextResponse.json({ apiKey, token }, { status: 201 });
}

export const GET = logged(handleGET);
export const POST = logged(handlePOST);
