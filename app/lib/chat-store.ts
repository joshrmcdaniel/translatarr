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

/** A turn's branch-tree position, loaded without parsing its stored result. */
type TurnMeta = { id: string; parentId: string | null };

/** A turn as stored, before its branch position is resolved against its siblings. */
type StoredTurn = Omit<ChatTurn, "branchIndex" | "branchCount" | "siblingIds">;

/** Windowing options for the turns returned on a `ChatDetail`. */
export type TurnWindowOptions = {
  /** Return only the most recent N turns of the active branch; `totalTurns` still counts them all. */
  turnLimit?: number;
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

function chatRow(chatId: string, userId: string): ChatRow | undefined {
  return getDb().prepare("SELECT * FROM chats WHERE id = ? AND user_id = ?").get(chatId, userId) as ChatRow | undefined;
}

/** Every turn's branch-tree position for a chat, in creation order. */
function loadTurnMetas(chatId: string): TurnMeta[] {
  const rows = getDb()
    .prepare("SELECT id, parent_id FROM chat_turns WHERE chat_id = ? ORDER BY created_at ASC, rowid ASC")
    .all(chatId) as Array<{ id: string; parent_id: string | null }>;

  return rows.map((row) => ({ id: row.id, parentId: row.parent_id }));
}

/** Walk down the most-recently-created child at each step to the branch's leaf. */
function deepestLeaf(turns: TurnMeta[], startId: string): string {
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

/** The root-to-leaf turn ids of the chat's active branch, oldest first. */
function resolveActivePathIds(metas: TurnMeta[], activeTurnId: string | null): string[] {
  if (!metas.length) {
    return [];
  }

  const byId = new Map(metas.map((meta) => [meta.id, meta]));
  const leaf = (activeTurnId ? byId.get(activeTurnId) : undefined) ?? metas[metas.length - 1];

  const pathIds: string[] = [];
  const seen = new Set<string>();
  let cursor: TurnMeta | undefined = leaf;

  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    pathIds.push(cursor.id);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }

  return pathIds.reverse();
}

const turnQueryChunkSize = 500;

/** Loads and parses the given turns, preserving the input id order. */
function loadTurns(chatId: string, ids: string[]): StoredTurn[] {
  if (!ids.length) {
    return [];
  }

  const database = getDb();
  const rowById = new Map<string, TurnRow>();

  for (let start = 0; start < ids.length; start += turnQueryChunkSize) {
    const chunk = ids.slice(start, start + turnQueryChunkSize);
    const placeholders = chunk.map(() => "?").join(", ");
    const rows = database
      .prepare(`SELECT * FROM chat_turns WHERE chat_id = ? AND id IN (${placeholders})`)
      .all(chatId, ...chunk) as TurnRow[];

    for (const row of rows) {
      rowById.set(row.id, row);
    }
  }

  return ids
    .map((id) => rowById.get(id))
    .filter((row): row is TurnRow => row !== undefined)
    .map(mapTurn)
    .filter((turn): turn is StoredTurn => turn !== null);
}

function withBranchInfo(turn: StoredTurn, metas: TurnMeta[]): ChatTurn {
  const siblingIds = metas.filter((meta) => meta.parentId === turn.parentId).map((meta) => meta.id);

  return {
    ...turn,
    siblingIds,
    branchIndex: siblingIds.indexOf(turn.id),
    branchCount: siblingIds.length,
  };
}

export function getChat(chatId: string, userId: string, options: TurnWindowOptions = {}): ChatDetail | null {
  const chat = chatRow(chatId, userId);

  if (!chat) {
    return null;
  }

  const metas = loadTurnMetas(chatId);
  const pathIds = resolveActivePathIds(metas, chat.active_turn_id);
  const windowIds = options.turnLimit !== undefined ? pathIds.slice(-options.turnLimit) : pathIds;

  return {
    ...mapChat(chat),
    totalTurns: pathIds.length,
    turns: loadTurns(chatId, windowIds).map((turn) => withBranchInfo(turn, metas)),
  };
}

/** A single turn by id, provided it lies on the chat's active branch. */
export function getTurn(chatId: string, userId: string, turnId: string): ChatTurn | null {
  const chat = chatRow(chatId, userId);

  if (!chat) {
    return null;
  }

  const metas = loadTurnMetas(chatId);
  const pathIds = resolveActivePathIds(metas, chat.active_turn_id);

  if (!pathIds.includes(turnId)) {
    return null;
  }

  const [turn] = loadTurns(chatId, [turnId]);
  return turn ? withBranchInfo(turn, metas) : null;
}

/**
 * A window of the chat's active-branch turns, oldest first: the `limit` turns
 * ending just before `beforeTurnId`, or the most recent `limit` when it is
 * omitted. `hasMore` reports whether older turns remain before the window.
 */
export function listTurns(input: {
  chatId: string;
  userId: string;
  limit: number;
  beforeTurnId?: string;
}): { turns: ChatTurn[]; hasMore: boolean } | null {
  const chat = chatRow(input.chatId, input.userId);

  if (!chat) {
    return null;
  }

  const metas = loadTurnMetas(input.chatId);
  const pathIds = resolveActivePathIds(metas, chat.active_turn_id);
  const end = input.beforeTurnId !== undefined ? pathIds.indexOf(input.beforeTurnId) : pathIds.length;

  if (end === -1) {
    return null;
  }

  const start = Math.max(0, end - input.limit);

  return {
    turns: loadTurns(input.chatId, pathIds.slice(start, end)).map((turn) => withBranchInfo(turn, metas)),
    hasMore: start > 0,
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
  chat: { sourceLang: string; targetLang: string },
  isFirstTurn: boolean,
  turn: { sourceLang: string; targetLang: string; result: TranslationResponse },
): { sourceLang: string; targetLang: string } {
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
  turnLimit?: number;
}) {
  const database = getDb();
  const chat = chatRow(input.chatId, input.userId);

  if (!chat) {
    return null;
  }

  const pathIds = resolveActivePathIds(loadTurnMetas(input.chatId), chat.active_turn_id);
  const id = crypto.randomUUID();
  const parentId = pathIds.at(-1) ?? null;
  const pinned = pinnedPair(
    { sourceLang: chat.source_lang, targetLang: chat.target_lang },
    pathIds.length === 0,
    input,
  );

  const transaction = database.transaction(() => {
    database
      .prepare(
        "INSERT INTO chat_turns (id, chat_id, parent_id, text, source_lang, target_lang, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
      )
      .run(id, input.chatId, parentId, input.text, input.sourceLang, input.targetLang, JSON.stringify(input.result));

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
  return getChat(input.chatId, input.userId, { turnLimit: input.turnLimit });
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
  turnLimit?: number;
}) {
  const database = getDb();
  const target = getTurn(input.chatId, input.userId, input.turnId);

  if (!target) {
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

  return getChat(input.chatId, input.userId, { turnLimit: input.turnLimit });
}

/** Switches the active branch to the version `turnId`, landing on that branch's latest leaf. */
export function setActiveBranch(input: { chatId: string; turnId: string; userId: string; turnLimit?: number }) {
  const database = getDb();
  const chat = chatRow(input.chatId, input.userId);

  if (!chat) {
    return null;
  }

  const metas = loadTurnMetas(input.chatId);

  if (!metas.some((meta) => meta.id === input.turnId)) {
    return null;
  }

  const leaf = deepestLeaf(metas, input.turnId);

  database.prepare("UPDATE chats SET active_turn_id = ? WHERE id = ?").run(leaf, input.chatId);

  return getChat(input.chatId, input.userId, { turnLimit: input.turnLimit });
}

export function setTurnSelection(input: {
  chatId: string;
  turnId: string;
  userId: string;
  selectedOption: number;
  turnLimit?: number;
}) {
  const turn = getTurn(input.chatId, input.userId, input.turnId);

  if (!turn || turn.result.translations[input.selectedOption] === undefined) {
    return null;
  }

  getDb()
    .prepare("UPDATE chat_turns SET selected_option = ? WHERE id = ? AND chat_id = ?")
    .run(input.selectedOption, input.turnId, input.chatId);

  return getChat(input.chatId, input.userId, { turnLimit: input.turnLimit });
}

export function renameChat(chatId: string, userId: string, title: string, turnLimit?: number) {
  const result = getDb()
    .prepare("UPDATE chats SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
    .run(title, chatId, userId);

  return result.changes > 0 ? getChat(chatId, userId, { turnLimit }) : null;
}

export function clearTurns(chatId: string, userId: string, turnLimit?: number) {
  const database = getDb();

  if (!chatRow(chatId, userId)) {
    return null;
  }

  database.transaction(() => {
    database.prepare("DELETE FROM chat_turns WHERE chat_id = ?").run(chatId);
    database
      .prepare("UPDATE chats SET title = 'New chat', active_turn_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(chatId);
  })();

  return getChat(chatId, userId, { turnLimit });
}

export function deleteChat(chatId: string, userId: string) {
  const result = getDb().prepare("DELETE FROM chats WHERE id = ? AND user_id = ?").run(chatId, userId);
  return result.changes > 0;
}
