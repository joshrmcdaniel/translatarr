export type Language = {
  code: string;
  name: string;
  needsRomanization: boolean;
};

export const languages = [
  { code: "en", name: "English", needsRomanization: false },
  { code: "ar", name: "Arabic", needsRomanization: true },
  { code: "yue", name: "Cantonese", needsRomanization: true },
  { code: "zh", name: "Chinese (Mandarin)", needsRomanization: true },
  { code: "cs", name: "Czech", needsRomanization: false },
  { code: "nl", name: "Dutch", needsRomanization: false },
  { code: "fi", name: "Finnish", needsRomanization: false },
  { code: "fr", name: "French", needsRomanization: false },
  { code: "de", name: "German", needsRomanization: false },
  { code: "el", name: "Greek", needsRomanization: true },
  { code: "he", name: "Hebrew", needsRomanization: true },
  { code: "hu", name: "Hungarian", needsRomanization: false },
  { code: "id", name: "Indonesian", needsRomanization: false },
  { code: "it", name: "Italian", needsRomanization: false },
  { code: "ja", name: "Japanese", needsRomanization: true },
  { code: "km", name: "Khmer", needsRomanization: true },
  { code: "ko", name: "Korean", needsRomanization: true },
  { code: "mn", name: "Mongolian", needsRomanization: true },
  { code: "fa", name: "Persian (Farsi)", needsRomanization: true },
  { code: "pl", name: "Polish", needsRomanization: false },
  { code: "pt", name: "Portuguese", needsRomanization: false },
  { code: "ro", name: "Romanian", needsRomanization: false },
  { code: "ru", name: "Russian", needsRomanization: true },
  { code: "es", name: "Spanish", needsRomanization: false },
  { code: "sv", name: "Swedish", needsRomanization: false },
  { code: "tl", name: "Tagalog", needsRomanization: false },
  { code: "th", name: "Thai", needsRomanization: true },
  { code: "uk", name: "Ukrainian", needsRomanization: true },
  { code: "vi", name: "Vietnamese", needsRomanization: false },
] as const satisfies readonly Language[];

export type LanguageCode = (typeof languages)[number]["code"];

export const autoDetectLanguage = {
  code: "auto",
  name: "Auto-detect",
  needsRomanization: false,
} satisfies Language;

export function languageName(code: string) {
  if (code === autoDetectLanguage.code) {
    return autoDetectLanguage.name;
  }

  return languages.find((language) => language.code === code)?.name ?? code;
}

export function isSupportedLanguage(code: string) {
  return code === autoDetectLanguage.code || languages.some((language) => language.code === code);
}
