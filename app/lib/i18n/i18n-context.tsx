"use client";

/**
 * React context carrying the active UI locale.
 *
 * The provider starts on English (deterministic for hydration), switches to
 * the browser language after mount, and is then driven by the user's stored
 * preference once `Translator` loads `/api/settings`. `useI18n` exposes the
 * translate function `t`, the locale setter, and a locale-aware language-name
 * helper.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError } from "../api-error";
import type { SpeechError } from "../speech/speech-client";
import { localizedLanguageName } from "./language-names";
import { catalogs, detectBrowserLocale, formatMessage, type Locale, type MessageKey } from "./messages";

export type TranslateParams = Record<string, string | number>;

export type Translate = (key: MessageKey, params?: TranslateParams) => string;

type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
  languageLabel: (code: string) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    setLocaleState(detectBrowserLocale());
  }, []);

  const setLocale = useCallback((next: Locale) => setLocaleState(next), []);

  const value = useMemo<I18nValue>(() => {
    const t: Translate = (key, params) => {
      const template = catalogs[locale][key] ?? catalogs.en[key];
      return params ? formatMessage(template, params) : template;
    };

    return {
      locale,
      setLocale,
      t,
      languageLabel: (code) => localizedLanguageName(locale, code),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);

  if (!value) {
    throw new Error("useI18n must be used within an I18nProvider.");
  }

  return value;
}

/** Maps a server provider error code to its localized message key, or null when it isn't one. */
function providerErrorKey(code: string): MessageKey | null {
  switch (code) {
    case "auth":
      return "error.providerAuth";
    case "rate_limit":
      return "error.providerRateLimit";
    case "quota":
      return "error.providerQuota";
    case "model_not_found":
      return "error.providerModel";
    case "context_length":
      return "error.providerContextLength";
    case "network":
      return "error.providerNetwork";
    case "malformed":
      return "error.malformed";
    case "bad_request":
    case "server":
    case "unknown":
      return "error.providerUnavailable";
    default:
      return null;
  }
}

/** Localizes a thrown ApiError by its server error code, falling back to its message or a key. */
export function apiErrorMessage(t: Translate, error: unknown, fallbackKey: MessageKey): string {
  if (error instanceof ApiError && error.code) {
    const key = providerErrorKey(error.code);

    if (key) {
      return t(key);
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return t(fallbackKey);
}

/**
 * Maps a speech error to a localized message by its code. A provider code from
 * the server localizes to the shared provider messages; otherwise the engine
 * error code maps to a speech-specific message.
 */
export function speechErrorMessage(t: Translate, error: SpeechError): string {
  if (error.providerCode) {
    const key = providerErrorKey(error.providerCode);

    if (key) {
      return t(key);
    }
  }

  switch (error.code) {
    case "permission-denied":
      return t("speech.permissionDenied");
    case "no-speech":
      return t("speech.noSpeech");
    case "network":
      return t("speech.network");
    case "unsupported":
    case "not-configured":
      return t("speech.unavailableReason");
    default:
      return error.message || t("speech.transcriptionFailed");
  }
}
