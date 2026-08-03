import { NextResponse } from "next/server";
import { getSessionUser } from "../../../../../lib/auth";
import { branchTurn, getTurn, listTurns, setActiveBranch, setTurnSelection } from "../../../../../lib/chat-store";
import { parseTurnLimit, updateTurnBodySchema, type UpdateTurnBody } from "../../../../../lib/request-schemas";
import { translationErrorResponse } from "../../../../../lib/translation-error";
import { CONTEXT_TURN_LIMIT, contextFromTurns, translateText } from "../../../../../lib/translation-service";

type RouteContext = {
  params: Promise<{ chatId: string; turnId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { chatId, turnId } = await context.params;
  let turnLimit: number | undefined;

  try {
    turnLimit = parseTurnLimit(request.url);
  } catch {
    return NextResponse.json({ error: "limit must be an integer between 1 and 200." }, { status: 400 });
  }

  let body: UpdateTurnBody;

  try {
    body = updateTurnBodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Send selectedOption or a retranslate action." }, { status: 400 });
  }

  if ("selectedOption" in body) {
    const chat = setTurnSelection({ chatId, turnId, userId: user.id, selectedOption: body.selectedOption, turnLimit });

    if (!chat) {
      return NextResponse.json({ error: "Chat turn not found." }, { status: 404 });
    }

    return NextResponse.json({ chat });
  }

  if (body.action === "switchBranch") {
    const chat = setActiveBranch({ chatId, turnId, userId: user.id, turnLimit });

    if (!chat) {
      return NextResponse.json({ error: "Chat turn not found." }, { status: 404 });
    }

    return NextResponse.json({ chat });
  }

  const turn = getTurn(chatId, user.id, turnId);

  if (!turn) {
    return NextResponse.json({ error: "Chat turn not found." }, { status: 404 });
  }

  const priorTurns = listTurns({ chatId, userId: user.id, limit: CONTEXT_TURN_LIMIT, beforeTurnId: turnId });
  const text = body.text ?? turn.text;

  try {
    const result = await translateText({
      text,
      sourceLang: turn.sourceLang,
      targetLang: turn.targetLang,
      userId: user.id,
      context: contextFromTurns(priorTurns?.turns ?? []),
    });
    const updatedChat = branchTurn({ chatId, turnId, userId: user.id, text, result, turnLimit });

    if (!updatedChat) {
      return NextResponse.json({ error: "Chat turn not found." }, { status: 404 });
    }

    return NextResponse.json({ chat: updatedChat });
  } catch (error) {
    return translationErrorResponse(error);
  }
}
