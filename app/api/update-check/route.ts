import { NextResponse } from "next/server";
import { getSessionUser } from "../../lib/auth";
import { getUpdateStatus } from "../../lib/update-check";

/** Admin-only: the update banner is shown to admins, so only they trigger the check. */
export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  return NextResponse.json(await getUpdateStatus());
}
