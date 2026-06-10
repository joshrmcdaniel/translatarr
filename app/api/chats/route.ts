import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "../../lib/auth";
import { createChat, listChats } from "../../lib/chat-store";
import { isSupportedLanguage } from "../../lib/languages";

const createChatSchema = z.object({
  title: z.string().trim().max(80).optional(),
  sourceLang: z.string().min(2),
  targetLang: z.string().min(2),
});

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

  let body: z.infer<typeof createChatSchema>;

  try {
    body = createChatSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Send sourceLang and targetLang." }, { status: 400 });
  }

  if (!isSupportedLanguage(body.sourceLang) || !isSupportedLanguage(body.targetLang) || body.targetLang === "auto") {
    return NextResponse.json({ error: "Unsupported language selection." }, { status: 400 });
  }

  return NextResponse.json({ chat: createChat({ ...body, userId: user.id }) }, { status: 201 });
}
