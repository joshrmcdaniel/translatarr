import { NextResponse } from "next/server";
import { z } from "zod";
import { startSession, verifyPassword } from "../../../lib/auth";
import { getUserAuthByUsername } from "../../../lib/user-store";

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  let body: z.infer<typeof loginSchema>;

  try {
    body = loginSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Send a username and password." }, { status: 400 });
  }

  const auth = getUserAuthByUsername(body.username);

  if (!auth || !verifyPassword(body.password, auth.passwordHash)) {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  await startSession(auth.user.id);
  return NextResponse.json({ user: auth.user });
}
