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
  { code: "fr", name: "French", needsRomanization: false },
  { code: "de", name: "German", needsRomanization: false },
  { code: "el", name: "Greek", needsRomanization: true },
  { code: "it", name: "Italian", needsRomanization: false },
  { code: "ja", name: "Japanese", needsRomanization: true },
  { code: "ko", name: "Korean", needsRomanization: true },
  { code: "ru", name: "Russian", needsRomanization: true },
  { code: "es", name: "Spanish", needsRomanization: false },
  { code: "uk", name: "Ukrainian", needsRomanization: true },
  { code: "vi", name: "Vietnamese", needsRomanization: false },
] satisfies Language[];

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
