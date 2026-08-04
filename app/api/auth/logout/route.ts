import { NextResponse } from "next/server";
import { endSession } from "../../../lib/auth";
import { logged } from "../../../lib/request-log";

async function handlePOST() {
  await endSession();
  return NextResponse.json({ ok: true });
}

export const POST = logged(handlePOST);
