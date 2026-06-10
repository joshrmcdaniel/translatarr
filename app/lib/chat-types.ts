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
  createdAt: string;
};

export type ChatDetail = ChatSummary & {
  turns: ChatTurn[];
};
