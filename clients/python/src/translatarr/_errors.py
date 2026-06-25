"""Exception hierarchy mapping Translatarr's HTTP error convention to Python.

The API answers every failure with a JSON `{error, code?}` body and a status
code from a small fixed set (see the project's API docs). `raise_for_status`
turns those into typed exceptions so callers can branch on the failure mode
without inspecting status codes themselves.
"""

from __future__ import annotations

import httpx


class TranslatarrError(Exception):
    """Base class for every error raised by this client."""


class APIError(TranslatarrError):
    """An error response returned by the server.

    Carries the HTTP `status_code`, the server's optional machine-readable
    `code` (present mainly on provider failures), and the raw `response`.
    """

    def __init__(
        self,
        message: str,
        *,
        status_code: int,
        code: str | None = None,
        response: httpx.Response | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code
        self.response = response


class InvalidRequestError(APIError):
    """400 — the request was malformed or failed input validation."""


class AuthenticationError(APIError):
    """401 — missing or invalid credentials."""


class ForbiddenError(APIError):
    """403 — authenticated but not allowed to perform this action."""


class NotFoundError(APIError):
    """404 — the chat, turn, or key does not exist (or isn't the caller's)."""


class ConflictError(APIError):
    """409 — the request conflicts with existing state (e.g. duplicate name)."""


class MalformedResponseError(APIError):
    """422 — the LLM returned output that did not match the expected schema."""


class ProviderError(APIError):
    """502 — the upstream LLM or speech provider failed."""


_STATUS_MAP: dict[int, type[APIError]] = {
    400: InvalidRequestError,
    401: AuthenticationError,
    403: ForbiddenError,
    404: NotFoundError,
    409: ConflictError,
    422: MalformedResponseError,
    502: ProviderError,
}


def raise_for_status(response: httpx.Response) -> None:
    """Raise the mapped `APIError` subclass when `response` is an HTTP error."""
    if response.status_code < 400:
        return

    payload: dict[str, object] = {}

    try:
        decoded = response.json()
        if isinstance(decoded, dict):
            payload = decoded
    except ValueError:
        pass

    raw_message = payload.get("error")
    message = raw_message if isinstance(raw_message, str) else (response.text or f"HTTP {response.status_code}")
    raw_code = payload.get("code")
    code = raw_code if isinstance(raw_code, str) else None

    error_class = _STATUS_MAP.get(response.status_code, APIError)
    raise error_class(message, status_code=response.status_code, code=code, response=response)
