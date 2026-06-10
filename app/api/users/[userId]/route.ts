import { NextResponse } from "next/server";
import { getSessionUser } from "../../../lib/auth";
import { deleteUser } from "../../../lib/user-store";

type RouteContext = {
  params: Promise<{ userId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { userId } = await context.params;

  if (userId === user.id) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  if (!deleteUser(userId)) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
