import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "../../../../lib/auth";
import { addTurn, getChat } from "../../../../lib/chat-store";
import { isSupportedLanguage } from "../../../../lib/languages";
import { translationResponseSchema, type TranslationResponse } from "../../../../lib/translation-schema";
import { contextFromTurns, MalformedLLMResponseError, translateText } from "../../../../lib/translation-service";

type RouteContext = {
  params: Promise<{ chatId: string }>;
};

const createTurnSchema = z.object({
  text: z.string().trim().min(1).max(12000),
  sourceLang: z.string().min(2),
  targetLang: z.string().min(2),
  // Client-supplied live-preview result for this exact text; reused to skip a duplicate LLM call.
  result: z.unknown().optional(),
});

export async function POST(request: Request, context: RouteContext) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { chatId } = await context.params;
  let body: z.infer<typeof createTurnSchema>;

  try {
    body = createTurnSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Send text, sourceLang, and targetLang." }, { status: 400 });
  }

  if (!isSupportedLanguage(body.sourceLang) || !isSupportedLanguage(body.targetLang) || body.targetLang === "auto") {
    return NextResponse.json({ error: "Unsupported language selection." }, { status: 400 });
  }

  const existingChat = getChat(chatId, user.id);

  if (!existingChat) {
    return NextResponse.json({ error: "Chat not found." }, { status: 404 });
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
