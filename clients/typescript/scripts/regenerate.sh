#!/usr/bin/env bash
#
# Regenerate the TypeScript client's OpenAPI types from the server's spec.
#
# Step 1 dumps the spec (built from the Zod schemas in app/lib) to
# clients/typescript/openapi.json; step 2 renders it to src/_schema.ts. Only
# src/_schema.ts is committed, so the client builds without a running server;
# openapi.json is a regenerated, gitignored artifact.
#
# Requires: bun (to run the dump script) and openapi-typescript (a devDependency
# in clients/typescript; run `bun install` / `npm install` there first, or it is
# fetched on demand via npx).

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../../.." && pwd)"
client_dir="$repo_root/clients/typescript"
spec="$client_dir/openapi.json"
out="$client_dir/src/_schema.ts"

echo "==> Dumping OpenAPI spec to $spec"
bun "$repo_root/scripts/dump-openapi.ts" "$spec"

codegen="$client_dir/node_modules/.bin/openapi-typescript"
if [ ! -x "$codegen" ]; then
  codegen="npx --yes openapi-typescript@^7"
fi

echo "==> Generating OpenAPI types with openapi-typescript"
$codegen "$spec" --output "$out"

echo "==> Prepending generated-file banner"
header="$(cat <<'EOF'
// AUTO-GENERATED FILE — DO NOT EDIT.
//
// OpenAPI types for the Translatarr API, rendered from
// clients/typescript/openapi.json (dumped from the server's Zod schemas in app/lib).
// Regenerate with: clients/typescript/scripts/regenerate.sh

EOF
)"
printf '%s\n%s\n' "$header" "$(cat "$out")" > "$out"

echo "==> Wrote $out"
