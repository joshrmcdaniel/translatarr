/**
 * Locale registry and message-catalog plumbing for the UI.
 *
 * Pure module (safe to import from server and client code). The UI locale
 * resolves as: user preference (stored under the `locale` key in
 * `user_settings`) -> browser language -> English.
 */

import { messagesAr } from "./messages-ar";
import { messagesDe } from "./messages-de";
import { messagesEl } from "./messages-el";
import { messagesEn, type MessageKey } from "./messages-en";
import { messagesEs } from "./messages-es";
import { messagesFr } from "./messages-fr";
import { messagesIt } from "./messages-it";
import { messagesJa } from "./messages-ja";
import { messagesKo } from "./messages-ko";
import { messagesRu } from "./messages-ru";
import { messagesVi } from "./messages-vi";
import { messagesYue } from "./messages-yue";
import { messagesZh } from "./messages-zh";

export const locales = ["en", "ar", "de", "el", "es", "fr", "it", "ja", "ko", "ru", "vi", "yue", "zh"] as const;

export type Locale = (typeof locales)[number];

export type { MessageKey };

export const catalogs: Record<Locale, Record<MessageKey, string>> = {
  en: messagesEn,
  ar: messagesAr,
  de: messagesDe,
  el: messagesEl,
  es: messagesEs,
  fr: messagesFr,
  it: messagesIt,
  ja: messagesJa,
  ko: messagesKo,
  ru: messagesRu,
  vi: messagesVi,
  yue: messagesYue,
  zh: messagesZh,
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

  if (language.startsWith("zh")) {
    return "zh";
  }

  return resolveLocale(language.split("-")[0]) ?? "en";
}

export function formatMessage(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}
