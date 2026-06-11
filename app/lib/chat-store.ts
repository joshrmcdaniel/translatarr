import type { ChatDetail, ChatSummary, ChatTurn } from "./chat-types";
import { getDb } from "./db";
import { translationResponseSchema, type TranslationResponse } from "./translation-schema";

type ChatRow = {
  id: string;
  title: string;
  source_lang: string;
  target_lang: string;
  created_at: string;
  updated_at: string;
  user_id: string | null;
};

type TurnRow = {
  id: string;
  chat_id: string;
  text: string;
  source_lang: string;
  target_lang: string;
  result_json: string;
  selected_option: number;
  created_at: string;
};

function mapChat(row: ChatRow): ChatSummary {
  return {
    id: row.id,
    title: row.title,
    sourceLang: row.source_lang,
    targetLang: row.target_lang,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTurn(row: TurnRow): ChatTurn | null {
  const parsed = translationResponseSchema.safeParse(safeJsonParse(row.result_json));

  if (!parsed.success) {
    console.error(`Skipping unparseable chat turn ${row.id}:`, parsed.error?.message ?? "invalid JSON");
    return null;
  }

  const optionCount = parsed.data.translations.length;

  return {
    id: row.id,
    chatId: row.chat_id,
    text: row.text,
    sourceLang: row.source_lang,
    targetLang: row.target_lang,
    result: parsed.data,
    selectedOption: row.selected_option >= 0 && row.selected_option < optionCount ? row.selected_option : 0,
    createdAt: row.created_at,
  };
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function makeTitle(text: string) {
  const title = text.replace(/\s+/g, " ").trim();
  return title.length > 52 ? `${title.slice(0, 49)}...` : title || "New chat";
}

export function listChats(userId: string): ChatSummary[] {
  const rows = getDb()
    .prepare("SELECT * FROM chats WHERE user_id = ? ORDER BY updated_at DESC, created_at DESC")
    .all(userId) as ChatRow[];

  return rows.map(mapChat);
}

export function createChat(input: { title?: string; sourceLang: string; targetLang: string; userId: string }) {
  const id = crypto.randomUUID();
  const title = input.title?.trim() || "New chat";

  getDb()
    .prepare(
      "INSERT INTO chats (id, title, source_lang, target_lang, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
    )
    .run(id, title, input.sourceLang, input.targetLang, input.userId);

  return getChat(id, input.userId);
}

export function getChat(chatId: string, userId: string): ChatDetail | null {
  const chat = getDb().prepare("SELECT * FROM chats WHERE id = ? AND user_id = ?").get(chatId, userId) as
    | ChatRow
    | undefined;

  if (!chat) {
    return null;
  }

  const turns = getDb()
    .prepare("SELECT * FROM chat_turns WHERE chat_id = ? ORDER BY created_at ASC, rowid ASC")
    .all(chatId) as TurnRow[];

  return {
    ...mapChat(chat),
    turns: turns.map(mapTurn).filter((turn): turn is ChatTurn => turn !== null),
  };
}

export function addTurn(input: {
  chatId: string;
  userId: string;
  text: string;
  sourceLang: string;
  targetLang: string;
  result: TranslationResponse;
}) {
  const database = getDb();
  const id = crypto.randomUUID();
  const resultJson = JSON.stringify(input.result);
  const chat = getChat(input.chatId, input.userId);

  if (!chat) {
    return null;
  }

  const transaction = database.transaction(() => {
    database
      .prepare(
        "INSERT INTO chat_turns (id, chat_id, text, source_lang, target_lang, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
      )
      .run(id, input.chatId, input.text, input.sourceLang, input.targetLang, resultJson);

    database
      .prepare(
        `UPDATE chats
         SET title = CASE WHEN title = 'New chat' THEN ? ELSE title END,
             source_lang = ?,
             target_lang = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .run(makeTitle(input.text), input.sourceLang, input.targetLang, input.chatId);
  });

  transaction();
  return getChat(input.chatId, input.userId);
}

export function setTurnSelection(input: { chatId: string; turnId: string; userId: string; selectedOption: number }) {
  const chat = getChat(input.chatId, input.userId);
  const turn = chat?.turns.find((entry) => entry.id === input.turnId);

  if (!chat || !turn || turn.result.translations[input.selectedOption] === undefined) {
    return null;
  }

  getDb()
    .prepare("UPDATE chat_turns SET selected_option = ? WHERE id = ? AND chat_id = ?")
    .run(input.selectedOption, input.turnId, input.chatId);

  return getChat(input.chatId, input.userId);
}

export function renameChat(chatId: string, userId: string, title: string) {
  const result = getDb()
    .prepare("UPDATE chats SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
    .run(title, chatId, userId);

  return result.changes > 0 ? getChat(chatId, userId) : null;
}

export function clearTurns(chatId: string, userId: string) {
  const database = getDb();
  const chat = getChat(chatId, userId);

  if (!chat) {
    return null;
  }

  database.transaction(() => {
    database.prepare("DELETE FROM chat_turns WHERE chat_id = ?").run(chatId);
    database
      .prepare("UPDATE chats SET title = 'New chat', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(chatId);
  })();

  return getChat(chatId, userId);
}

export function deleteChat(chatId: string, userId: string) {
  const result = getDb().prepare("DELETE FROM chats WHERE id = ? AND user_id = ?").run(chatId, userId);
  return result.changes > 0;
}
