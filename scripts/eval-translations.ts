/** Live translation evaluation. Run through `bun run eval:translations --help`. */
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { createLLMClient } from "../app/lib/llm-client";
import { ProviderError } from "../app/lib/provider-error";
import { llmProviders, llmReasoningModes, type ResolvedLLMSettings } from "../app/lib/settings-types";
import { buildSystemPrompt, buildUserMessage, parseTranslation, type TranslationContextTurn } from "../app/lib/translation-service";
import type { TranslationResponse } from "../app/lib/translation-schema";
import fixtures from "../tests/translation/cases.json";

type Case = {
  id: string;
  text: string;
  sourceLang: string;
  targetLang: string;
  detectedSourceLanguage?: string;
  notes?: string;
  tone?: string;
  context?: TranslationContextTurn[];
  rubric: string[];
};
type Request = { testCase: Case; systemPrompt: string; userMessage: string };
type Result = { id: string; repeat: number; durationMs: number; issues: string[]; result?: TranslationResponse; error?: string; malformedOutput?: string };

const { values } = parseArgs({ options: {
  model: { type: "string" }, out: { type: "string" }, cases: { type: "string" },
  repeat: { type: "string", default: "1" }, concurrency: { type: "string", default: "2" },
  "prompts-from": { type: "string" }, "dry-run": { type: "boolean" }, help: { type: "boolean" },
} });

if (values.help) {
  console.log(`Usage: bun run eval:translations --model <provider-model-id> --out <report.json>
  --cases <substring>       Select matching case IDs (default: all)
  --repeat <1-10>           Samples per case (default: 1)
  --concurrency <1-4>       Maximum simultaneous requests (default: 2)
  --prompts-from <report>   Replay the exact prompts and cases saved in a prior report
  --dry-run                Save requests without calling the provider

Uses the production prompt builder, LLM client and response parser. Tests the built-in
prompt, not saved custom prompts. LLM_* environment variables override read-only
instance settings from SQLITE_PATH or data/translatarr.sqlite. --model is required;
no settings or chats are changed. Live runs incur provider charges.
Reports contain synthetic fixtures, full prompts and outputs, but no credentials.
Mechanical checks are not fluency scores: review every case against its rubric.`);
  process.exit(0);
}

if (!values.model || !values.out) throw new Error("--model and --out are required; see --help.");
if (existsSync(values.out)) throw new Error(`Refusing to overwrite ${values.out}; choose a new report path.`);
function boundedInteger(value: string, max: number, name: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) throw new Error(`${name} must be an integer from 1 to ${max}.`);
  return parsed;
}
const repeats = boundedInteger(values.repeat!, 10, "repeat");
const concurrency = boundedInteger(values.concurrency!, 4, "concurrency");

// Do not open the application's migrating/writable connection during evaluations.
const dbPath = process.env.SQLITE_PATH ?? "data/translatarr.sqlite";
let stored: Record<string, string> = {};
if (existsSync(dbPath)) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    stored = Object.fromEntries((db.prepare("SELECT key, value FROM app_settings").all() as Array<{ key: string; value: string }>).map(({ key, value }) => [key, value]));
  } finally {
    db.close();
  }
}
const provider = process.env.LLM_PROVIDER ?? stored.provider ?? "openai-compatible";
if (!llmProviders.includes(provider as ResolvedLLMSettings["provider"]) || provider === "custom") throw new Error("Use an implemented LLM provider.");
const reasoning = process.env.LLM_REASONING ?? stored.reasoning ?? null;
if (reasoning !== null && !llmReasoningModes.includes(reasoning as NonNullable<ResolvedLLMSettings["reasoning"]>)) throw new Error("Invalid LLM_REASONING.");
const settings: ResolvedLLMSettings = {
  provider: provider as ResolvedLLMSettings["provider"],
  apiKey: process.env.LLM_API_KEY ?? stored.apiKey ?? null,
  baseUrl: process.env.LLM_BASE_URL ?? stored.baseUrl ?? (provider === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com/v1"),
  model: values.model, systemPrompt: null,
  temperature: Number(process.env.LLM_TEMPERATURE ?? stored.temperature ?? 0.2),
  maxTokens: Number(process.env.LLM_MAX_TOKENS ?? stored.maxTokens ?? 8192),
  reasoning: reasoning as ResolvedLLMSettings["reasoning"],
  timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? stored.timeoutMs ?? 120000),
};

const requests: Request[] = (values["prompts-from"]
  ? (JSON.parse(readFileSync(values["prompts-from"], "utf8")) as { requests: Request[] }).requests
  : (fixtures as Case[]).map((testCase) => ({
      testCase,
      systemPrompt: buildSystemPrompt(testCase.sourceLang, testCase.targetLang, null, testCase.tone, testCase.notes),
      userMessage: buildUserMessage(testCase.text, testCase.context ?? []),
    })))
  .filter(({ testCase }) => !values.cases || testCase.id.includes(values.cases));
if (!requests.length) throw new Error("No matching cases.");

function checkResult(testCase: Case, result: TranslationResponse): string[] {
  const issues: string[] = [];
  const expectedLanguage = testCase.detectedSourceLanguage ?? testCase.sourceLang;
  if (result.detectedSourceLanguage !== expectedLanguage) issues.push(`Detected ${result.detectedSourceLanguage}; expected ${expectedLanguage}.`);
  // Script detection checks romanization presence only, not its linguistic accuracy.
  const nonLatin = /(?=\p{L})\P{Script=Latin}/u;
  for (const [index, option] of result.translations.entries()) {
    const checkRomanization = (text: string, romanization: string | null, label: string) => {
      if (nonLatin.test(text) ? !romanization?.trim() : romanization !== null) issues.push(`${index + 1}: ${label} romanization does not match its script.`);
    };
    checkRomanization(option.text, option.romanization, "translation");
    if (!option.keyWords.length) issues.push(`${index + 1}: Missing glossary.`);
    for (const word of option.keyWords) {
      if (!testCase.text.includes(word.source)) issues.push(`${index + 1}: Glossary source is not an exact source span: ${word.source}`);
      checkRomanization(word.target, word.romanization, `glossary ${word.source}`);
    }
    if (/<\/?(?:text_to_translate|conversation_context)\b/.test(option.text)) issues.push(`${index + 1}: Input wrapper leaked into translation.`);
  }
  return issues;
}

// Whitelist metadata; never serialize the settings object containing the API key.
const report = {
  createdAt: new Date().toISOString(), dryRun: Boolean(values["dry-run"]),
  model: settings.model, provider: settings.provider,
  temperature: settings.temperature, maxTokens: settings.maxTokens,
  reasoning: settings.reasoning, timeoutMs: settings.timeoutMs, repeats,
  requestHash: createHash("sha256").update(JSON.stringify(requests)).digest("hex"),
  requests, results: [] as Result[],
};
const outPath = values.out;
mkdirSync(dirname(outPath), { recursive: true });
function save() { writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`); }
save();
if (values["dry-run"]) {
  console.log(`Saved ${requests.length} requests to ${outPath}; no provider calls made.`);
  process.exit(0);
}

const client = createLLMClient(settings);
const jobs = requests.flatMap((request) => Array.from({ length: repeats }, (_, repeat) => ({ ...request, repeat: repeat + 1 })));
let next = 0;
async function worker() {
  while (next < jobs.length) {
    const { testCase, systemPrompt, userMessage, repeat } = jobs[next++];
    const startedAt = Date.now();
    const row: Result = { id: testCase.id, repeat, durationMs: 0, issues: [] };
    let raw: string | undefined;
    try {
      // Single attempt: malformed output must remain visible instead of being hidden by a retry.
      raw = await client.complete(systemPrompt, userMessage);
      row.result = parseTranslation(raw);
      row.issues = checkResult(testCase, row.result);
    } catch (error) {
      // Provider bodies can contain sensitive request details; retain only the category/status.
      row.error = error instanceof ProviderError ? `${error.kind} (${error.status ?? "no HTTP status"})`
        : error instanceof Error ? error.message : "Unknown error";
      if (raw !== undefined) row.malformedOutput = raw;
    }
    row.durationMs = Date.now() - startedAt;
    report.results.push(row);
    save();
    console.log(`[${report.results.length}/${jobs.length}] ${testCase.id} #${repeat}: ${row.error ?? (row.issues.length ? `${row.issues.length} mechanical issue(s)` : "mechanical checks passed")}`);
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
console.log(`Saved ${report.results.length} results to ${outPath}. Review translations against the case rubrics.`);
if (report.results.some((row) => row.error || row.issues.length)) process.exitCode = 1;
