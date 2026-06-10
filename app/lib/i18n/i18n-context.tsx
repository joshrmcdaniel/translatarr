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

/**
 * Maps a speech error to a localized message by its code. Provider errors
 * keep the server-supplied message (more specific) when one exists.
 */
export function speechErrorMessage(t: Translate, error: SpeechError): string {
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
