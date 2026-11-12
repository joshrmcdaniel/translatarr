import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { TranslationResponse } from "../../app/lib/translation-schema";

// Set the path before loading modules that initialize the database path.
const testDir = mkdtempSync(join(tmpdir(), "translatarr-mcp-"));
process.env.SQLITE_PATH = join(testDir, "test.sqlite");
const { getDb } = await import("../../app/lib/db");
const store = await import("../../app/lib/chat-store");
const { createUser } = await import("../../app/lib/user-store");
const { updateSettingsOverrides } = await import("../../app/lib/settings-store");
const { registerTranslatarrTools, mcpInstructions } = await import("../../app/lib/mcp/tools");
const { MAX_MCP_RESULT_BYTES } = await import("../../app/lib/mcp/results");
const owner = createUser({ username: "owner", passwordHash: "unused", role: "admin" });
const other = createUser({ username: "other", passwordHash: "unused", role: "user" });
updateSettingsOverrides({ provider: "openai-compatible", baseUrl: "https://provider.invalid/v1", apiKey: "test-only-key", model: "test-model" });

function translation(text = "안녕하세요"): TranslationResponse {
  return { detectedSourceLanguage: "en", confidence: 1, keyWords: [], translations: [
    { text, sourceEquivalent: "Hello", romanization: "annyeonghaseyo", keyWords: [{ source: "Hello", target: text, romanization: "annyeonghaseyo" }] },
    { text, sourceEquivalent: "Hello", romanization: "annyeonghaseyo", keyWords: [] },
  ] };
}
let providerResult = translation();
let providerStatus = 200;
let calls: Array<{ messages: Array<{ role: string; content: string }> }> = [];
const realFetch = globalThis.fetch;
beforeEach(() => {
  getDb().exec("DELETE FROM chats");
  calls = [];
  providerStatus = 200;
  providerResult = translation();
  globalThis.fetch = async (_url, options) => {
    calls.push(JSON.parse(String(options?.body)));
    return Response.json(providerStatus === 200
      ? { choices: [{ message: { content: JSON.stringify(providerResult) } }] }
      : { error: { message: "secret-provider-detail", code: "insufficient_quota" } }, { status: providerStatus });
  };
});
after(() => {
  globalThis.fetch = realFetch;
  getDb().close();
  rmSync(testDir, { recursive: true, force: true });
});

async function connect(userId: string | undefined = owner.id) {
  const server = new McpServer({ name: "translatarr", version: "test" }, { instructions: mcpInstructions });
  registerTranslatarrTools(server);
  const client = new Client({ name: "mcp-test", version: "test" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const send = clientTransport.send.bind(clientTransport);
  clientTransport.send = (message, options) => send(message, { ...options,
    authInfo: userId ? { token: "test", clientId: userId, scopes: [] } : undefined });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  return await client.callTool({ name, arguments: args }) as CallToolResult;
}
function payload(result: CallToolResult) {
  assert.equal(result.content[0]?.type, "text");
  const text = result.content[0] as { type: "text"; text: string };
  assert.deepEqual(JSON.parse(text.text), result.structuredContent, "both client projections must contain the same information");
  assert.ok(Buffer.byteLength(JSON.stringify(result), "utf8") <= MAX_MCP_RESULT_BYTES);
  return result.structuredContent as Record<string, any>;
}
function chat(userId = owner.id, title = "Test", notes?: string) {
  return store.createChat({ userId, title, notes, sourceLang: "en", targetLang: "ko" })!;
}
function append(chatId: string, text = "Hello", result = translation(), userId = owner.id) {
  return store.addTurn({ chatId, userId, text, result, sourceLang: "en", targetLang: "ko", turnLimit: 1 })!.turns[0];
}

// Simulate the schema-keyword filtering described in the article, rather than
// assuming limits/defaults survive in the model-visible tool definition.
function modelSchema(schema: any): any {
  const allowed = new Set(["type", "description", "enum", "properties", "required", "additionalProperties", "items", "minItems", "anyOf", "oneOf", "allOf", "$ref", "$defs", "definitions"]);
  return Object.fromEntries(Object.entries(schema).filter(([key]) => allowed.has(key)).map(([key, value]) => {
    if (["properties", "$defs", "definitions"].includes(key)) return [key, Object.fromEntries(Object.entries(value as object).map(([name, child]) => [name, modelSchema(child)]))];
    if (["anyOf", "oneOf", "allOf"].includes(key)) return [key, (value as any[]).map(modelSchema)];
    if (key === "items" && typeof value === "object") return [key, modelSchema(value)];
    return [key, value];
  }));
}

test("discovery survives description budgets and schema normalization", async (t) => {
  const client = await connect(); t.after(() => client.close());
  assert.equal(client.getInstructions(), mcpInstructions);
  assert.ok(Buffer.byteLength(mcpInstructions) < 1000);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(({ name }) => name).sort(), ["add_turn", "create_chat", "get_chat", "get_turn", "list_chats", "list_languages", "translate"]);
  for (const tool of tools) {
    assert.ok(Buffer.byteLength(tool.description!) < 1000);
    assert.match(tool.description!, /translat|language|conversation/i);
    assert.equal(tool.annotations?.destructiveHint, false);
    assert.equal(tool.annotations?.readOnlyHint, !["create_chat", "add_turn"].includes(tool.name));
    assert.equal(tool.annotations?.openWorldHint, ["translate", "add_turn"].includes(tool.name));
    assert.equal(tool.annotations?.idempotentHint, !["translate", "create_chat", "add_turn"].includes(tool.name));
    assert.ok(Buffer.byteLength(JSON.stringify(modelSchema(tool.inputSchema))) < 5000);
  }
  const schemas = Object.fromEntries(tools.map(({ name, inputSchema }) => [name, modelSchema(inputSchema)]));
  assert.equal(schemas.translate.properties.text.maxLength, undefined);
  assert.match(schemas.translate.properties.text.description, /1-12000/);
  assert.match(schemas.create_chat.properties.title.description, /80/);
  assert.match(schemas.create_chat.properties.notes.description, /1-1000/);
  assert.match(schemas.translate.properties.tone.description, /1-60/);
  assert.match(schemas.list_chats.properties.limit.description, /1 to 20; default 10/);
  assert.match(schemas.get_turn.properties.limit.description, /1 to 2000; default 2000/);
  assert.equal(schemas.translate.properties.targetLang.enum.includes("auto"), false);
});

test("runtime validation rejects bounds even if a client hides them", async (t) => {
  const client = await connect(); t.after(() => client.close());
  for (const args of [{ limit: 0 }, { limit: 21 }, { limit: 1.5 }]) {
    assert.equal((await call(client, "list_chats", args)).isError, true);
  }
  for (const args of [
    { text: " ", sourceLang: "en", targetLang: "ko" },
    { text: "x".repeat(12001), sourceLang: "en", targetLang: "ko" },
    { text: "Hi", sourceLang: "en", targetLang: "auto" },
    { text: "Hi", sourceLang: "en", targetLang: "ko", tone: "x".repeat(61) },
  ]) assert.equal((await call(client, "translate", args)).isError, true);
  assert.equal((await call(client, "create_chat", { sourceLang: "en", targetLang: "ko", notes: "x".repeat(1001) })).isError, true);
  assert.equal(calls.length, 0);
});

test("text-only and structured-only clients see equivalent successful results", async (t) => {
  const client = await connect(); t.after(() => client.close());
  assert.ok(payload(await call(client, "list_languages")).languages.some((language: any) => language.code === "ko"));
  const result = await call(client, "translate", { text: "Hello", sourceLang: "en", targetLang: "ko" });
  assert.deepEqual(payload(result), providerResult);
  assert.equal(store.listChats(owner.id).length, 0);
});

test("missing authentication and foreign IDs/cursors never expose another user's data", async (t) => {
  const anonymous = await connect(""); t.after(() => anonymous.close());
  for (const name of ["list_languages", "list_chats"]) {
    const result = await call(anonymous, name);
    assert.equal(result.isError, true);
    assert.equal(payload(result).error.code, "unauthenticated");
  }
  const foreign = chat(other.id, "PRIVATE TITLE");
  const foreignTurn = append(foreign.id, "PRIVATE TEXT", translation(), other.id);
  const own = chat();
  const client = await connect(); t.after(() => client.close());
  for (const [name, args] of [
    ["get_chat", { chatId: foreign.id }],
    ["get_turn", { chatId: foreign.id, turnId: foreignTurn.id }],
    ["list_chats", { beforeChatId: foreign.id }],
    ["get_chat", { chatId: own.id, beforeTurnId: foreignTurn.id }],
    ["translate", { chatId: foreign.id, text: "Hello", sourceLang: "en", targetLang: "ko" }],
    ["add_turn", { chatId: foreign.id, text: "Hello", sourceLang: "en", targetLang: "ko" }],
  ] as const) {
    const result = await call(client, name, args);
    assert.equal(result.isError, true);
    assert.equal(payload(result).error.code, "not_found");
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
  }
  assert.equal(calls.length, 0);
});

test("chat pagination handles timestamp ties without repeats and omits notes", async (t) => {
  const expected = Array.from({ length: 25 }, (_, i) => chat(owner.id, `Chat ${i}`, "Private notes").id);
  getDb().prepare("UPDATE chats SET created_at = ?, updated_at = ?").run("2026-01-01", "2026-01-01");
  const client = await connect(); t.after(() => client.close());
  const seen: string[] = [];
  let cursor: string | undefined;
  do {
    const page = payload(await call(client, "list_chats", { beforeChatId: cursor }));
    assert.ok(page.chats.length <= 10);
    for (const item of page.chats) { assert.equal(item.notes, undefined); seen.push(item.id); }
    cursor = page.nextBeforeChatId ?? undefined;
    assert.equal(Boolean(cursor), page.hasMore);
  } while (cursor);
  assert.deepEqual(seen, expected.sort().reverse());
});

test("history previews and backward pagination preserve the active branch", async (t) => {
  const saved = chat();
  const ids = Array.from({ length: 13 }, (_, i) => append(saved.id, `Message ${i}`).id);
  const client = await connect(); t.after(() => client.close());
  const seen: string[] = [];
  let cursor: string | undefined;
  do {
    const page = payload(await call(client, "get_chat", { chatId: saved.id, beforeTurnId: cursor }));
    assert.equal(page.totalTurns, 13);
    assert.ok(page.turns.length <= 5);
    assert.equal(page.turns[0].result, undefined);
    assert.ok(page.turns[0].translationPreview);
    seen.unshift(...page.turns.map((turn: any) => turn.id));
    cursor = page.nextBeforeTurnId ?? undefined;
  } while (cursor);
  assert.deepEqual(seen, ids);
  const complete = payload(await call(client, "get_turn", { chatId: saved.id, turnId: ids[0] }));
  assert.equal(complete.format, "full");
  assert.equal(complete.turn.result.translations.length, 2);
  const branch = store.branchTurn({ chatId: saved.id, turnId: ids[10], userId: owner.id, text: "New branch", result: translation() })!;
  const current = payload(await call(client, "get_chat", { chatId: saved.id, limit: 20 }));
  assert.deepEqual(current.turns.map((turn: any) => turn.id), branch.turns.map((turn) => turn.id));
  const hidden = await call(client, "get_turn", { chatId: saved.id, turnId: ids[12] });
  assert.equal(payload(hidden).error.code, "not_found");
  const staleCursor = await call(client, "get_chat", { chatId: saved.id, beforeTurnId: ids[12] });
  assert.equal(payload(staleCursor).error.code, "not_found");
});

test("large Unicode turns survive byte budgets and chunk reconstruction exactly", async (t) => {
  const saved = chat(owner.id, "한".repeat(80), "배경".repeat(500));
  const huge = translation('한국어😀\\"\n'.repeat(1500));
  for (let i = 0; i < 25; i++) append(saved.id, `Turn ${i} ` + "😀".repeat(200), huge);
  const expected = store.getChat(saved.id, owner.id, { turnLimit: 1 })!.turns[0];
  const client = await connect(); t.after(() => client.close());
  const page = payload(await call(client, "get_chat", { chatId: saved.id, limit: 20 }));
  assert.equal(page.hasMore, true);
  assert.ok(page.nextBeforeTurnId);
  assert.ok(page.turns.length < 20, "byte budget should shrink the page");
  let offset: number | undefined;
  let hash: string | undefined;
  let serialized = "";
  do {
    const chunk = payload(await call(client, "get_turn", { chatId: saved.id, turnId: expected.id, offset }));
    assert.equal(chunk.format, "json_chunk");
    if (hash) assert.equal(chunk.sha256, hash);
    hash = chunk.sha256;
    serialized += chunk.data;
    offset = chunk.nextOffset ?? undefined;
  } while (offset !== undefined);
  assert.deepEqual(JSON.parse(serialized), expected);
  const invalid = await call(client, "get_turn", { chatId: saved.id, turnId: expected.id, offset: serialized.length + 1 });
  assert.equal(payload(invalid).error.code, "invalid_offset");
});

test("translation and append use only six recent turns plus persistent notes", async (t) => {
  const saved = chat(owner.id, "Context", "Close friends talking politely.");
  for (let i = 0; i < 10; i++) append(saved.id, `unique-message-${i}`);
  const client = await connect(); t.after(() => client.close());
  payload(await call(client, "translate", { chatId: saved.id, text: "Hello", sourceLang: "en", targetLang: "ko" }));
  assert.doesNotMatch(calls[0].messages[1].content, /unique-message-[0-3]/);
  assert.equal((calls[0].messages[1].content.match(/<turn>/g) ?? []).length, 6);
  assert.match(calls[0].messages[0].content, /Close friends talking politely/);
  const result = payload(await call(client, "add_turn", { chatId: saved.id, text: "Hello", sourceLang: "en", targetLang: "ko" }));
  assert.equal(result.saved, true);
  assert.equal(result.totalTurns, 11);
  assert.ok(result.turnId);
  assert.equal(result.turns, undefined);
  assert.equal((calls[1].messages[1].content.match(/<turn>/g) ?? []).length, 6);
  const complete = payload(await call(client, "get_turn", { chatId: saved.id, turnId: result.turnId }));
  assert.deepEqual(complete.turn.result, providerResult);
});

test("oversized unsaved results are explicit errors; large saves acknowledge success once", async (t) => {
  const client = await connect(); t.after(() => client.close());
  providerResult = translation("안녕😀".repeat(4000));
  const args = { text: "Hello", sourceLang: "en", targetLang: "ko" };
  const unsaved = await call(client, "translate", args);
  assert.equal(unsaved.isError, true);
  assert.equal(payload(unsaved).error.code, "result_too_large");
  assert.equal(store.listChats(owner.id).length, 0);
  const saved = chat();
  const result = payload(await call(client, "add_turn", { ...args, chatId: saved.id }));
  assert.equal(result.saved, true);
  assert.equal(store.getChat(saved.id, owner.id)!.totalTurns, 1);
  assert.equal(payload(await call(client, "get_turn", { chatId: saved.id, turnId: result.turnId })).format, "json_chunk");
});

test("error recovery stays visible in content without provider secrets", async (t) => {
  const client = await connect(); t.after(() => client.close());
  providerStatus = 429;
  const result = await call(client, "translate", { text: "Hello", sourceLang: "en", targetLang: "ko" });
  assert.equal(result.isError, true);
  const data = payload(result);
  assert.equal(data.error.code, "quota");
  assert.match(data.error.nextStep, /Settings/);
  assert.doesNotMatch(JSON.stringify(result), /secret-provider-detail|test-only-key/);
});

test("Streamable HTTP handshake and calls preserve instructions, auth and structured results", async (t) => {
  // mcp-handler owns a housekeeping interval but exposes no shutdown API.
  // Track it here so the integration test can release it without forcing exit.
  const intervals: NodeJS.Timeout[] = [];
  const setIntervalOriginal = globalThis.setInterval;
  t.mock.method(globalThis, "setInterval", (...args: Parameters<typeof setInterval>) => {
    const timer = setIntervalOriginal(...args);
    intervals.push(timer);
    return timer;
  });
  t.after(() => intervals.forEach(clearInterval));
  const handler = createMcpHandler(registerTranslatarrTools,
    { serverInfo: { name: "translatarr", version: "test" }, instructions: mcpInstructions },
    { basePath: "/api", disableSse: true });
  const secured = withMcpAuth(handler, async (_request, token) => token === "test-http-key"
    ? { token, clientId: owner.id, scopes: [] } : undefined, { required: true });
  const denied = await secured(new Request("https://translatarr.invalid/api/mcp", { method: "POST" }));
  assert.equal(denied.status, 401);
  const client = new Client({ name: "http-test", version: "test" });
  t.after(() => client.close());
  const transport = new StreamableHTTPClientTransport(new URL("https://translatarr.invalid/api/mcp"), {
    requestInit: { headers: { Authorization: "Bearer test-http-key" } },
    fetch: (input, init) => secured(new Request(input, init)),
  });
  await client.connect(transport);
  assert.equal(client.getInstructions(), mcpInstructions);
  assert.equal((await client.listTools()).tools.length, 7);
  assert.equal(payload(await call(client, "list_languages")).autoDetect, "auto");
});
