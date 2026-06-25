import { NextResponse } from "next/server";
import { getSessionUser } from "../../../../lib/auth";
import { addTurn, getChat } from "../../../../lib/chat-store";
import { autoDetectLanguage } from "../../../../lib/languages";
import { createTurnBodySchema, type CreateTurnBody } from "../../../../lib/request-schemas";
import { translationResponseSchema, type TranslationResponse } from "../../../../lib/translation-schema";
import { translationErrorResponse } from "../../../../lib/translation-error";
import { contextFromTurns, translateText } from "../../../../lib/translation-service";

type RouteContext = {
  params: Promise<{ chatId: string }>;
};

// A chat is locked to its language pair once it has turns: a new turn may only use
// those two languages (in either direction), with auto-detect always permitted.
function pairMatchesChat(
  chat: { sourceLang: string; targetLang: string },
  sourceLang: string,
  targetLang: string,
): boolean {
  const pinned = new Set([chat.sourceLang, chat.targetLang].filter((lang) => lang !== autoDetectLanguage.code));
  const within = (lang: string) => lang === autoDetectLanguage.code || pinned.has(lang);
  return within(sourceLang) && within(targetLang);
}

export async function POST(request: Request, context: RouteContext) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { chatId } = await context.params;
  let body: CreateTurnBody;

  try {
    body = createTurnBodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Send text, sourceLang, and targetLang." }, { status: 400 });
  }

  const existingChat = getChat(chatId, user.id);

  if (!existingChat) {
    return NextResponse.json({ error: "Chat not found." }, { status: 404 });
  }

  if (existingChat.turns.length > 0 && !pairMatchesChat(existingChat, body.sourceLang, body.targetLang)) {
    return NextResponse.json({ error: "This chat is locked to its language pair." }, { status: 400 });
  }

  let precomputedResult: TranslationResponse | undefined;

  if (body.result !== undefined) {
    const parsed = translationResponseSchema.safeParse(body.result);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid precomputed translation result." }, { status: 400 });
    }

    precomputedResult = parsed.data;
  }

  const turn = { text: body.text, sourceLang: body.sourceLang, targetLang: body.targetLang };

  try {
    const result =
      precomputedResult ?? (await translateText({ ...turn, userId: user.id, context: contextFromTurns(existingChat.turns) }));
    const chat = addTurn({ chatId, userId: user.id, result, ...turn });

    if (!chat) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }

    return NextResponse.json({ chat });
  } catch (error) {
    return translationErrorResponse(error);
  }
}
