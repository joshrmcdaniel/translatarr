/**
 * OpenAPI 3.1 description of the routes meant to be called from outside the web
 * UI (translation, chats, speech, and API-key management).
 *
 * Request bodies are generated from the routes' own Zod request schemas
 * (`request-schemas.ts`) via `z.toJSONSchema`, so the documented inputs — down
 * to the language-code enums — are exactly what the handlers validate and can't
 * drift. The `TranslationResponse` schema is likewise generated from Zod.
 * Responses and the wrapper shapes have no runtime schema to introspect (the
 * handlers build them ad hoc), and App Router exposes no path/method metadata,
 * so those are described by hand. Served as JSON by `/api/docs/openapi.json`.
 */

import { z } from "zod/v4";
import { autoDetectLanguage, languages } from "./languages";
import {
  createChatBodySchema,
  createKeyBodySchema,
  createTurnBodySchema,
  synthesizeBodySchema,
  translateBodySchema,
  updateChatBodySchema,
  updateTurnBodySchema,
} from "./request-schemas";
import { translationResponseSchema } from "./translation-schema";
import { APP_VERSION } from "./version";

function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  // OpenAPI component/inline schemas don't carry the JSON Schema dialect marker.
  delete json.$schema;
  return json;
}

function jsonRequestBody(schema: z.ZodType) {
  return { required: true, content: { "application/json": { schema: jsonSchemaOf(schema) } } };
}

const languageRef = { $ref: "#/components/schemas/LanguageCode" };
const dateTime = { type: "string", format: "date-time" } as const;
const nullableDateTime = { type: ["string", "null"], format: "date-time" } as const;

const jsonError = {
  description: "Error",
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
};

function chatResponse(description: string) {
  return {
    description,
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: ["chat"],
          properties: { chat: { $ref: "#/components/schemas/ChatDetail" } },
        },
      },
    },
  };
}

const sharedResponses = {
  BadRequest: jsonError,
  Unauthorized: jsonError,
  NotFound: jsonError,
  Unprocessable: jsonError,
  ProviderError: jsonError,
};

export function buildOpenApiDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Translatarr API",
      version: APP_VERSION,
      description:
        "Programmatic access to Translatarr. Authenticate with a personal API key " +
        "(`Authorization: Bearer <token>`, minted under Settings → API keys) or the " +
        "browser session cookie. Covers the routes intended for use outside the web UI.",
    },
    servers: [{ url: "/", description: "This instance" }],
    security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    tags: [
      { name: "Translate", description: "One-off translation." },
      { name: "Chats", description: "Persisted translation threads and their turns." },
      { name: "Speech", description: "Provider-backed transcription and synthesis." },
      { name: "API keys", description: "Personal access tokens (scoped to the caller)." },
    ],
    paths: {
      "/api/translate": {
        post: {
          tags: ["Translate"],
          operationId: "translate",
          summary: "Translate text (not persisted)",
          description:
            "Returns ranked translation options, per-option glossary, romanization, and a back-translation. " +
            "Pass `chatId` to borrow that chat's recent turns as disambiguation context; the result is not stored.",
          requestBody: jsonRequestBody(translateBodySchema),
          responses: {
            "200": {
              description: "Translation result.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/TranslationResponse" } },
              },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": { $ref: "#/components/responses/NotFound" },
            "422": { $ref: "#/components/responses/Unprocessable" },
            "502": { $ref: "#/components/responses/ProviderError" },
          },
        },
      },
      "/api/chats": {
        get: {
          tags: ["Chats"],
          operationId: "listChats",
          summary: "List the caller's chats",
          responses: {
            "200": {
              description: "The caller's chats, newest first.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["chats"],
                    properties: {
                      chats: { type: "array", items: { $ref: "#/components/schemas/ChatSummary" } },
                    },
                  },
                },
              },
            },
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
        post: {
          tags: ["Chats"],
          operationId: "createChat",
          summary: "Create a chat",
          requestBody: jsonRequestBody(createChatBodySchema),
          responses: {
            "201": chatResponse("The created chat."),
            "400": { $ref: "#/components/responses/BadRequest" },
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
      },
      "/api/chats/{chatId}": {
        parameters: [{ name: "chatId", in: "path", required: true, schema: { type: "string" } }],
        get: {
          tags: ["Chats"],
          operationId: "getChat",
          summary: "Fetch a chat with its turns",
          responses: {
            "200": chatResponse("The chat and its turns."),
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
        patch: {
          tags: ["Chats"],
          operationId: "updateChat",
          summary: "Clear turns or rename a chat",
          requestBody: jsonRequestBody(updateChatBodySchema),
          responses: {
            "200": chatResponse("The updated chat."),
            "400": { $ref: "#/components/responses/BadRequest" },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
        delete: {
          tags: ["Chats"],
          operationId: "deleteChat",
          summary: "Delete a chat",
          responses: {
            "200": {
              description: "Deleted.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Ok" } } },
            },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/api/chats/{chatId}/turns": {
        parameters: [{ name: "chatId", in: "path", required: true, schema: { type: "string" } }],
        post: {
          tags: ["Chats"],
          operationId: "createTurn",
          summary: "Translate and persist a turn",
          description:
            "Translates `text` and appends it to the chat. Supply `result` (a prior translation of this exact " +
            "text and language pair) to persist it without a second LLM call.",
          requestBody: jsonRequestBody(createTurnBodySchema),
          responses: {
            "200": chatResponse("The chat including the new turn."),
            "400": { $ref: "#/components/responses/BadRequest" },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": { $ref: "#/components/responses/NotFound" },
            "422": { $ref: "#/components/responses/Unprocessable" },
            "502": { $ref: "#/components/responses/ProviderError" },
          },
        },
      },
      "/api/chats/{chatId}/turns/{turnId}": {
        parameters: [
          { name: "chatId", in: "path", required: true, schema: { type: "string" } },
          { name: "turnId", in: "path", required: true, schema: { type: "string" } },
        ],
        patch: {
          tags: ["Chats"],
          operationId: "updateTurn",
          summary: "Select an option, retranslate, or switch branch",
          requestBody: jsonRequestBody(updateTurnBodySchema),
          responses: {
            "200": chatResponse("The updated chat."),
            "400": { $ref: "#/components/responses/BadRequest" },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": { $ref: "#/components/responses/NotFound" },
            "422": { $ref: "#/components/responses/Unprocessable" },
            "502": { $ref: "#/components/responses/ProviderError" },
          },
        },
      },
      "/api/speech/transcribe": {
        post: {
          tags: ["Speech"],
          operationId: "transcribe",
          summary: "Transcribe audio to text",
          description: "Requires a configured speech provider. Audio ≤ 15 MB.",
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["file"],
                  properties: {
                    file: { type: "string", format: "binary" },
                    language: { ...languageRef, description: "Optional language hint." },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Transcribed text.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["text"],
                    properties: { text: { type: "string" } },
                  },
                },
              },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "502": { $ref: "#/components/responses/ProviderError" },
          },
        },
      },
      "/api/speech/synthesize": {
        post: {
          tags: ["Speech"],
          operationId: "synthesize",
          summary: "Synthesize speech from text",
          description: "Requires a configured speech provider. Returns streamed MP3 audio.",
          requestBody: jsonRequestBody(synthesizeBodySchema),
          responses: {
            "200": {
              description: "MP3 audio stream.",
              content: { "audio/mpeg": { schema: { type: "string", format: "binary" } } },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "502": { $ref: "#/components/responses/ProviderError" },
          },
        },
      },
      "/api/keys": {
        get: {
          tags: ["API keys"],
          operationId: "listApiKeys",
          summary: "List the caller's API keys",
          responses: {
            "200": {
              description: "The caller's API keys (no secrets).",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["keys"],
                    properties: {
                      keys: { type: "array", items: { $ref: "#/components/schemas/ApiKey" } },
                    },
                  },
                },
              },
            },
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
        post: {
          tags: ["API keys"],
          operationId: "createApiKey",
          summary: "Mint an API key",
          description: "The plaintext `token` is returned only here, once.",
          requestBody: jsonRequestBody(createKeyBodySchema),
          responses: {
            "201": {
              description: "The created key and its one-time token.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CreatedApiKey" },
                },
              },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
      },
      "/api/keys/{keyId}": {
        parameters: [{ name: "keyId", in: "path", required: true, schema: { type: "string" } }],
        delete: {
          tags: ["API keys"],
          operationId: "revokeApiKey",
          summary: "Revoke an API key",
          responses: {
            "200": {
              description: "Revoked.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Ok" } } },
            },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "A personal API key (`tra_…`) from Settings → API keys.",
        },
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "translatarr_session",
          description: "The browser session cookie (used automatically when logged in).",
        },
      },
      responses: sharedResponses,
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: { type: "string" },
            code: { type: "string", description: "Provider error code, when applicable." },
          },
        },
        Ok: {
          type: "object",
          required: ["ok"],
          properties: { ok: { type: "boolean", const: true } },
        },
        LanguageCode: {
          type: "string",
          description: 'A supported language code, or "auto" for source detection.',
          enum: [...languages.map((language) => language.code), autoDetectLanguage.code],
        },
        TranslationResponse: jsonSchemaOf(translationResponseSchema),
        ChatSummary: {
          type: "object",
          required: ["id", "title", "sourceLang", "targetLang", "createdAt", "updatedAt"],
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            sourceLang: languageRef,
            targetLang: languageRef,
            createdAt: dateTime,
            updatedAt: dateTime,
          },
        },
        ChatTurn: {
          type: "object",
          required: [
            "id",
            "chatId",
            "text",
            "sourceLang",
            "targetLang",
            "result",
            "selectedOption",
            "createdAt",
            "parentId",
            "branchIndex",
            "branchCount",
            "siblingIds",
          ],
          properties: {
            id: { type: "string" },
            chatId: { type: "string" },
            text: { type: "string" },
            sourceLang: languageRef,
            targetLang: languageRef,
            result: { $ref: "#/components/schemas/TranslationResponse" },
            selectedOption: {
              type: "integer",
              minimum: 0,
              description: "Index into result.translations of the chosen option.",
            },
            createdAt: dateTime,
            parentId: { type: ["string", "null"], description: "Parent turn id; null for a root turn." },
            branchIndex: { type: "integer" },
            branchCount: { type: "integer" },
            siblingIds: { type: "array", items: { type: "string" } },
          },
        },
        ChatDetail: {
          allOf: [
            { $ref: "#/components/schemas/ChatSummary" },
            {
              type: "object",
              required: ["turns"],
              properties: {
                turns: { type: "array", items: { $ref: "#/components/schemas/ChatTurn" } },
              },
            },
          ],
        },
        ApiKey: {
          type: "object",
          required: ["id", "userId", "name", "prefix", "createdAt", "lastUsedAt", "expiresAt"],
          properties: {
            id: { type: "string" },
            userId: { type: "string" },
            name: { type: "string" },
            prefix: { type: "string", description: "Leading characters of the token, for display." },
            createdAt: dateTime,
            lastUsedAt: nullableDateTime,
            expiresAt: nullableDateTime,
          },
        },
        CreatedApiKey: {
          type: "object",
          required: ["apiKey", "token"],
          properties: {
            apiKey: { $ref: "#/components/schemas/ApiKey" },
            token: { type: "string", description: "The plaintext token, shown only once." },
          },
        },
      },
    },
  };
}
