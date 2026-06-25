import { NextResponse } from "next/server";
import { getSessionUser } from "../../lib/auth";
import { getChat } from "../../lib/chat-store";
import { translateBodySchema, type TranslateBody } from "../../lib/request-schemas";
import { translationErrorResponse } from "../../lib/translation-error";
import { contextFromTurns, translateText } from "../../lib/translation-service";

export async function POST(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: TranslateBody;

  try {
    body = translateBodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Send text, sourceLang, and targetLang." }, { status: 400 });
  }

  let context;

  if (body.chatId) {
    const chat = getChat(body.chatId, user.id);

    if (!chat) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }

    context = contextFromTurns(chat.turns);
  }

  try {
    const result = await translateText({ text: body.text, sourceLang: body.sourceLang, targetLang: body.targetLang, userId: user.id, context });
    return NextResponse.json(result);
  } catch (error) {
    return translationErrorResponse(error);
  }
}
