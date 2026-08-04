import { NextResponse } from "next/server";
import { getSessionUser } from "../../../lib/auth";
import { clearTurns, deleteChat, getChat, renameChat } from "../../../lib/chat-store";
import { parseTurnLimit, updateChatBodySchema, type UpdateChatBody } from "../../../lib/request-schemas";
import { logged } from "../../../lib/request-log";

type RouteContext = {
  params: Promise<{ chatId: string }>;
};

const invalidLimitResponse = () =>
  NextResponse.json({ error: "limit must be an integer between 1 and 200." }, { status: 400 });

async function handleGET(request: Request, context: RouteContext) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { chatId } = await context.params;
  let turnLimit: number | undefined;

  try {
    turnLimit = parseTurnLimit(request.url);
  } catch {
    return invalidLimitResponse();
  }

  const chat = getChat(chatId, user.id, { turnLimit });

  if (!chat) {
    return NextResponse.json({ error: "Chat not found." }, { status: 404 });
  }

  return NextResponse.json({ chat });
}

async function handlePATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { chatId } = await context.params;
  let turnLimit: number | undefined;

  try {
    turnLimit = parseTurnLimit(request.url);
  } catch {
    return invalidLimitResponse();
  }

  let body: UpdateChatBody;

  try {
    body = updateChatBodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Unsupported chat update." }, { status: 400 });
  }

  const chat =
    body.action === "clear" ? clearTurns(chatId, user.id, turnLimit) : renameChat(chatId, user.id, body.title, turnLimit);

  if (!chat) {
    return NextResponse.json({ error: "Chat not found." }, { status: 404 });
  }

  return NextResponse.json({ chat });
}

async function handleDELETE(_request: Request, context: RouteContext) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { chatId } = await context.params;

  if (!deleteChat(chatId, user.id)) {
    return NextResponse.json({ error: "Chat not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export const GET = logged(handleGET);
export const PATCH = logged(handlePATCH);
export const DELETE = logged(handleDELETE);
