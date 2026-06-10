/**
 * User account persistence: CRUD against the `users` table.
 *
 * Password hashing and session handling live in `auth.ts`; this module only
 * stores and retrieves rows. Deleting a user cascades to their sessions,
 * settings, and chats via foreign keys.
 */

import { getDb } from "./db";

export type UserRole = "admin" | "user";

export type User = {
  id: string;
  username: string;
  role: UserRole;
  createdAt: string;
};

type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  role: UserRole;
  created_at: string;
};

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    createdAt: row.created_at,
  };
}

export function countUsers(): number {
  const row = getDb().prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
  return row.count;
}

export function createUser(input: { username: string; passwordHash: string; role: UserRole }): User {
  const id = crypto.randomUUID();

  getDb()
    .prepare("INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)")
    .run(id, input.username, input.passwordHash, input.role);

  const row = getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow;
  return mapUser(row);
}

export function getUserById(userId: string): User | null {
  const row = getDb().prepare("SELECT * FROM users WHERE id = ?").get(userId) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export function getUserAuthByUsername(username: string): { user: User; passwordHash: string } | null {
  const row = getDb().prepare("SELECT * FROM users WHERE username = ?").get(username) as UserRow | undefined;
  return row ? { user: mapUser(row), passwordHash: row.password_hash } : null;
}

export function listUsers(): User[] {
  const rows = getDb().prepare("SELECT * FROM users ORDER BY created_at ASC").all() as UserRow[];
  return rows.map(mapUser);
}

export function deleteUser(userId: string): boolean {
  const result = getDb().prepare("DELETE FROM users WHERE id = ?").run(userId);
  return result.changes > 0;
}

/** Assigns chats created before multi-user support existed to the given user. */
export function claimOrphanChats(userId: string) {
  getDb().prepare("UPDATE chats SET user_id = ? WHERE user_id IS NULL").run(userId);
}
