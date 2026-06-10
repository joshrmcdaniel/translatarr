import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "../../../lib/auth";
import { clearTurns, deleteChat, getChat, renameChat } from "../../../lib/chat-store";

type RouteContext = {
  params: Promise<{ chatId: string }>;
};

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("clear") }),
  z.object({ action: z.literal("rename"), title: z.string().trim().min(1).max(80) }),
]);

export async function GET(_request: Request, context: RouteContext) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { chatId } = await context.params;
  const chat = getChat(chatId, user.id);

  if (!chat) {
    return NextResponse.json({ error: "Chat not found." }, { status: 404 });
  }

  return NextResponse.json({ chat });
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { chatId } = await context.params;
  let body: z.infer<typeof patchSchema>;

  try {
    body = patchSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Unsupported chat update." }, { status: 400 });
  }

  const chat = body.action === "clear" ? clearTurns(chatId, user.id) : renameChat(chatId, user.id, body.title);

  if (!chat) {
    return NextResponse.json({ error: "Chat not found." }, { status: 404 });
  }

  return NextResponse.json({ chat });
}

export async function DELETE(_request: Request, context: RouteContext) {
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
