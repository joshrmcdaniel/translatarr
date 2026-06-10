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

import type { Locale } from "./i18n/messages";

export type LLMProvider = "openai-compatible" | "anthropic" | "custom";

export const llmProviders: readonly LLMProvider[] = ["openai-compatible", "anthropic", "custom"];

/** Where speech-to-text and text-to-speech run: in the browser or via a provider API. */
export type SpeechEngine = "browser" | "provider";

export const speechEngines: readonly SpeechEngine[] = ["browser", "provider"];

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

/** Instance-wide speech overrides persisted in `app_settings` under `speech.*` keys. */
export type SpeechSettingsOverrides = {
  engine: SpeechEngine | null;
  apiKey: string | null;
  baseUrl: string | null;
  sttModel: string | null;
  ttsModel: string | null;
  ttsVoice: string | null;
};

/** Per-user speech preference. `null` = use the instance default. */
export type UserSpeechPrefs = {
  engine: SpeechEngine | null;
};

/** Fully resolved speech configuration consumed by the speech API routes and client. */
export type ResolvedSpeechSettings = {
  engine: SpeechEngine;
  apiKey: string | null;
  baseUrl: string;
  sttModel: string;
  ttsModel: string;
  ttsVoice: string;
};

/** Redacted speech configuration the client uses to pick engines. */
export type SpeechEffectiveView = {
  engine: SpeechEngine;
  sttModel: string;
  ttsModel: string;
  ttsVoice: string;
  providerConfigured: boolean;
};

/** What the settings API exposes to the UI. API keys are never returned. */
export type SettingsView = {
  /** The user's UI-language preference; `null` = follow the browser language. */
  locale: Locale | null;
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
  speech: {
    user: UserSpeechPrefs;
    effective: SpeechEffectiveView;
    /** Present only for admins. */
    instance: {
      engine: SpeechEngine | null;
      baseUrl: string | null;
      sttModel: string | null;
      ttsModel: string | null;
      ttsVoice: string | null;
      hasStoredApiKey: boolean;
    } | null;
  };
};

export type SettingsPayload = {
  settings: SettingsView;
  defaultSystemPrompt: string;
};
