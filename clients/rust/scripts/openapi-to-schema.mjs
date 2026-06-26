// Lift OpenAPI `components.schemas` into a single JSON Schema document with a
// `definitions` table so cargo-typify (which speaks JSON Schema, not OpenAPI)
// can render Rust models. Three normalizations keep the generated Rust clean:
//
//   1. `#/components/schemas/X` refs are rewritten to `#/definitions/X`.
//   2. Validation constraints (minLength, minimum, …) are stripped — the server
//      validates every request, so the client needs plain `String`/`f64`/`Vec`
//      fields rather than typify's validating newtype wrappers.
//   3. The inline `translations`/`keyWords` item objects are hoisted into named
//      `Translation`/`KeyWord` definitions, so typify emits those names instead
//      of `TranslationResponseTranslationsItem`-style ones.

import { readFileSync, writeFileSync } from "node:fs";

const [, , inPath, outPath] = process.argv;
const spec = JSON.parse(readFileSync(inPath, "utf8"));

const CONSTRAINT_KEYS = new Set([
    "minLength", "maxLength", "pattern",
    "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
    "minItems", "maxItems", "uniqueItems",
    "minProperties", "maxProperties",
]);

function normalize(node) {
    if (Array.isArray(node)) return node.map(normalize);
    if (node && typeof node === "object") {
        const out = {};
        for (const [key, value] of Object.entries(node)) {
            if (CONSTRAINT_KEYS.has(key)) continue;
            if (key === "$ref" && typeof value === "string") {
                out[key] = value.replace("#/components/schemas/", "#/definitions/");
            } else {
                out[key] = normalize(value);
            }
        }
        return out;
    }
    return node;
}

const definitions = normalize(spec.components.schemas);

// Hoist KeyWord and Translation out of the inline TranslationResponse shape so
// typify emits those names instead of deeply-nested generated ones.
const response = definitions.TranslationResponse;
const translationItem = response.properties.translations.items;
definitions.KeyWord = translationItem.properties.keyWords.items;
translationItem.properties.keyWords.items = { $ref: "#/definitions/KeyWord" };
response.properties.keyWords.items = { $ref: "#/definitions/KeyWord" };
definitions.Translation = translationItem;
response.properties.translations.items = { $ref: "#/definitions/Translation" };

const schema = {
    $schema: "http://json-schema.org/draft-07/schema#",
    definitions,
};
writeFileSync(outPath, `${JSON.stringify(schema, null, 2)}\n`);
console.log(`Wrote ${outPath} (${Object.keys(definitions).length} definitions)`);
