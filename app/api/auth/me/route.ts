import { NextResponse } from "next/server";
import { getSessionUser } from "../../../lib/auth";
import { countUsers } from "../../../lib/user-store";
import { logged } from "../../../lib/request-log";

async function handleGET() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ user: null, needsSetup: countUsers() === 0 }, { status: 401 });
  }

  return NextResponse.json({ user });
}

export const GET = logged(handleGET);
