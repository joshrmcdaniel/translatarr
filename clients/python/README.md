# translatarr-client

A typed Python client for the [Translatarr](../../README.md) API — synchronous
and asynchronous, with pydantic response models generated from the server's
OpenAPI spec.

## Install

```bash
pip install translatarr-client
```

Published to [PyPI](https://pypi.org/project/translatarr-client/) for each `v*`
tag (the version matches the app's tag). The same wheel + sdist are also
attached to the corresponding GitHub Release, and you can install straight from
this repo:

```bash
# from a published GitHub Release (version matches the app's v* tag)
pip install https://github.com/joshrmcdaniel/translatarr/releases/download/v1.2.3/translatarr_client-1.2.3-py3-none-any.whl

# or straight from this repo
pip install -e clients/python
```

Requires Python 3.10+.

## Authentication

Mint a personal API key in the web UI under **Settings → API keys** (tokens are
prefixed `tra_` and shown only once). Pass it as `token`:

```python
from translatarr import TranslatarrClient

with TranslatarrClient("https://translatarr.example", token="tra_…") as tra:
    result = tra.translate("Good morning", source_lang="en", target_lang="ja")
    best = result.translations[0]
    print(best.text, best.romanization)
```

A browser session cookie works too, via `session_cookie="…"` instead of `token`.

## Async

`AsyncTranslatarrClient` mirrors the sync client method-for-method:

```python
import asyncio
from translatarr import AsyncTranslatarrClient

async def main() -> None:
    async with AsyncTranslatarrClient("https://translatarr.example", token="tra_…") as tra:
        result = await tra.translate("Bonjour", source_lang="auto", target_lang="en")
        print(result.detected_source_language, result.translations[0].text)

asyncio.run(main())
```

## What you can do

| Area      | Methods |
| --------- | ------- |
| Translate | `translate` |
| Chats     | `list_chats`, `create_chat`, `get_chat`, `rename_chat`, `clear_chat`, `delete_chat` |
| Turns     | `add_turn`, `select_option`, `retranslate_turn`, `switch_branch` |
| Speech    | `transcribe`, `synthesize` |
| API keys  | `list_keys`, `create_key`, `revoke_key` |

### Persisting a chat without paying for a second translation

`translate` does not store anything; `add_turn` translates *and* persists. To
avoid a duplicate LLM call, pass the `result` you already have:

```python
chat = tra.create_chat(source_lang="en", target_lang="ja")
preview = tra.translate("Let's ship it", source_lang="en", target_lang="ja", chat_id=chat.id)
chat = tra.add_turn(chat.id, "Let's ship it", source_lang="en", target_lang="ja", result=preview)
```

### Errors

Failures raise a subclass of `translatarr.APIError`, each carrying `status_code`,
the server's `code` (when present), and the raw `response`:

| Exception | Status |
| --------- | ------ |
| `InvalidRequestError`   | 400 |
| `AuthenticationError`   | 401 |
| `ForbiddenError`        | 403 |
| `NotFoundError`         | 404 |
| `ConflictError`         | 409 |
| `MalformedResponseError`| 422 |
| `ProviderError`         | 502 |

```python
from translatarr import NotFoundError

try:
    tra.get_chat("does-not-exist")
except NotFoundError:
    ...
```

## Development

The response models in `src/translatarr/_models.py` are **generated** from the
server's OpenAPI document — do not edit them by hand. To regenerate after the
API schema changes:

```bash
# one-time tooling install
python -m venv clients/python/.venv
clients/python/.venv/bin/pip install -e 'clients/python[codegen]'

# regenerate openapi.json + _models.py
clients/python/scripts/regenerate.sh
```

The script dumps the spec via `bun scripts/dump-openapi.ts` (the same document
served at `/api/docs/openapi.json`) and runs `datamodel-codegen` over it. Only
`_models.py` is committed, so the client builds and installs without a running
server; `openapi.json` is a regenerated, gitignored artifact.
