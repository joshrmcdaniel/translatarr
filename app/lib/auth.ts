/**
 * Authentication: scrypt password hashing and cookie-backed DB sessions.
 *
 * Sessions are opaque random tokens stored in the `sessions` table and carried
 * in an HTTP-only cookie. `getSessionUser()` is the single entry point route
 * handlers use to resolve the current user.
 */

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";
import { getUserById, type User } from "./user-store";

const SESSION_COOKIE = "translatarr_session";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");

  if (!saltHex || !hashHex) {
    return false;
  }

  const hash = scryptSync(password, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(hashHex, "hex");
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}

export async function startSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

  getDb().prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, userId, expiresAt);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function getSessionUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  const session = getDb().prepare("SELECT user_id, expires_at FROM sessions WHERE token = ?").get(token) as
    | { user_id: string; expires_at: string }
    | undefined;

  if (!session) {
    return null;
  }

  if (session.expires_at < new Date().toISOString()) {
    getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }

  return getUserById(session.user_id);
}

export async function endSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
  }

  cookieStore.delete(SESSION_COOKIE);
}
