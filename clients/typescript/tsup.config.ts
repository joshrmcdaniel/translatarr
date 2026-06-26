import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "tsup";

const pkg = JSON.parse(
    readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8"),
) as { version: string };

export default defineConfig({
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    sourcemap: true,
    treeshake: true,
    outExtension: ({ format }) => ({ js: format === "cjs" ? ".cjs" : ".js" }),
    // Inline the version from package.json at build time (single source of truth).
    define: { __PKG_VERSION__: JSON.stringify(pkg.version) },
});
