import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "../../lib/auth";
import { getChat } from "../../lib/chat-store";
import { isSupportedLanguage } from "../../lib/languages";
import { contextFromTurns, MalformedLLMResponseError, translateText } from "../../lib/translation-service";

const requestSchema = z.object({
  text: z.string().trim().min(1).max(12000),
  sourceLang: z.string().min(2),
  targetLang: z.string().min(2),
  // Chat whose recent turns provide conversation context; the result is not persisted.
  chatId: z.string().optional(),
});

export async function POST(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: z.infer<typeof requestSchema>;

  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Send text, sourceLang, and targetLang." }, { status: 400 });
  }

  if (!isSupportedLanguage(body.sourceLang) || !isSupportedLanguage(body.targetLang) || body.targetLang === "auto") {
    return NextResponse.json({ error: "Unsupported language selection." }, { status: 400 });
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
    if (error instanceof MalformedLLMResponseError) {
      console.error("Malformed translation response", error);
      return NextResponse.json(
        { error: "The translation service returned an invalid response. Please try again." },
        { status: 422 },
      );
    }

    console.error("Translation provider error", error);
    return NextResponse.json({ error: "The translation service is unavailable." }, { status: 502 });
  }
}
