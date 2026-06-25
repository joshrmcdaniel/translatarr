import { NextResponse } from "next/server";
import { deleteApiKey } from "../../../lib/api-key-store";
import { getSessionUser } from "../../../lib/auth";

type RouteContext = {
  params: Promise<{ keyId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { keyId } = await context.params;

  if (!deleteApiKey({ userId: user.id, keyId })) {
    return NextResponse.json({ error: "API key not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
