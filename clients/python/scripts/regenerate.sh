#!/usr/bin/env bash
#
# Regenerate the Python client's pydantic models from the server's OpenAPI spec.
#
# Step 1 dumps the spec (built from the Zod schemas in app/lib) to
# clients/python/openapi.json; step 2 renders it to src/translatarr/_models.py.
# Both outputs are committed, so the client is usable without a running server.
#
# Requires: bun (to run the dump script) and datamodel-code-generator (installed
# in clients/python/.venv, or otherwise on PATH).

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../../.." && pwd)"
client_dir="$repo_root/clients/python"
spec="$client_dir/openapi.json"
out="$client_dir/src/translatarr/_models.py"

echo "==> Dumping OpenAPI spec to $spec"
bun "$repo_root/scripts/dump-openapi.ts" "$spec"

codegen="$client_dir/.venv/bin/datamodel-codegen"
if [ ! -x "$codegen" ]; then
  codegen="datamodel-codegen"
fi

echo "==> Generating pydantic models with $codegen"
"$codegen" \
  --input "$spec" \
  --input-file-type openapi \
  --output-model-type pydantic_v2.BaseModel \
  --output-datetime-class datetime \
  --enum-field-as-literal all \
  --collapse-root-models \
  --snake-case-field \
  --use-union-operator \
  --use-standard-collections \
  --use-annotated \
  --use-schema-description \
  --disable-timestamp \
  --custom-file-header-path "$script_dir/model_header.txt" \
  --target-python-version 3.10 \
  --output "$out"

echo "==> Wrote $out"
