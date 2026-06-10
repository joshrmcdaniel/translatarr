export type Language = {
  code: string;
  name: string;
  needsRomanization: boolean;
};

export const languages = [
  { code: "en", name: "English", needsRomanization: false },
  { code: "es", name: "Spanish", needsRomanization: false },
  { code: "fr", name: "French", needsRomanization: false },
  { code: "de", name: "German", needsRomanization: false },
  { code: "zh", name: "Chinese", needsRomanization: true },
  { code: "ja", name: "Japanese", needsRomanization: true },
  { code: "ar", name: "Arabic", needsRomanization: true },
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
