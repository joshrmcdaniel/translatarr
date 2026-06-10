/**
 * Localized display names for the supported languages.
 *
 * English names come straight from the language registry; every other locale
 * is an exhaustive `Record<LanguageCode, string>`, so adding a language to
 * `languages.ts` will not compile until it is named in each locale here.
 */

import { autoDetectLanguage, languageName, languages, type LanguageCode } from "../languages";
import type { Locale } from "./messages";

const englishNames = Object.fromEntries(languages.map((language) => [language.code, language.name])) as Record<
  LanguageCode,
  string
>;

const chineseNames: Record<LanguageCode, string> = {
  en: "英语",
  ar: "阿拉伯语",
  yue: "粤语",
  zh: "中文（普通话）",
  fr: "法语",
  de: "德语",
  el: "希腊语",
  it: "意大利语",
  ja: "日语",
  ko: "韩语",
  ru: "俄语",
  es: "西班牙语",
  uk: "乌克兰语",
  vi: "越南语",
};

const cantoneseNames: Record<LanguageCode, string> = {
  en: "英文",
  ar: "阿拉伯文",
  yue: "廣東話",
  zh: "中文（普通話）",
  fr: "法文",
  de: "德文",
  el: "希臘文",
  it: "意大利文",
  ja: "日文",
  ko: "韓文",
  ru: "俄文",
  es: "西班牙文",
  uk: "烏克蘭文",
  vi: "越南文",
};

const japaneseNames: Record<LanguageCode, string> = {
  en: "英語",
  ar: "アラビア語",
  yue: "広東語",
  zh: "中国語（普通話）",
  fr: "フランス語",
  de: "ドイツ語",
  el: "ギリシャ語",
  it: "イタリア語",
  ja: "日本語",
  ko: "韓国語",
  ru: "ロシア語",
  es: "スペイン語",
  uk: "ウクライナ語",
  vi: "ベトナム語",
};

const koreanNames: Record<LanguageCode, string> = {
  en: "영어",
  ar: "아랍어",
  yue: "광둥어",
  zh: "중국어(표준어)",
  fr: "프랑스어",
  de: "독일어",
  el: "그리스어",
  it: "이탈리아어",
  ja: "일본어",
  ko: "한국어",
  ru: "러시아어",
  es: "스페인어",
  uk: "우크라이나어",
  vi: "베트남어",
};

const localizedNames: Record<Locale, Record<LanguageCode, string>> = {
  en: englishNames,
  zh: chineseNames,
  yue: cantoneseNames,
  ja: japaneseNames,
  ko: koreanNames,
};

const autoDetectNames: Record<Locale, string> = {
  en: autoDetectLanguage.name,
  zh: "自动检测",
  yue: "自動檢測",
  ja: "自動検出",
  ko: "자동 감지",
};

export function localizedLanguageName(locale: Locale, code: string): string {
  if (code === autoDetectLanguage.code) {
    return autoDetectNames[locale];
  }

  return localizedNames[locale][code as LanguageCode] ?? languageName(code);
}
