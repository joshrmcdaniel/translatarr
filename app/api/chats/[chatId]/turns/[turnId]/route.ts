import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "../../../../../lib/auth";
import { setTurnSelection } from "../../../../../lib/chat-store";

type RouteContext = {
  params: Promise<{ chatId: string; turnId: string }>;
};

const updateTurnSchema = z.object({
  selectedOption: z.number().int().min(0),
});

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
    return NextResponse.json({ error: "Send selectedOption." }, { status: 400 });
  }

  const chat = setTurnSelection({ chatId, turnId, userId: user.id, selectedOption: body.selectedOption });

  if (!chat) {
    return NextResponse.json({ error: "Chat turn not found." }, { status: 404 });
  }

  return NextResponse.json({ chat });
}
