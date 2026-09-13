import type { TranslationResponse } from "./translation-schema";

/**
 * Upper bound on a chat's `notes` — persistent background the user supplies for
 * the whole conversation (domain, register, who's talking to whom). Shared by
 * the client (textarea `maxLength`), `request-schemas.ts`, and the MCP tools so
 * all three enforce the same limit.
 */
export const MAX_CHAT_NOTES_CHARS = 1000;

export type ChatSummary = {
  id: string;
  title: string;
  sourceLang: string;
  targetLang: string;
  /** Persistent background for this chat, injected into every translation's system prompt; null when unset. */
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChatTurn = {
  id: string;
  chatId: string;
  text: string;
  sourceLang: string;
  targetLang: string;
  result: TranslationResponse;
  /** Index into result.translations of the option the user chose (0 = top-ranked default). */
  selectedOption: number;
  createdAt: string;
  /** Parent turn in the branch tree; null for a root turn. */
  parentId: string | null;
  /** Position of this turn among its sibling versions (same parent), in creation order. */
  branchIndex: number;
  /** Number of sibling versions sharing this turn's parent (1 = no alternate versions). */
  branchCount: number;
  /** Sibling turn ids including this one, in creation order, for branch navigation. */
  siblingIds: string[];
};

export type ChatDetail = ChatSummary & {
  /** Turns of the active branch, oldest first — possibly a window of the most recent ones (see totalTurns). */
  turns: ChatTurn[];
  /** Total turns on the active branch, independent of any window applied to `turns`. */
  totalTurns: number;
};
