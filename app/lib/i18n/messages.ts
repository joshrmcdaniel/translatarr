/**
 * Locale registry and message-catalog plumbing for the UI.
 *
 * Pure module (safe to import from server and client code). The UI locale
 * resolves as: user preference (stored under the `locale` key in
 * `user_settings`) -> browser language -> English.
 */

import { messagesEn, type MessageKey } from "./messages-en";
import { messagesJa } from "./messages-ja";
import { messagesKo } from "./messages-ko";
import { messagesYue } from "./messages-yue";
import { messagesZh } from "./messages-zh";

export const locales = ["en", "zh", "yue", "ja", "ko"] as const;

export type Locale = (typeof locales)[number];

export type { MessageKey };

export const catalogs: Record<Locale, Record<MessageKey, string>> = {
  en: messagesEn,
  zh: messagesZh,
  yue: messagesYue,
  ja: messagesJa,
  ko: messagesKo,
};

export function resolveLocale(value: string | null | undefined): Locale | null {
  return locales.includes(value as Locale) ? (value as Locale) : null;
}

export function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") {
    return "en";
  }

  const language = navigator.language?.toLowerCase() ?? "";

  if (language.startsWith("yue") || language.startsWith("zh-hk") || language.startsWith("zh-mo")) {
    return "yue";
  }

  if (language.startsWith("ja")) {
    return "ja";
  }

  if (language.startsWith("ko")) {
    return "ko";
  }

  if (language.startsWith("zh")) {
    return "zh";
  }

  return "en";
}

export function formatMessage(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}
