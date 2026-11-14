import { createHash } from "node:crypto";
import type { CallToolResult } from "@modelcontextprotocol/server";
import type { ChatTurn } from "../chat-types";

// Includes BOTH representations and JSON escaping, leaving headroom for client wrappers.
export const MAX_MCP_RESULT_BYTES = 24_000;

export function jsonResult(data: Record<string, unknown>, isError = false): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
    structuredContent: data,
    ...(isError ? { isError: true } : {}),
  };
}

export function errorResult(code: string, message: string, nextStep: string): CallToolResult {
  // Keep all recovery information in content too: some clients hide structured errors.
  return jsonResult({ error: { code, message, nextStep } }, true);
}

export function fitsResult(data: Record<string, unknown>): boolean {
  return Buffer.byteLength(JSON.stringify(jsonResult(data)), "utf8") <= MAX_MCP_RESULT_BYTES;
}

export function compactTurn(turn: ChatTurn) {
  const selected = turn.result.translations[turn.selectedOption] ?? turn.result.translations[0];
  return {
    id: turn.id,
    sourceLang: turn.sourceLang,
    targetLang: turn.targetLang,
    selectedOption: turn.selectedOption,
    createdAt: turn.createdAt,
    branchCount: turn.branchCount,
    textPreview: Array.from(turn.text).slice(0, 160).join(""),
    translationPreview: Array.from(selected.text).slice(0, 160).join(""),
  };
}

/** Full structured turns when small; lossless Unicode-safe JSON pages otherwise. */
export function turnResult(turn: ChatTurn, offset: number | undefined, limit: number): CallToolResult {
  const full = { format: "full", turn };
  if (offset === undefined && fitsResult(full)) return jsonResult(full);
  const serialized = JSON.stringify(turn);
  const chars = Array.from(serialized);
  const start = offset ?? 0;
  if (start > chars.length) {
    return errorResult("invalid_offset", "Offset exceeds this turn's JSON length.", "Restart get_turn without offset.");
  }
  const end = Math.min(start + limit, chars.length);
  return jsonResult({
    format: "json_chunk",
    chatId: turn.chatId,
    turnId: turn.id,
    sha256: createHash("sha256").update(serialized).digest("hex"),
    offset: start,
    nextOffset: end < chars.length ? end : null,
    totalChars: chars.length,
    instructions: "Concatenate data strings in offset order, then JSON.parse. Restart if sha256 changes. Offsets count Unicode code points.",
    data: chars.slice(start, end).join(""),
  });
}
