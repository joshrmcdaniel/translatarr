import { NextResponse } from "next/server";
import { getSessionUser } from "../../lib/auth";
import { createChat, listChats } from "../../lib/chat-store";
import { createChatBodySchema, type CreateChatBody } from "../../lib/request-schemas";

export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  return NextResponse.json({ chats: listChats(user.id) });
}

export async function POST(request: Request) {
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
