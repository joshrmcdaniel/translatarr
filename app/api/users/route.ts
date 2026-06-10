import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, hashPassword } from "../../lib/auth";
import { createUser, listUsers } from "../../lib/user-store";

const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9._-]{3,32}$/, "3-32 characters: letters, digits, dot, dash, underscore"),
  password: z.string().min(8).max(200),
  role: z.enum(["admin", "user"]),
});

export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  return NextResponse.json({ users: listUsers() });
}

export async function POST(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  let body: z.infer<typeof createUserSchema>;

  try {
    body = createUserSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Send a username (3-32 chars), a password of at least 8 characters, and a role." },
      { status: 400 },
    );
  }

  try {
    const created = createUser({ username: body.username, passwordHash: hashPassword(body.password), role: body.role });
    return NextResponse.json({ user: created }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    }

    throw error;
  }
}
