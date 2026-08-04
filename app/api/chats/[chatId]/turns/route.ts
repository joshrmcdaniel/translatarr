import { NextResponse } from "next/server";
import { getSessionUser } from "../../../../lib/auth";
import { addTurn, getChat, listTurns } from "../../../../lib/chat-store";
import { autoDetectLanguage } from "../../../../lib/languages";
import {
  createTurnBodySchema,
  listTurnsQuerySchema,
  parseTurnLimit,
  type CreateTurnBody,
  type ListTurnsQuery,
} from "../../../../lib/request-schemas";
import { translationResponseSchema, type TranslationResponse } from "../../../../lib/translation-schema";
import { translationErrorResponse } from "../../../../lib/translation-error";
import { CONTEXT_TURN_LIMIT, contextFromTurns, translateText } from "../../../../lib/translation-service";
import { logged } from "../../../../lib/request-log";

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

async function handleGET(request: Request, context: RouteContext) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { chatId } = await context.params;
  let query: ListTurnsQuery;

  try {
    const params = new URL(request.url).searchParams;
    query = listTurnsQuerySchema.parse({
      before: params.get("before") ?? undefined,
      limit: params.get("limit") ?? undefined,
    });
  } catch {
    return NextResponse.json({ error: "Invalid before or limit parameter." }, { status: 400 });
  }

  const page = listTurns({ chatId, userId: user.id, limit: query.limit, beforeTurnId: query.before });

  if (!page) {
    return NextResponse.json({ error: "Chat or turn not found." }, { status: 404 });
  }

  return NextResponse.json(page);
}

async function handlePOST(request: Request, context: RouteContext) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { chatId } = await context.params;
  let turnLimit: number | undefined;

  try {
    turnLimit = parseTurnLimit(request.url);
  } catch {
    return NextResponse.json({ error: "limit must be an integer between 1 and 200." }, { status: 400 });
  }

  let body: CreateTurnBody;

  try {
    body = createTurnBodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Send text, sourceLang, and targetLang." }, { status: 400 });
  }

  const existingChat = getChat(chatId, user.id, { turnLimit: CONTEXT_TURN_LIMIT });

  if (!existingChat) {
    return NextResponse.json({ error: "Chat not found." }, { status: 404 });
  }

  if (existingChat.totalTurns > 0 && !pairMatchesChat(existingChat, body.sourceLang, body.targetLang)) {
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
    const chat = addTurn({ chatId, userId: user.id, result, turnLimit, ...turn });

    if (!chat) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }

    return NextResponse.json({ chat });
  } catch (error) {
    return translationErrorResponse(error);
  }
}

export const GET = logged(handleGET);
export const POST = logged(handlePOST);
