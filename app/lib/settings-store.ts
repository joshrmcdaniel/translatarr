/**
 * Persistence and resolution for LLM settings.
 *
 * Instance overrides live in the `app_settings` key-value table (admin-managed);
 * per-user preferences live in `user_settings`. Resolution order for each value
 * is: user pref -> instance override -> env var -> built-in provider default.
 */

import { getDb } from "./db";
import { resolveLocale, type Locale } from "./i18n/messages";
import type { User } from "./user-store";
import { APP_VERSION } from "./version";
import {
  llmProviders,
  speechEngines,
  type LLMProvider,
  type ResolvedLLMSettings,
  type ResolvedSpeechSettings,
  type SettingsOverrides,
  type SettingsView,
  type SpeechEngine,
  type SpeechSettingsOverrides,
  type UserLLMPrefs,
  type UserSpeechPrefs,
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

const speechDefaults = {
  baseUrl: "https://api.openai.com/v1",
  sttModel: "whisper-1",
  ttsModel: "gpt-4o-mini-tts",
  ttsVoice: "alloy",
};

function asProvider(value: string | undefined): LLMProvider | null {
  return llmProviders.includes(value as LLMProvider) ? (value as LLMProvider) : null;
}

function asSpeechEngine(value: string | undefined): SpeechEngine | null {
  return speechEngines.includes(value as SpeechEngine) ? (value as SpeechEngine) : null;
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

/** Read a single raw `app_settings` value, or `null` when unset. */
export function getAppSetting(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

/** Write (or, for `null`/empty, clear) a single raw `app_settings` value. */
export function setAppSetting(key: string, value: string | null): void {
  applyKeyValuePatch({ [key]: value }, "app_settings");
}

/** Resolved on/off for the periodic update check: instance override -> env -> default (on). */
export function resolveUpdateCheckEnabled(): boolean {
  const override = getAppSetting("update.checkEnabled");
  if (override !== null) {
    return override === "true";
  }
  return process.env.UPDATE_CHECK_ENABLED !== "false";
}

/** Set the instance-wide update-check override (`null` reverts to the env/default). */
export function setUpdateCheckEnabled(enabled: boolean | null): void {
  setAppSetting("update.checkEnabled", enabled === null ? null : String(enabled));
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

export function getSpeechOverrides(): SpeechSettingsOverrides {
  const rows = getDb().prepare("SELECT key, value FROM app_settings").all() as SettingRow[];
  const byKey = new Map(rows.map((row) => [row.key, row.value]));

  return {
    engine: asSpeechEngine(byKey.get("speech.engine")),
    apiKey: byKey.get("speech.apiKey") ?? null,
    baseUrl: byKey.get("speech.baseUrl") ?? null,
    sttModel: byKey.get("speech.sttModel") ?? null,
    ttsModel: byKey.get("speech.ttsModel") ?? null,
    ttsVoice: byKey.get("speech.ttsVoice") ?? null,
  };
}

export function updateSpeechOverrides(patch: Partial<SpeechSettingsOverrides>): SpeechSettingsOverrides {
  const prefixed = Object.fromEntries(Object.entries(patch).map(([key, value]) => [`speech.${key}`, value]));
  applyKeyValuePatch(prefixed, "app_settings");
  return getSpeechOverrides();
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

export function getUserSpeechPrefs(userId: string): UserSpeechPrefs {
  const rows = getDb().prepare("SELECT key, value FROM user_settings WHERE user_id = ?").all(userId) as SettingRow[];
  const byKey = new Map(rows.map((row) => [row.key, row.value]));

  return {
    engine: asSpeechEngine(byKey.get("speech.engine")),
  };
}

export function updateUserSpeechPrefs(userId: string, patch: Partial<UserSpeechPrefs>): UserSpeechPrefs {
  const prefixed = Object.fromEntries(Object.entries(patch).map(([key, value]) => [`speech.${key}`, value]));
  applyKeyValuePatch(prefixed, "user_settings", userId);
  return getUserSpeechPrefs(userId);
}

export function getUserLocale(userId: string): Locale | null {
  const rows = getDb().prepare("SELECT key, value FROM user_settings WHERE user_id = ?").all(userId) as SettingRow[];
  const byKey = new Map(rows.map((row) => [row.key, row.value]));

  return resolveLocale(byKey.get("locale"));
}

export function updateUserLocale(userId: string, locale: Locale | null): Locale | null {
  applyKeyValuePatch({ locale }, "user_settings", userId);
  return getUserLocale(userId);
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

export function resolveSpeechSettings(userId?: string): ResolvedSpeechSettings {
  const instance = getSpeechOverrides();
  const userPrefs = userId ? getUserSpeechPrefs(userId) : { engine: null };
  const llm = resolveLLMSettings(userId);
  const llmIsOpenAICompatible = llm.provider === "openai-compatible";

  return {
    engine: userPrefs.engine ?? instance.engine ?? asSpeechEngine(process.env.SPEECH_ENGINE) ?? "browser",
    apiKey: instance.apiKey ?? process.env.SPEECH_API_KEY ?? (llmIsOpenAICompatible ? llm.apiKey : null),
    baseUrl:
      instance.baseUrl ??
      process.env.SPEECH_BASE_URL ??
      (llmIsOpenAICompatible ? llm.baseUrl : speechDefaults.baseUrl),
    sttModel: instance.sttModel ?? process.env.SPEECH_STT_MODEL ?? speechDefaults.sttModel,
    ttsModel: instance.ttsModel ?? process.env.SPEECH_TTS_MODEL ?? speechDefaults.ttsModel,
    ttsVoice: instance.ttsVoice ?? process.env.SPEECH_TTS_VOICE ?? speechDefaults.ttsVoice,
  };
}

export function getSettingsView(user: User): SettingsView {
  const instance = getSettingsOverrides();
  const effective = resolveLLMSettings(user.id);
  const speechInstance = getSpeechOverrides();
  const speechEffective = resolveSpeechSettings(user.id);

  return {
    version: APP_VERSION,
    locale: getUserLocale(user.id),
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
            updateCheckEnabled: resolveUpdateCheckEnabled(),
          }
        : null,
    speech: {
      user: getUserSpeechPrefs(user.id),
      effective: {
        engine: speechEffective.engine,
        sttModel: speechEffective.sttModel,
        ttsModel: speechEffective.ttsModel,
        ttsVoice: speechEffective.ttsVoice,
        providerConfigured: speechEffective.apiKey !== null,
      },
      instance:
        user.role === "admin"
          ? {
              engine: speechInstance.engine,
              baseUrl: speechInstance.baseUrl,
              sttModel: speechInstance.sttModel,
              ttsModel: speechInstance.ttsModel,
              ttsVoice: speechInstance.ttsVoice,
              hasStoredApiKey: speechInstance.apiKey !== null,
            }
          : null,
    },
  };
}
