/**
 * Types for LLM settings.
 *
 * Settings have two scopes:
 * - Instance settings (admin-managed): provider, API key, base URL, default
 *   model, and default system prompt. Stored in `app_settings`.
 * - Per-user preferences: model and system prompt overrides. Stored in
 *   `user_settings`.
 *
 * Resolution per value: user pref -> instance override -> env var -> built-in
 * provider default.
 */

export type LLMProvider = "openai-compatible" | "anthropic" | "custom";

export const llmProviders: readonly LLMProvider[] = ["openai-compatible", "anthropic", "custom"];

/** Instance-wide overrides persisted in `app_settings`. `null` = use env/default. */
export type SettingsOverrides = {
  provider: LLMProvider | null;
  apiKey: string | null;
  model: string | null;
  baseUrl: string | null;
  systemPrompt: string | null;
};

/** Per-user preference overrides. `null` = use the instance default. */
export type UserLLMPrefs = {
  model: string | null;
  systemPrompt: string | null;
};

/** Fully resolved configuration consumed by the LLM client and translation service. */
export type ResolvedLLMSettings = {
  provider: LLMProvider;
  apiKey: string | null;
  model: string;
  baseUrl: string;
  systemPrompt: string | null;
};

/** What the settings API exposes to the UI. The API key itself is never returned. */
export type SettingsView = {
  user: UserLLMPrefs;
  effective: {
    provider: LLMProvider;
    model: string;
    baseUrl: string;
    hasApiKey: boolean;
  };
  /** Present only for admins. */
  instance: {
    provider: LLMProvider | null;
    model: string | null;
    baseUrl: string | null;
    systemPrompt: string | null;
    hasStoredApiKey: boolean;
  } | null;
};

export type SettingsPayload = {
  settings: SettingsView;
  defaultSystemPrompt: string;
};
