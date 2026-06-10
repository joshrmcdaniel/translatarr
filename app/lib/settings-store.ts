/**
 * Persistence and resolution for LLM settings.
 *
 * Instance overrides live in the `app_settings` key-value table (admin-managed);
 * per-user preferences live in `user_settings`. Resolution order for each value
 * is: user pref -> instance override -> env var -> built-in provider default.
 */

import { getDb } from "./db";
import type { User } from "./user-store";
import {
  llmProviders,
  type LLMProvider,
  type ResolvedLLMSettings,
  type SettingsOverrides,
  type SettingsView,
  type UserLLMPrefs,
} from "./settings-types";

type SettingRow = {
  key: string;
  value: string;
};

const defaultProvider: LLMProvider = "openai-compatible";

const providerDefaults: Record<LLMProvider, { model: string; baseUrl: string }> = {
  "openai-compatible": { model: "gpt-5.4-mini", baseUrl: "https://api.openai.com/v1" },
  anthropic: { model: "claude-haiku-4-5", baseUrl: "https://api.anthropic.com" },
  custom: { model: "gpt-5.4-mini", baseUrl: "https://api.openai.com/v1" },
};

function asProvider(value: string | undefined): LLMProvider | null {
  return llmProviders.includes(value as LLMProvider) ? (value as LLMProvider) : null;
}

function applyKeyValuePatch(patch: Record<string, string | null | undefined>, table: "app_settings" | "user_settings", userId?: string) {
  const database = getDb();
  const upsert =
    table === "app_settings"
      ? database.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      : database.prepare(
          "INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value",
        );
  const remove =
    table === "app_settings"
      ? database.prepare("DELETE FROM app_settings WHERE key = ?")
      : database.prepare("DELETE FROM user_settings WHERE user_id = ? AND key = ?");

  database.transaction(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) {
        continue;
      }

      if (value === null || value === "") {
        if (table === "app_settings") {
          remove.run(key);
        } else {
          remove.run(userId, key);
        }
      } else if (table === "app_settings") {
        upsert.run(key, value);
      } else {
        upsert.run(userId, key, value);
      }
    }
  })();
}

export function getSettingsOverrides(): SettingsOverrides {
  const rows = getDb().prepare("SELECT key, value FROM app_settings").all() as SettingRow[];
  const byKey = new Map(rows.map((row) => [row.key, row.value]));

  return {
    provider: asProvider(byKey.get("provider")),
    apiKey: byKey.get("apiKey") ?? null,
    model: byKey.get("model") ?? null,
    baseUrl: byKey.get("baseUrl") ?? null,
    systemPrompt: byKey.get("systemPrompt") ?? null,
  };
}

export function updateSettingsOverrides(patch: Partial<SettingsOverrides>): SettingsOverrides {
  applyKeyValuePatch(patch, "app_settings");
  return getSettingsOverrides();
}

export function getUserPrefs(userId: string): UserLLMPrefs {
  const rows = getDb().prepare("SELECT key, value FROM user_settings WHERE user_id = ?").all(userId) as SettingRow[];
  const byKey = new Map(rows.map((row) => [row.key, row.value]));

  return {
    model: byKey.get("model") ?? null,
    systemPrompt: byKey.get("systemPrompt") ?? null,
  };
}

export function updateUserPrefs(userId: string, patch: Partial<UserLLMPrefs>): UserLLMPrefs {
  applyKeyValuePatch(patch, "user_settings", userId);
  return getUserPrefs(userId);
}

export function resolveLLMSettings(userId?: string): ResolvedLLMSettings {
  const instance = getSettingsOverrides();
  const userPrefs = userId ? getUserPrefs(userId) : { model: null, systemPrompt: null };
  const provider =
    instance.provider ?? ((process.env.LLM_PROVIDER as LLMProvider | undefined) ?? defaultProvider);
  const defaults = providerDefaults[provider] ?? providerDefaults[defaultProvider];

  return {
    provider,
    apiKey: instance.apiKey ?? process.env.LLM_API_KEY ?? null,
    model: userPrefs.model ?? instance.model ?? process.env.LLM_MODEL ?? defaults.model,
    baseUrl: instance.baseUrl ?? process.env.LLM_BASE_URL ?? defaults.baseUrl,
    systemPrompt: userPrefs.systemPrompt ?? instance.systemPrompt,
  };
}

export function getSettingsView(user: User): SettingsView {
  const instance = getSettingsOverrides();
  const effective = resolveLLMSettings(user.id);

  return {
    user: getUserPrefs(user.id),
    effective: {
      provider: effective.provider,
      model: effective.model,
      baseUrl: effective.baseUrl,
      hasApiKey: effective.apiKey !== null,
    },
    instance:
      user.role === "admin"
        ? {
            provider: instance.provider,
            model: instance.model,
            baseUrl: instance.baseUrl,
            systemPrompt: instance.systemPrompt,
            hasStoredApiKey: instance.apiKey !== null,
          }
        : null,
  };
}
