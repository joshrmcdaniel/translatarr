import { NextResponse } from "next/server";
import { deleteApiKey } from "../../../lib/api-key-store";
import { getSessionUser } from "../../../lib/auth";
import { logged } from "../../../lib/request-log";

type RouteContext = {
  params: Promise<{ keyId: string }>;
};

async function handleDELETE(_request: Request, context: RouteContext) {
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

export const DELETE = logged(handleDELETE);
