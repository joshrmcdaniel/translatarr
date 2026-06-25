/**
 * API key persistence: issue, list, resolve, and revoke personal access tokens.
 *
 * Tokens authenticate API requests via the `Authorization: Bearer` header as an
 * alternative to the browser session cookie. Only a SHA-256 hash of each token
 * is stored; the plaintext is returned exactly once, at creation. Tokens are
 * high-entropy random bytes, so a fast hash suffices here (passwords, being
 * low-entropy, use scrypt in `auth.ts` instead).
 */

import { createHash, randomBytes } from "node:crypto";
import { getDb } from "./db";
import { getUserById, type User } from "./user-store";

const TOKEN_BYTES = 32;
const TOKEN_PREFIX = "tra_";
const DISPLAY_PREFIX_LENGTH = 12;

export type ApiKey = {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
};

type ApiKeyRow = {
  id: string;
  user_id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
};

function mapApiKey(row: ApiKeyRow): ApiKey {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    prefix: row.prefix,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
  };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createApiKey({
  userId,
  name,
  expiresAt = null,
}: {
  userId: string;
  name: string;
  expiresAt?: string | null;
}): { apiKey: ApiKey; token: string } {
  const id = crypto.randomUUID();
  const token = `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString("base64url")}`;
  const prefix = token.slice(0, DISPLAY_PREFIX_LENGTH);

  getDb()
    .prepare("INSERT INTO api_keys (id, user_id, name, token_hash, prefix, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, userId, name, hashToken(token), prefix, expiresAt);

  const row = getDb().prepare("SELECT * FROM api_keys WHERE id = ?").get(id) as ApiKeyRow;
  return { apiKey: mapApiKey(row), token };
}

export function listApiKeys(userId: string): ApiKey[] {
  const rows = getDb()
    .prepare("SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId) as ApiKeyRow[];
  return rows.map(mapApiKey);
}

export function deleteApiKey({ userId, keyId }: { userId: string; keyId: string }): boolean {
  const result = getDb().prepare("DELETE FROM api_keys WHERE id = ? AND user_id = ?").run(keyId, userId);
  return result.changes > 0;
}

/**
 * Resolves the bearer token to its owner, self-evicting the key when expired
 * (mirroring the session-expiry cleanup in `auth.ts`). Touches `last_used_at`
 * on every successful resolution.
 */
export function resolveApiKeyUser(token: string): User | null {
  const row = getDb().prepare("SELECT * FROM api_keys WHERE token_hash = ?").get(hashToken(token)) as
    | ApiKeyRow
    | undefined;

  if (!row) {
    return null;
  }

  if (row.expires_at !== null && row.expires_at < new Date().toISOString()) {
    getDb().prepare("DELETE FROM api_keys WHERE id = ?").run(row.id);
    return null;
  }

  getDb().prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(new Date().toISOString(), row.id);
  return getUserById(row.user_id);
}
