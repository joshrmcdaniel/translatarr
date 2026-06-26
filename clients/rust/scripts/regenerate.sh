#!/usr/bin/env bash
#
# Regenerate the Rust client's serde models from the server's OpenAPI spec.
#
# Step 1 dumps the spec (built from the Zod schemas in app/lib) to
# clients/rust/openapi.json; step 2 lifts its `components.schemas` into a JSON
# Schema document (cargo-typify speaks JSON Schema, not OpenAPI); step 3 renders
# that to src/generated.rs. Only src/generated.rs is committed, so the crate
# builds without a running server; openapi.json and schema.json are regenerated,
# gitignored artifacts.
#
# Requires: bun (to run the dump + transform), cargo-typify
# (`cargo binstall cargo-typify` or `cargo install cargo-typify`), and rustfmt.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../../.." && pwd)"
client_dir="$repo_root/clients/rust"
spec="$client_dir/openapi.json"
schema="$client_dir/schema.json"
out="$client_dir/src/generated.rs"

echo "==> Dumping OpenAPI spec to $spec"
bun "$repo_root/scripts/dump-openapi.ts" "$spec"

echo "==> Transforming OpenAPI schemas to a JSON Schema document"
bun "$script_dir/openapi-to-schema.mjs" "$spec" "$schema"

echo "==> Generating serde models with cargo-typify"
cargo typify --no-builder --additional-derive PartialEq "$schema" --output "$out"

echo "==> Prepending generated-file banner"
header="$(cat <<'EOF'
// AUTO-GENERATED FILE — DO NOT EDIT.
//
// serde models for the Translatarr API, rendered from
// clients/rust/openapi.json (dumped from the server's Zod schemas in app/lib).
// Regenerate with: clients/rust/scripts/regenerate.sh

EOF
)"
printf '%s\n%s\n' "$header" "$(cat "$out")" > "$out"

echo "==> Formatting with rustfmt"
rustfmt --edition 2021 "$out"

echo "==> Wrote $out"
