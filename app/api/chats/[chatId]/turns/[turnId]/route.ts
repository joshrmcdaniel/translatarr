import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "../../../../../lib/auth";
import { getChat, setTurnSelection, updateTurn } from "../../../../../lib/chat-store";
import { contextFromTurns, MalformedLLMResponseError, translateText } from "../../../../../lib/translation-service";

type RouteContext = {
  params: Promise<{ chatId: string; turnId: string }>;
};

const updateTurnSchema = z.union([
  z.object({ selectedOption: z.number().int().min(0) }),
  // Re-runs the translation (optionally with edited text), replacing the turn's result.
  z.object({ action: z.literal("retranslate"), text: z.string().trim().min(1).max(12000).optional() }),
]);

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { chatId, turnId } = await context.params;
  let body: z.infer<typeof updateTurnSchema>;

  try {
    body = updateTurnSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Send selectedOption or a retranslate action." }, { status: 400 });
  }

  if ("selectedOption" in body) {
    const chat = setTurnSelection({ chatId, turnId, userId: user.id, selectedOption: body.selectedOption });

    if (!chat) {
      return NextResponse.json({ error: "Chat turn not found." }, { status: 404 });
    }

    return NextResponse.json({ chat });
  }

  const chat = getChat(chatId, user.id);
  const turnIndex = chat?.turns.findIndex((turn) => turn.id === turnId) ?? -1;
  const turn = chat?.turns[turnIndex];

  if (!chat || !turn) {
    return NextResponse.json({ error: "Chat turn not found." }, { status: 404 });
  }

  const text = body.text ?? turn.text;

  try {
    const result = await translateText({
      text,
      sourceLang: turn.sourceLang,
      targetLang: turn.targetLang,
      userId: user.id,
      context: contextFromTurns(chat.turns.slice(0, turnIndex)),
    });
    const updatedChat = updateTurn({ chatId, turnId, userId: user.id, text, result });

    if (!updatedChat) {
      return NextResponse.json({ error: "Chat turn not found." }, { status: 404 });
    }

    return NextResponse.json({ chat: updatedChat });
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
