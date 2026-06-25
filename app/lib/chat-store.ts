import type { ChatDetail, ChatSummary, ChatTurn } from "./chat-types";
import { getDb } from "./db";
import { autoDetectLanguage } from "./languages";
import { translationResponseSchema, type TranslationResponse } from "./translation-schema";

type ChatRow = {
  id: string;
  title: string;
  source_lang: string;
  target_lang: string;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  active_turn_id: string | null;
};

type TurnRow = {
  id: string;
  chat_id: string;
  parent_id: string | null;
  text: string;
  source_lang: string;
  target_lang: string;
  result_json: string;
  selected_option: number;
  created_at: string;
};

/** A turn as stored, before its branch position is resolved against its siblings. */
type StoredTurn = Omit<ChatTurn, "branchIndex" | "branchCount" | "siblingIds">;

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

function mapTurn(row: TurnRow): StoredTurn | null {
  const parsed = translationResponseSchema.safeParse(safeJsonParse(row.result_json));

  if (!parsed.success) {
    console.error(`Skipping unparseable chat turn ${row.id}:`, parsed.error?.message ?? "invalid JSON");
    return null;
  }

  const optionCount = parsed.data.translations.length;

  return {
    id: row.id,
    chatId: row.chat_id,
    parentId: row.parent_id,
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

/** Walk down the most-recently-created child at each step to the branch's leaf. */
function deepestLeaf(turns: { id: string; parentId: string | null }[], startId: string): string {
  const childrenByParent = new Map<string, string[]>();

  for (const turn of turns) {
    if (turn.parentId) {
      const children = childrenByParent.get(turn.parentId) ?? [];
      children.push(turn.id);
      childrenByParent.set(turn.parentId, children);
    }
  }

  let currentId = startId;

  for (let depth = 0; depth < turns.length; depth += 1) {
    const children = childrenByParent.get(currentId);

    if (!children?.length) {
      break;
    }

    currentId = children[children.length - 1];
  }

  return currentId;
}

/** The root-to-leaf path of turns for the chat's active branch, oldest first. */
function resolveActivePath(turns: StoredTurn[], activeTurnId: string | null): StoredTurn[] {
  if (!turns.length) {
    return [];
  }

  const byId = new Map(turns.map((turn) => [turn.id, turn]));
  const leaf = (activeTurnId ? byId.get(activeTurnId) : undefined) ?? turns[turns.length - 1];

  const path: StoredTurn[] = [];
  const seen = new Set<string>();
  let cursor: StoredTurn | undefined = leaf;

  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    path.push(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }

  return path.reverse();
}

function withBranchInfo(turn: StoredTurn, allTurns: StoredTurn[]): ChatTurn {
  const siblingIds = allTurns.filter((other) => other.parentId === turn.parentId).map((other) => other.id);

  return {
    ...turn,
    siblingIds,
    branchIndex: siblingIds.indexOf(turn.id),
    branchCount: siblingIds.length,
  };
}

export function getChat(chatId: string, userId: string): ChatDetail | null {
  const chat = getDb().prepare("SELECT * FROM chats WHERE id = ? AND user_id = ?").get(chatId, userId) as
    | ChatRow
    | undefined;

  if (!chat) {
    return null;
  }

  const rows = getDb()
    .prepare("SELECT * FROM chat_turns WHERE chat_id = ? ORDER BY created_at ASC, rowid ASC")
    .all(chatId) as TurnRow[];

  const allTurns = rows.map(mapTurn).filter((turn): turn is StoredTurn => turn !== null);

  return {
    ...mapChat(chat),
    turns: resolveActivePath(allTurns, chat.active_turn_id).map((turn) => withBranchInfo(turn, allTurns)),
  };
}

/**
 * The chat's locked language pair. The first turn fixes it from that turn's
 * languages, resolving an auto-detect source to the detected language so the
 * chat becomes a concrete bilingual pair; later turns never move it. While the
 * source is still auto-detect — e.g. the opening turn was itself written in the
 * target language, leaving the other side unknown — each turn keeps trying to
 * resolve it.
 */
function pinnedPair(
  chat: ChatDetail,
  turn: { sourceLang: string; targetLang: string; result: TranslationResponse },
): { sourceLang: string; targetLang: string } {
  const isFirstTurn = chat.turns.length === 0;
  const targetLang = isFirstTurn ? turn.targetLang : chat.targetLang;
  const baseSource = isFirstTurn ? turn.sourceLang : chat.sourceLang;

  if (baseSource !== autoDetectLanguage.code) {
    return { sourceLang: baseSource, targetLang };
  }

  const detected = turn.result.detectedSourceLanguage;
  return { sourceLang: detected !== targetLang ? detected : autoDetectLanguage.code, targetLang };
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

  const parentId = chat.turns.at(-1)?.id ?? null;
  const pinned = pinnedPair(chat, input);

  const transaction = database.transaction(() => {
    database
      .prepare(
        "INSERT INTO chat_turns (id, chat_id, parent_id, text, source_lang, target_lang, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
      )
      .run(id, input.chatId, parentId, input.text, input.sourceLang, input.targetLang, resultJson);

    database
      .prepare(
        `UPDATE chats
         SET title = CASE WHEN title = 'New chat' THEN ? ELSE title END,
             source_lang = ?,
             target_lang = ?,
             active_turn_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .run(makeTitle(input.text), pinned.sourceLang, pinned.targetLang, id, input.chatId);
  });

  transaction();
  return getChat(input.chatId, input.userId);
}

/**
 * Records an edited or regenerated turn as a new sibling version (same parent as
 * the original) and makes it the active branch, leaving the original version and
 * its replies intact as an alternate branch.
 */
export function branchTurn(input: {
  chatId: string;
  turnId: string;
  userId: string;
  text: string;
  result: TranslationResponse;
}) {
  const database = getDb();
  const chat = getChat(input.chatId, input.userId);
  const target = chat?.turns.find((turn) => turn.id === input.turnId);

  if (!chat || !target) {
    return null;
  }

  const id = crypto.randomUUID();

  database.transaction(() => {
    database
      .prepare(
        "INSERT INTO chat_turns (id, chat_id, parent_id, text, source_lang, target_lang, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
      )
      .run(id, input.chatId, target.parentId, input.text, target.sourceLang, target.targetLang, JSON.stringify(input.result));

    database
      .prepare("UPDATE chats SET active_turn_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(id, input.chatId);
  })();

  return getChat(input.chatId, input.userId);
}

/** Switches the active branch to the version `turnId`, landing on that branch's latest leaf. */
export function setActiveBranch(input: { chatId: string; turnId: string; userId: string }) {
  const database = getDb();
  const chat = database.prepare("SELECT id FROM chats WHERE id = ? AND user_id = ?").get(input.chatId, input.userId) as
    | { id: string }
    | undefined;

  if (!chat) {
    return null;
  }

  const rows = database
    .prepare("SELECT id, parent_id FROM chat_turns WHERE chat_id = ? ORDER BY created_at ASC, rowid ASC")
    .all(input.chatId) as Array<{ id: string; parent_id: string | null }>;

  if (!rows.some((row) => row.id === input.turnId)) {
    return null;
  }

  const leaf = deepestLeaf(
    rows.map((row) => ({ id: row.id, parentId: row.parent_id })),
    input.turnId,
  );

  database.prepare("UPDATE chats SET active_turn_id = ? WHERE id = ?").run(leaf, input.chatId);

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
      .prepare("UPDATE chats SET title = 'New chat', active_turn_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(chatId);
  })();

  return getChat(chatId, userId);
}

export function deleteChat(chatId: string, userId: string) {
  const result = getDb().prepare("DELETE FROM chats WHERE id = ? AND user_id = ?").run(chatId, userId);
  return result.changes > 0;
}
