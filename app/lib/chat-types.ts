import type { TranslationResponse } from "./translation-schema";

export type ChatSummary = {
  id: string;
  title: string;
  sourceLang: string;
  targetLang: string;
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
  turns: ChatTurn[];
};
