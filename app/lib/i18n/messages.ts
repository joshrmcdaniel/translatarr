/**
 * Locale registry and message-catalog plumbing for the UI.
 *
 * Pure module (safe to import from server and client code). The UI locale
 * resolves as: user preference (stored under the `locale` key in
 * `user_settings`) -> browser language -> English.
 */

import { messagesAr } from "./messages-ar";
import { messagesCs } from "./messages-cs";
import { messagesDe } from "./messages-de";
import { messagesEl } from "./messages-el";
import { messagesEn, type MessageKey } from "./messages-en";
import { messagesEs } from "./messages-es";
import { messagesFa } from "./messages-fa";
import { messagesFi } from "./messages-fi";
import { messagesFr } from "./messages-fr";
import { messagesHu } from "./messages-hu";
import { messagesId } from "./messages-id";
import { messagesIt } from "./messages-it";
import { messagesJa } from "./messages-ja";
import { messagesKm } from "./messages-km";
import { messagesKo } from "./messages-ko";
import { messagesMn } from "./messages-mn";
import { messagesNl } from "./messages-nl";
import { messagesPl } from "./messages-pl";
import { messagesPt } from "./messages-pt";
import { messagesRo } from "./messages-ro";
import { messagesRu } from "./messages-ru";
import { messagesSv } from "./messages-sv";
import { messagesTh } from "./messages-th";
import { messagesTl } from "./messages-tl";
import { messagesVi } from "./messages-vi";
import { messagesYue } from "./messages-yue";
import { messagesZh } from "./messages-zh";

export const locales = [
  "en",
  "ar",
  "cs",
  "de",
  "el",
  "es",
  "fa",
  "fi",
  "fr",
  "hu",
  "id",
  "it",
  "ja",
  "km",
  "ko",
  "mn",
  "nl",
  "pl",
  "pt",
  "ro",
  "ru",
  "sv",
  "th",
  "tl",
  "vi",
  "yue",
  "zh",
] as const;

export type Locale = (typeof locales)[number];

export type { MessageKey };

export const catalogs: Record<Locale, Record<MessageKey, string>> = {
  en: messagesEn,
  ar: messagesAr,
  cs: messagesCs,
  de: messagesDe,
  el: messagesEl,
  es: messagesEs,
  fa: messagesFa,
  fi: messagesFi,
  fr: messagesFr,
  hu: messagesHu,
  id: messagesId,
  it: messagesIt,
  ja: messagesJa,
  km: messagesKm,
  ko: messagesKo,
  mn: messagesMn,
  nl: messagesNl,
  pl: messagesPl,
  pt: messagesPt,
  ro: messagesRo,
  ru: messagesRu,
  sv: messagesSv,
  th: messagesTh,
  tl: messagesTl,
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

  if (language.startsWith("fil")) {
    return "tl";
  }

  return resolveLocale(language.split("-")[0]) ?? "en";
}

export function formatMessage(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}
