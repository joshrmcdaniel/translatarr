/**
 * Copies the Swagger UI static assets out of the `swagger-ui-dist` dependency
 * into `.swagger-ui/` so the authed `/api/docs/[asset]` route can serve them
 * locally (no CDN, not under `public/` where they'd be unauthenticated). Runs
 * from the `dev` and `build` scripts; the output is gitignored and regenerated
 * from the pinned dependency, so it never lives in the repo.
 */

import { cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = dirname(require.resolve("swagger-ui-dist/package.json"));
const outDir = join(projectRoot, ".swagger-ui");

const assets = ["swagger-ui.css", "swagger-ui-bundle.js", "swagger-ui-standalone-preset.js"];

mkdirSync(outDir, { recursive: true });

for (const asset of assets) {
  cpSync(join(distDir, asset), join(outDir, asset));
}

console.log(`Copied ${assets.length} Swagger UI assets to .swagger-ui/`);
