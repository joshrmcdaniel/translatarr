/**
 * Exception hierarchy mapping Translatarr's HTTP error convention to JS errors.
 *
 * The API answers every failure with a JSON `{error, code?}` body and a status
 * code from a small fixed set (see the project's API docs). `raiseForStatus`
 * turns those into typed errors so callers can branch on the failure mode with
 * `instanceof` instead of inspecting status codes themselves.
 */

/** Base class for every error raised by this client. */
export class TranslatarrError extends Error {
    constructor(message: string) {
        super(message);
        this.name = new.target.name;
    }
}

/**
 * An error response returned by the server. Carries the HTTP `status`, the
 * server's optional machine-readable `code` (present mainly on provider
 * failures), and the raw `response`.
 */
export class APIError extends TranslatarrError {
    readonly status: number;
    readonly code: string | null;
    readonly response: Response;

    constructor(
        message: string,
        { status, code = null, response }: { status: number; code?: string | null; response: Response },
    ) {
        super(message);
        this.status = status;
        this.code = code;
        this.response = response;
    }
}

/** 400 — the request was malformed or failed input validation. */
export class InvalidRequestError extends APIError {}

/** 401 — missing or invalid credentials. */
export class AuthenticationError extends APIError {}

/** 403 — authenticated but not allowed to perform this action. */
export class ForbiddenError extends APIError {}

/** 404 — the chat, turn, or key does not exist (or isn't the caller's). */
export class NotFoundError extends APIError {}

/** 409 — the request conflicts with existing state (e.g. duplicate name). */
export class ConflictError extends APIError {}

/** 422 — the LLM returned output that did not match the expected schema. */
export class MalformedResponseError extends APIError {}

/** 502 — the upstream LLM or speech provider failed. */
export class ProviderError extends APIError {}

const STATUS_MAP: Record<number, new (message: string, init: { status: number; code?: string | null; response: Response }) => APIError> = {
    400: InvalidRequestError,
    401: AuthenticationError,
    403: ForbiddenError,
    404: NotFoundError,
    409: ConflictError,
    422: MalformedResponseError,
    502: ProviderError,
};

/** Throw the mapped `APIError` subclass when `response` is an HTTP error. */
export async function raiseForStatus(response: Response): Promise<void> {
    if (response.status < 400) {
        return;
    }

    let payload: Record<string, unknown> = {};
    const raw = await response.text();
    if (raw) {
        try {
            const decoded: unknown = JSON.parse(raw);
            if (decoded !== null && typeof decoded === "object") {
                payload = decoded as Record<string, unknown>;
            }
        } catch {
            // Non-JSON body; fall through to the raw text below.
        }
    }

    const rawMessage = payload.error;
    const message = typeof rawMessage === "string" ? rawMessage : raw || `HTTP ${response.status}`;
    const code = typeof payload.code === "string" ? payload.code : null;

    const ErrorClass = STATUS_MAP[response.status] ?? APIError;
    throw new ErrorClass(message, { status: response.status, code, response });
}
