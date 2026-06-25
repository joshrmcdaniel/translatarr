/** Error thrown by client fetch helpers, carrying the server's machine-readable error code (if any). */
export class ApiError extends Error {
  readonly code: string | null;

  constructor(message: string, code?: string | null) {
    super(message);
    this.name = "ApiError";
    this.code = code ?? null;
  }
}
