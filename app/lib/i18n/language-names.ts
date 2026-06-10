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

const arabicNames: Record<LanguageCode, string> = {
  en: "الإنجليزية",
  ar: "العربية",
  yue: "الكانتونية",
  zh: "الصينية (الماندرين)",
  he: "العبرية",
  fr: "الفرنسية",
  de: "الألمانية",
  el: "اليونانية",
  it: "الإيطالية",
  ja: "اليابانية",
  ko: "الكورية",
  ru: "الروسية",
  es: "الإسبانية",
  uk: "الأوكرانية",
  vi: "الفيتنامية",
};

const germanNames: Record<LanguageCode, string> = {
  en: "Englisch",
  ar: "Arabisch",
  yue: "Kantonesisch",
  zh: "Chinesisch (Mandarin)",
  he: "Hebräisch",
  fr: "Französisch",
  de: "Deutsch",
  el: "Griechisch",
  it: "Italienisch",
  ja: "Japanisch",
  ko: "Koreanisch",
  ru: "Russisch",
  es: "Spanisch",
  uk: "Ukrainisch",
  vi: "Vietnamesisch",
};

const greekNames: Record<LanguageCode, string> = {
  en: "Αγγλικά",
  ar: "Αραβικά",
  yue: "Καντονέζικα",
  zh: "Κινεζικά (Μανδαρινικά)",
  he: "Εβραϊκά",
  fr: "Γαλλικά",
  de: "Γερμανικά",
  el: "Ελληνικά",
  it: "Ιταλικά",
  ja: "Ιαπωνικά",
  ko: "Κορεατικά",
  ru: "Ρωσικά",
  es: "Ισπανικά",
  uk: "Ουκρανικά",
  vi: "Βιετναμέζικα",
};

const spanishNames: Record<LanguageCode, string> = {
  en: "Inglés",
  ar: "Árabe",
  yue: "Cantonés",
  zh: "Chino (mandarín)",
  he: "Hebreo",
  fr: "Francés",
  de: "Alemán",
  el: "Griego",
  it: "Italiano",
  ja: "Japonés",
  ko: "Coreano",
  ru: "Ruso",
  es: "Español",
  uk: "Ucraniano",
  vi: "Vietnamita",
};

const frenchNames: Record<LanguageCode, string> = {
  en: "Anglais",
  ar: "Arabe",
  yue: "Cantonais",
  zh: "Chinois (mandarin)",
  he: "Hébreu",
  fr: "Français",
  de: "Allemand",
  el: "Grec",
  it: "Italien",
  ja: "Japonais",
  ko: "Coréen",
  ru: "Russe",
  es: "Espagnol",
  uk: "Ukrainien",
  vi: "Vietnamien",
};

const italianNames: Record<LanguageCode, string> = {
  en: "Inglese",
  ar: "Arabo",
  yue: "Cantonese",
  zh: "Cinese (mandarino)",
  he: "Ebraico",
  fr: "Francese",
  de: "Tedesco",
  el: "Greco",
  it: "Italiano",
  ja: "Giapponese",
  ko: "Coreano",
  ru: "Russo",
  es: "Spagnolo",
  uk: "Ucraino",
  vi: "Vietnamita",
};

const japaneseNames: Record<LanguageCode, string> = {
  en: "英語",
  ar: "アラビア語",
  yue: "広東語",
  zh: "中国語（普通話）",
  he: "ヘブライ語",
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
  he: "히브리어",
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

const russianNames: Record<LanguageCode, string> = {
  en: "Английский",
  ar: "Арабский",
  yue: "Кантонский",
  zh: "Китайский (путунхуа)",
  he: "Иврит",
  fr: "Французский",
  de: "Немецкий",
  el: "Греческий",
  it: "Итальянский",
  ja: "Японский",
  ko: "Корейский",
  ru: "Русский",
  es: "Испанский",
  uk: "Украинский",
  vi: "Вьетнамский",
};

const vietnameseNames: Record<LanguageCode, string> = {
  en: "Tiếng Anh",
  ar: "Tiếng Ả Rập",
  yue: "Tiếng Quảng Đông",
  zh: "Tiếng Trung (Quan Thoại)",
  he: "Tiếng Do Thái",
  fr: "Tiếng Pháp",
  de: "Tiếng Đức",
  el: "Tiếng Hy Lạp",
  it: "Tiếng Ý",
  ja: "Tiếng Nhật",
  ko: "Tiếng Hàn",
  ru: "Tiếng Nga",
  es: "Tiếng Tây Ban Nha",
  uk: "Tiếng Ukraina",
  vi: "Tiếng Việt",
};

const cantoneseNames: Record<LanguageCode, string> = {
  en: "英文",
  ar: "阿拉伯文",
  yue: "廣東話",
  zh: "中文（普通話）",
  he: "希伯來文",
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

const chineseNames: Record<LanguageCode, string> = {
  en: "英语",
  ar: "阿拉伯语",
  yue: "粤语",
  zh: "中文（普通话）",
  he: "希伯来语",
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

const localizedNames: Record<Locale, Record<LanguageCode, string>> = {
  en: englishNames,
  ar: arabicNames,
  de: germanNames,
  el: greekNames,
  es: spanishNames,
  fr: frenchNames,
  it: italianNames,
  ja: japaneseNames,
  ko: koreanNames,
  ru: russianNames,
  vi: vietnameseNames,
  yue: cantoneseNames,
  zh: chineseNames,
};

const autoDetectNames: Record<Locale, string> = {
  en: autoDetectLanguage.name,
  ar: "اكتشاف تلقائي",
  de: "Automatisch erkennen",
  el: "Αυτόματη ανίχνευση",
  es: "Detección automática",
  fr: "Détection automatique",
  it: "Rilevamento automatico",
  ja: "自動検出",
  ko: "자동 감지",
  ru: "Автоопределение",
  vi: "Tự động phát hiện",
  yue: "自動檢測",
  zh: "自动检测",
};

/** Each locale's name in its own language, for the interface-language picker. */
export const localeNativeNames: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
  de: "Deutsch",
  el: "Ελληνικά",
  es: "Español",
  fr: "Français",
  it: "Italiano",
  ja: "日本語",
  ko: "한국어",
  ru: "Русский",
  vi: "Tiếng Việt",
  yue: "廣東話",
  zh: "中文",
};

export function localizedLanguageName(locale: Locale, code: string): string {
  if (code === autoDetectLanguage.code) {
    return autoDetectNames[locale];
  }

  return localizedNames[locale][code as LanguageCode] ?? languageName(code);
}
