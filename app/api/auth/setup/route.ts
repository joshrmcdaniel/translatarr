import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword, startSession } from "../../../lib/auth";
import { claimOrphanChats, countUsers, createUser } from "../../../lib/user-store";

const setupSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9._-]{3,32}$/, "3-32 characters: letters, digits, dot, dash, underscore"),
  password: z.string().min(8).max(200),
});

export async function POST(request: Request) {
  let body: z.infer<typeof setupSchema>;

  try {
    body = setupSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Send a username (3-32 chars) and a password of at least 8 characters." },
      { status: 400 },
    );
  }

  if (countUsers() > 0) {
    return NextResponse.json({ error: "Setup has already been completed." }, { status: 403 });
  }

  const user = createUser({ username: body.username, passwordHash: hashPassword(body.password), role: "admin" });
  claimOrphanChats(user.id);
  await startSession(user.id);

  return NextResponse.json({ user }, { status: 201 });
}
