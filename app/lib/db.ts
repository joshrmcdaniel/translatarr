import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

const dataDir = path.join(process.cwd(), "data");
const dbPath = process.env.SQLITE_PATH ?? path.join(dataDir, "translatarr.sqlite");

let db: Database.Database | null = null;

export function getDb() {
  if (!db) {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 5000");
    migrate(db);
  }

  return db;
}

function migrate(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_lang TEXT NOT NULL,
      target_lang TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_turns (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      source_lang TEXT NOT NULL,
      target_lang TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_chat_turns_chat_created
      ON chat_turns(chat_id, created_at);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (user_id, key)
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      prefix TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used_at TEXT,
      expires_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
  `);

  const chatColumns = database.prepare("PRAGMA table_info(chats)").all() as Array<{ name: string }>;

  if (!chatColumns.some((column) => column.name === "user_id")) {
    database.exec(`
      ALTER TABLE chats ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
      CREATE INDEX IF NOT EXISTS idx_chats_user ON chats(user_id);
    `);
  }

  const turnColumns = database.prepare("PRAGMA table_info(chat_turns)").all() as Array<{ name: string }>;

  if (!turnColumns.some((column) => column.name === "selected_option")) {
    database.exec("ALTER TABLE chat_turns ADD COLUMN selected_option INTEGER NOT NULL DEFAULT 0");
  }

  if (!turnColumns.some((column) => column.name === "parent_id")) {
    // Link pre-branching turns into a linear chain per chat so existing chats keep their full history.
    database.exec(`
      ALTER TABLE chat_turns ADD COLUMN parent_id TEXT;

      UPDATE chat_turns
      SET parent_id = (
        SELECT p.id FROM chat_turns AS p
        WHERE p.chat_id = chat_turns.chat_id
          AND (p.created_at < chat_turns.created_at
               OR (p.created_at = chat_turns.created_at AND p.rowid < chat_turns.rowid))
        ORDER BY p.created_at DESC, p.rowid DESC
        LIMIT 1
      )
      WHERE parent_id IS NULL;
    `);
  }

  if (!chatColumns.some((column) => column.name === "active_turn_id")) {
    // Point each existing chat at its newest turn as the active branch leaf.
    database.exec(`
      ALTER TABLE chats ADD COLUMN active_turn_id TEXT;

      UPDATE chats
      SET active_turn_id = (
        SELECT id FROM chat_turns
        WHERE chat_turns.chat_id = chats.id
        ORDER BY created_at DESC, rowid DESC
        LIMIT 1
      )
      WHERE active_turn_id IS NULL;
    `);
  }
}
