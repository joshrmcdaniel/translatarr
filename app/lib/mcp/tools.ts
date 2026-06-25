/**
 * Translatarr's MCP tool surface: translation plus chat/turn management, wrapping
 * the same services the REST API uses (`translation-service`, `chat-store`) so
 * MCP clients and HTTP clients share one code path. Each tool scopes data to the
 * authenticated user resolved in `auth.ts` and surfaced on `extra.authInfo`.
 *
 * Tool inputs use classic `zod` (the MCP SDK's schema dialect); language codes
 * are real enums built from the supported-language registry so clients see the
 * valid values. Results are returned as JSON text — the richest form for a
 * calling model — and expected failures (missing chat, provider/LLM errors) come
 * back as `isError` results rather than thrown exceptions, per MCP convention.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { addTurn, createChat, getChat, listChats } from "../chat-store";
import { autoDetectLanguage, languages } from "../languages";
import { contextFromTurns, translateText } from "../translation-service";

const MAX_TEXT_CHARS = 12000;

const supportedCodes = languages.map((language) => language.code) as [string, ...string[]];

const targetLangSchema = z.enum(supportedCodes).describe("Target language code.");
const sourceLangSchema = z
  .enum([autoDetectLanguage.code, ...supportedCodes])
  .describe("Source language code, or 'auto' to detect it.");
const textSchema = z.string().min(1).max(MAX_TEXT_CHARS).describe("The text to translate.");

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

function jsonResult(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error.";
}

export function registerTranslatarrTools(server: McpServer): void {
  server.registerTool(
    "translate",
    {
      title: "Translate text",
      description:
        "Translate text and return 2-3 ranked options, each with a key-word glossary, romanization, register/tone, and a back-translation. The result is not persisted. Pass chatId to borrow that chat's recent turns as disambiguation context.",
      inputSchema: {
        text: textSchema,
        sourceLang: sourceLangSchema,
        targetLang: targetLangSchema,
        chatId: z.string().min(1).optional().describe("Borrow this chat's recent turns as context."),
      },
    },
    async ({ text, sourceLang, targetLang, chatId }, extra) => {
      const userId = extra.authInfo?.clientId;
      if (!userId) {
        return errorResult("Not authenticated.");
      }

      let context;
      if (chatId) {
        const chat = getChat(chatId, userId);
        if (!chat) {
          return errorResult("Chat not found.");
        }
        context = contextFromTurns(chat.turns);
      }

      try {
        const result = await translateText({ text, sourceLang, targetLang, userId, context });
        return jsonResult(result);
      } catch (error) {
        return errorResult(describeError(error));
      }
    },
  );

  server.registerTool(
    "list_chats",
    {
      title: "List chats",
      description: "List the caller's saved translation chats, newest first.",
      inputSchema: {},
    },
    async (_args, extra) => {
      const userId = extra.authInfo?.clientId;
      if (!userId) {
        return errorResult("Not authenticated.");
      }

      return jsonResult(listChats(userId));
    },
  );

  server.registerTool(
    "get_chat",
    {
      title: "Get a chat",
      description: "Fetch one of the caller's chats with its full turn history.",
      inputSchema: { chatId: z.string().min(1).describe("The chat id.") },
    },
    async ({ chatId }, extra) => {
      const userId = extra.authInfo?.clientId;
      if (!userId) {
        return errorResult("Not authenticated.");
      }

      const chat = getChat(chatId, userId);
      return chat ? jsonResult(chat) : errorResult("Chat not found.");
    },
  );

  server.registerTool(
    "create_chat",
    {
      title: "Create a chat",
      description: "Create an empty chat for a language pair, returning its id.",
      inputSchema: {
        sourceLang: sourceLangSchema,
        targetLang: targetLangSchema,
        title: z.string().trim().max(80).optional().describe("Optional chat title."),
      },
    },
    async ({ sourceLang, targetLang, title }, extra) => {
      const userId = extra.authInfo?.clientId;
      if (!userId) {
        return errorResult("Not authenticated.");
      }

      const chat = createChat({ sourceLang, targetLang, title, userId });
      return chat ? jsonResult(chat) : errorResult("Could not create chat.");
    },
  );

  server.registerTool(
    "add_turn",
    {
      title: "Translate and save to a chat",
      description:
        "Translate text and append it to a chat as a new persisted turn, using the chat's recent turns as context. Returns the updated chat.",
      inputSchema: {
        chatId: z.string().min(1).describe("The chat to append to."),
        text: textSchema,
        sourceLang: sourceLangSchema,
        targetLang: targetLangSchema,
      },
    },
    async ({ chatId, text, sourceLang, targetLang }, extra) => {
      const userId = extra.authInfo?.clientId;
      if (!userId) {
        return errorResult("Not authenticated.");
      }

      const existing = getChat(chatId, userId);
      if (!existing) {
        return errorResult("Chat not found.");
      }

      try {
        const result = await translateText({
          text,
          sourceLang,
          targetLang,
          userId,
          context: contextFromTurns(existing.turns),
        });
        const chat = addTurn({ chatId, userId, result, text, sourceLang, targetLang });
        return chat ? jsonResult(chat) : errorResult("Chat not found.");
      } catch (error) {
        return errorResult(describeError(error));
      }
    },
  );

  server.registerTool(
    "list_languages",
    {
      title: "List supported languages",
      description: "List the supported language codes for sourceLang/targetLang. 'auto' is valid only as a source.",
      inputSchema: {},
    },
    async () => {
      return jsonResult({
        languages: languages.map((language) => ({ code: language.code, name: language.name })),
        autoDetect: autoDetectLanguage.code,
      });
    },
  );
}
