import { NextResponse } from "next/server";
import { getSessionUser } from "../../lib/auth";
import { createChat, listChats } from "../../lib/chat-store";
import { createChatBodySchema, type CreateChatBody } from "../../lib/request-schemas";
import { logged } from "../../lib/request-log";

async function handleGET() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  return NextResponse.json({ chats: listChats(user.id) });
}

async function handlePOST(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: CreateChatBody;

  try {
    body = createChatBodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Send sourceLang and targetLang." }, { status: 400 });
  }

  return NextResponse.json({ chat: createChat({ ...body, userId: user.id }) }, { status: 201 });
}

export const GET = logged(handleGET);
export const POST = logged(handlePOST);
