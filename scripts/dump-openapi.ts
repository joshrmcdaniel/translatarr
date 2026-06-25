/**
 * Dumps the OpenAPI 3.1 spec — the same document served at
 * `/api/docs/openapi.json` — to a file for offline tooling, chiefly the Python
 * client's pydantic model generation.
 *
 * Run `bun run openapi:dump` to write the committed snapshot at
 * `clients/python/openapi.json`, or pass an explicit path:
 * `bun scripts/dump-openapi.ts path/to/openapi.json`.
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildOpenApiDocument } from "../app/lib/openapi";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultOut = join(scriptDir, "..", "clients", "python", "openapi.json");
const outPath = process.argv[2] ?? defaultOut;

writeFileSync(outPath, `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`);
console.log(`Wrote OpenAPI spec to ${outPath}`);
