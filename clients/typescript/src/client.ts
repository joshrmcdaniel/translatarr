/**
 * Translatarr API client.
 *
 * A single Promise-based client over `fetch` (no sync/async split is needed in
 * JS). Authenticate with a personal API key (`Authorization: Bearer <token>`,
 * minted under Settings → API keys) or, for a browser-derived session, the
 * `translatarr_session` cookie value.
 */

import * as core from "./core";
import { raiseForStatus } from "./errors";
import type {
    ApiKey,
    ChatDetail,
    ChatSummary,
    CreatedApiKey,
    TranslationResponse,
} from "./models";
import type { SourceLang, TargetLang } from "./languages";

/** A binary audio payload accepted by `transcribe`. */
export type AudioInput = Blob | ArrayBuffer | Uint8Array;

/** Options for constructing a {@link TranslatarrClient}. */
export interface TranslatarrClientOptions {
    /** Personal API key (`tra_…`). At least one of `token`/`sessionCookie` is required. */
    token?: string;
    /** Browser `translatarr_session` cookie value, as an alternative to `token`. */
    sessionCookie?: string;
    /** Per-request timeout in milliseconds (default 30000). */
    timeoutMs?: number;
    /** Override the `fetch` implementation (defaults to the global `fetch`). */
    fetch?: typeof fetch;
}

export class TranslatarrClient {
    readonly #baseUrl: string;
    readonly #headers: Record<string, string>;
    readonly #timeoutMs: number;
    readonly #fetch: typeof fetch;

    constructor(baseUrl: string, options: TranslatarrClientOptions = {}) {
        const { token, sessionCookie, timeoutMs = 30000, fetch: fetchImpl } = options;
        if (!token && !sessionCookie) {
            throw new Error("Provide either token or sessionCookie to authenticate.");
        }

        this.#baseUrl = baseUrl.replace(/\/+$/, "");
        this.#headers = { Accept: "application/json" };
        if (token) {
            this.#headers.Authorization = `Bearer ${token}`;
        }
        if (sessionCookie) {
            this.#headers.Cookie = `translatarr_session=${sessionCookie}`;
        }
        this.#timeoutMs = timeoutMs;
        this.#fetch = fetchImpl ?? globalThis.fetch;
    }

    async #send(
        method: string,
        path: string,
        body?: { json?: unknown; form?: FormData },
    ): Promise<Response> {
        const headers = { ...this.#headers };
        let payload: BodyInit | undefined;
        if (body?.json !== undefined) {
            headers["Content-Type"] = "application/json";
            payload = JSON.stringify(body.json);
        } else if (body?.form !== undefined) {
            payload = body.form;
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
        let response: Response;
        try {
            response = await this.#fetch(`${this.#baseUrl}${path}`, {
                method,
                headers,
                body: payload,
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timer);
        }

        await raiseForStatus(response);
        return response;
    }

    async #sendJson(method: string, path: string, body?: { json?: unknown; form?: FormData }): Promise<unknown> {
        const response = await this.#send(method, path, body);
        return response.json();
    }

    // --- translation -----------------------------------------------------

    /**
     * Translate `text` without persisting it. Pass `chatId` to borrow that
     * chat's recent turns as disambiguation context; the result is still not
     * stored.
     */
    async translate(
        text: string,
        options: { sourceLang: SourceLang; targetLang: TargetLang; chatId?: string },
    ): Promise<TranslationResponse> {
        const body = core.translateBody(text, options.sourceLang, options.targetLang, options.chatId);
        return core.readTranslation(await this.#sendJson("POST", "/api/translate", { json: body }));
    }

    // --- chats -----------------------------------------------------------

    /** List the caller's chats, newest first. */
    async listChats(): Promise<ChatSummary[]> {
        return core.readChats(await this.#sendJson("GET", "/api/chats"));
    }

    /** Create an empty chat for a language pair. */
    async createChat(options: {
        sourceLang: SourceLang;
        targetLang: TargetLang;
        title?: string;
    }): Promise<ChatDetail> {
        const body = core.createChatBody(options.sourceLang, options.targetLang, options.title);
        return core.readChat(await this.#sendJson("POST", "/api/chats", { json: body }));
    }

    /** Fetch a chat together with its ordered turns. */
    async getChat(chatId: string): Promise<ChatDetail> {
        return core.readChat(await this.#sendJson("GET", `/api/chats/${encodeURIComponent(chatId)}`));
    }

    /** Rename a chat. */
    async renameChat(chatId: string, options: { title: string }): Promise<ChatDetail> {
        const body = core.renameChatBody(options.title);
        return core.readChat(await this.#sendJson("PATCH", `/api/chats/${encodeURIComponent(chatId)}`, { json: body }));
    }

    /** Delete every turn in a chat, keeping the chat itself. */
    async clearChat(chatId: string): Promise<ChatDetail> {
        return core.readChat(
            await this.#sendJson("PATCH", `/api/chats/${encodeURIComponent(chatId)}`, { json: core.CLEAR_CHAT_BODY }),
        );
    }

    /** Delete a chat and all of its turns. */
    async deleteChat(chatId: string): Promise<void> {
        await this.#send("DELETE", `/api/chats/${encodeURIComponent(chatId)}`);
    }

    // --- turns -----------------------------------------------------------

    /**
     * Translate `text` and append it to a chat as a new turn. Supply `result`
     * (a `TranslationResponse` already obtained for this exact text and language
     * pair) to persist it without a second LLM call.
     */
    async addTurn(
        chatId: string,
        text: string,
        options: { sourceLang: SourceLang; targetLang: TargetLang; result?: TranslationResponse },
    ): Promise<ChatDetail> {
        const body = core.createTurnBody(text, options.sourceLang, options.targetLang, options.result);
        return core.readChat(
            await this.#sendJson("POST", `/api/chats/${encodeURIComponent(chatId)}/turns`, { json: body }),
        );
    }

    /** Record which translation option (0-based) the user chose for a turn. */
    async selectOption(chatId: string, turnId: string, options: { option: number }): Promise<ChatDetail> {
        const body = core.selectOptionBody(options.option);
        return core.readChat(await this.#turnPatch(chatId, turnId, body));
    }

    /** Re-run a turn's translation, optionally with edited `text`, as a new branch. */
    async retranslateTurn(chatId: string, turnId: string, options: { text?: string } = {}): Promise<ChatDetail> {
        const body = core.retranslateBody(options.text);
        return core.readChat(await this.#turnPatch(chatId, turnId, body));
    }

    /** Switch the chat's active branch to the sibling version at this turn. */
    async switchBranch(chatId: string, turnId: string): Promise<ChatDetail> {
        return core.readChat(await this.#turnPatch(chatId, turnId, core.SWITCH_BRANCH_BODY));
    }

    #turnPatch(chatId: string, turnId: string, body: unknown): Promise<unknown> {
        const path = `/api/chats/${encodeURIComponent(chatId)}/turns/${encodeURIComponent(turnId)}`;
        return this.#sendJson("PATCH", path, { json: body });
    }

    // --- speech ----------------------------------------------------------

    /** Transcribe an audio clip (≤ 15 MB) to text via the speech provider. */
    async transcribe(
        audio: AudioInput,
        options: { filename?: string; contentType?: string; language?: SourceLang } = {},
    ): Promise<string> {
        const { filename = "audio.webm", contentType, language } = options;
        const blob =
            audio instanceof Blob
                ? audio
                : new Blob([audio as BlobPart], contentType ? { type: contentType } : undefined);
        const form = new FormData();
        form.append("file", blob, filename);
        if (language) {
            form.append("language", language);
        }
        return core.readText(await this.#sendJson("POST", "/api/speech/transcribe", { form }));
    }

    /** Synthesize `text` to MP3 audio bytes via the speech provider. */
    async synthesize(text: string, options: { lang: TargetLang; voice?: string }): Promise<ArrayBuffer> {
        const body = core.synthesizeBody(text, options.lang, options.voice);
        const response = await this.#send("POST", "/api/speech/synthesize", { json: body });
        return response.arrayBuffer();
    }

    // --- API keys --------------------------------------------------------

    /** List the caller's API keys (metadata only, never the secrets). */
    async listKeys(): Promise<ApiKey[]> {
        return core.readKeys(await this.#sendJson("GET", "/api/keys"));
    }

    /** Mint an API key. The plaintext token is returned only here, once. */
    async createKey(name: string, options: { expiresAt?: string | Date } = {}): Promise<CreatedApiKey> {
        const body = core.createKeyBody(name, options.expiresAt);
        return core.readCreatedKey(await this.#sendJson("POST", "/api/keys", { json: body }));
    }

    /** Revoke one of the caller's API keys. */
    async revokeKey(keyId: string): Promise<void> {
        await this.#send("DELETE", `/api/keys/${encodeURIComponent(keyId)}`);
    }
}
