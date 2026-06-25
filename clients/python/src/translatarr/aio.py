"""Asynchronous Translatarr API client.

Mirrors `TranslatarrClient` method-for-method; the request building, parsing, and
error mapping are shared via `_core`, so only the transport differs.
"""

from __future__ import annotations

from datetime import datetime
from types import TracebackType
from typing import BinaryIO

import httpx

from . import _core as core
from ._errors import raise_for_status
from ._models import ApiKey, ChatDetail, ChatSummary, CreatedApiKey, TranslationResponse
from .languages import SourceLang, TargetLang

JsonObject = core.JsonObject
FileTuple = tuple[str, bytes | BinaryIO, str | None]


class AsyncTranslatarrClient:
    """An asyncio client for a Translatarr instance.

    Authenticate with a personal API key (`Authorization: Bearer <token>`, minted
    under Settings → API keys) or the `translatarr_session` cookie value. At least
    one of `token` or `session_cookie` is required.

    Usable as an async context manager so the connection pool is closed::

        async with AsyncTranslatarrClient("https://translatarr.example", token="tra_…") as tra:
            result = await tra.translate("Good morning", source_lang="en", target_lang="ja")
    """

    def __init__(
        self,
        base_url: str,
        *,
        token: str | None = None,
        session_cookie: str | None = None,
        timeout: float = 30.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        if not token and not session_cookie:
            raise ValueError("Provide either token or session_cookie to authenticate.")

        headers = {"Accept": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        cookies = {"translatarr_session": session_cookie} if session_cookie else None

        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            headers=headers,
            cookies=cookies,
            timeout=timeout,
            transport=transport,
        )

    async def aclose(self) -> None:
        """Close the underlying HTTP connection pool."""
        await self._client.aclose()

    async def __aenter__(self) -> AsyncTranslatarrClient:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        await self.aclose()

    async def _send(
        self,
        method: str,
        path: str,
        *,
        json: object | None = None,
        data: dict[str, str] | None = None,
        files: dict[str, FileTuple] | None = None,
    ) -> httpx.Response:
        response = await self._client.request(method, path, json=json, data=data, files=files)
        raise_for_status(response)
        return response

    # --- translation -----------------------------------------------------

    async def translate(
        self,
        text: str,
        *,
        source_lang: SourceLang,
        target_lang: TargetLang,
        chat_id: str | None = None,
    ) -> TranslationResponse:
        """Translate `text` without persisting it.

        Pass `chat_id` to borrow that chat's recent turns as disambiguation
        context; the result is still not stored.
        """
        body = core.translate_body(text, source_lang, target_lang, chat_id)
        return core.read_translation((await self._send("POST", "/api/translate", json=body)).json())

    # --- chats -----------------------------------------------------------

    async def list_chats(self) -> list[ChatSummary]:
        """List the caller's chats, newest first."""
        return core.read_chats((await self._send("GET", "/api/chats")).json())

    async def create_chat(
        self,
        *,
        source_lang: SourceLang,
        target_lang: TargetLang,
        title: str | None = None,
    ) -> ChatDetail:
        """Create an empty chat for a language pair."""
        body = core.create_chat_body(source_lang, target_lang, title)
        return core.read_chat((await self._send("POST", "/api/chats", json=body)).json())

    async def get_chat(self, chat_id: str) -> ChatDetail:
        """Fetch a chat together with its ordered turns."""
        return core.read_chat((await self._send("GET", f"/api/chats/{chat_id}")).json())

    async def rename_chat(self, chat_id: str, *, title: str) -> ChatDetail:
        """Rename a chat."""
        body = core.rename_chat_body(title)
        return core.read_chat((await self._send("PATCH", f"/api/chats/{chat_id}", json=body)).json())

    async def clear_chat(self, chat_id: str) -> ChatDetail:
        """Delete every turn in a chat, keeping the chat itself."""
        response = await self._send("PATCH", f"/api/chats/{chat_id}", json=core.CLEAR_CHAT_BODY)
        return core.read_chat(response.json())

    async def delete_chat(self, chat_id: str) -> None:
        """Delete a chat and all of its turns."""
        await self._send("DELETE", f"/api/chats/{chat_id}")

    # --- turns -----------------------------------------------------------

    async def add_turn(
        self,
        chat_id: str,
        text: str,
        *,
        source_lang: SourceLang,
        target_lang: TargetLang,
        result: TranslationResponse | JsonObject | None = None,
    ) -> ChatDetail:
        """Translate `text` and append it to a chat as a new turn.

        Supply `result` (a `TranslationResponse` already obtained for this exact
        text and language pair) to persist it without a second LLM call.
        """
        body = core.create_turn_body(text, source_lang, target_lang, result)
        return core.read_chat((await self._send("POST", f"/api/chats/{chat_id}/turns", json=body)).json())

    async def select_option(self, chat_id: str, turn_id: str, *, option: int) -> ChatDetail:
        """Record which translation option (0-based) the user chose for a turn."""
        body = core.select_option_body(option)
        response = await self._send("PATCH", f"/api/chats/{chat_id}/turns/{turn_id}", json=body)
        return core.read_chat(response.json())

    async def retranslate_turn(self, chat_id: str, turn_id: str, *, text: str | None = None) -> ChatDetail:
        """Re-run a turn's translation, optionally with edited `text`, as a new branch."""
        body = core.retranslate_body(text)
        response = await self._send("PATCH", f"/api/chats/{chat_id}/turns/{turn_id}", json=body)
        return core.read_chat(response.json())

    async def switch_branch(self, chat_id: str, turn_id: str) -> ChatDetail:
        """Switch the chat's active branch to the sibling version at this turn."""
        response = await self._send("PATCH", f"/api/chats/{chat_id}/turns/{turn_id}", json=core.SWITCH_BRANCH_BODY)
        return core.read_chat(response.json())

    # --- speech ----------------------------------------------------------

    async def transcribe(
        self,
        audio: bytes | BinaryIO,
        *,
        filename: str = "audio.webm",
        content_type: str | None = None,
        language: SourceLang | None = None,
    ) -> str:
        """Transcribe an audio clip (≤ 15 MB) to text via the speech provider."""
        files: dict[str, FileTuple] = {"file": (filename, audio, content_type)}
        data = {"language": language} if language else None
        response = await self._send("POST", "/api/speech/transcribe", files=files, data=data)
        return core.read_text(response.json())

    async def synthesize(self, text: str, *, lang: TargetLang, voice: str | None = None) -> bytes:
        """Synthesize `text` to MP3 audio bytes via the speech provider."""
        body = core.synthesize_body(text, lang, voice)
        return (await self._send("POST", "/api/speech/synthesize", json=body)).content

    # --- API keys --------------------------------------------------------

    async def list_keys(self) -> list[ApiKey]:
        """List the caller's API keys (metadata only, never the secrets)."""
        return core.read_keys((await self._send("GET", "/api/keys")).json())

    async def create_key(self, name: str, *, expires_at: str | datetime | None = None) -> CreatedApiKey:
        """Mint an API key. The plaintext token is returned only here, once."""
        body = core.create_key_body(name, expires_at)
        return core.read_created_key((await self._send("POST", "/api/keys", json=body)).json())

    async def revoke_key(self, key_id: str) -> None:
        """Revoke one of the caller's API keys."""
        await self._send("DELETE", f"/api/keys/{key_id}")
