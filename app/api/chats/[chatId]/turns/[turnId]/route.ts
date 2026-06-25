import { NextResponse } from "next/server";
import { getSessionUser } from "../../../../../lib/auth";
import { branchTurn, getChat, setActiveBranch, setTurnSelection } from "../../../../../lib/chat-store";
import { updateTurnBodySchema, type UpdateTurnBody } from "../../../../../lib/request-schemas";
import { translationErrorResponse } from "../../../../../lib/translation-error";
import { contextFromTurns, translateText } from "../../../../../lib/translation-service";

type RouteContext = {
  params: Promise<{ chatId: string; turnId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { chatId, turnId } = await context.params;
  let body: UpdateTurnBody;

  try {
    body = updateTurnBodySchema.parse(await request.json());
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

  if (body.action === "switchBranch") {
    const chat = setActiveBranch({ chatId, turnId, userId: user.id });

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
    const updatedChat = branchTurn({ chatId, turnId, userId: user.id, text, result });

    if (!updatedChat) {
      return NextResponse.json({ error: "Chat turn not found." }, { status: 404 });
    }

    return NextResponse.json({ chat: updatedChat });
  } catch (error) {
    return translationErrorResponse(error);
  }
}
