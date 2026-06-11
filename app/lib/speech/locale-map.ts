/**
 * Locale mapping between the app's language codes and the BCP-47 tags used by
 * the Web Speech API and provider audio endpoints.
 *
 * The map is typed against `LanguageCode`, so adding a language to
 * `app/lib/languages.ts` is a compile error until it is mapped here.
 */

import type { LanguageCode } from "../languages";
import { autoDetectLanguage } from "../languages";

type LocaleInfo = {
  bcp47: string;
  /** Recognition tag when it differs from the synthesis tag (e.g. Cantonese). */
  recognitionLang?: string;
};

const localeMap: Record<LanguageCode, LocaleInfo> = {
  en: { bcp47: "en-US" },
  ar: { bcp47: "ar-SA" },
  yue: { bcp47: "zh-HK", recognitionLang: "yue-Hant-HK" },
  zh: { bcp47: "zh-CN" },
  cs: { bcp47: "cs-CZ" },
  nl: { bcp47: "nl-NL" },
  fi: { bcp47: "fi-FI" },
  fr: { bcp47: "fr-FR" },
  de: { bcp47: "de-DE" },
  el: { bcp47: "el-GR" },
  he: { bcp47: "he-IL" },
  hu: { bcp47: "hu-HU" },
  id: { bcp47: "id-ID" },
  it: { bcp47: "it-IT" },
  ja: { bcp47: "ja-JP" },
  km: { bcp47: "km-KH" },
  ko: { bcp47: "ko-KR" },
  mn: { bcp47: "mn-MN" },
  fa: { bcp47: "fa-IR" },
  pl: { bcp47: "pl-PL" },
  pt: { bcp47: "pt-BR" },
  ro: { bcp47: "ro-RO" },
  ru: { bcp47: "ru-RU" },
  es: { bcp47: "es-ES" },
  sv: { bcp47: "sv-SE" },
  tl: { bcp47: "fil-PH" },
  th: { bcp47: "th-TH" },
  uk: { bcp47: "uk-UA" },
  vi: { bcp47: "vi-VN" },
};

function isMappedLanguage(code: string): code is LanguageCode {
  return code in localeMap;
}

/** BCP-47 tag for synthesis/voice matching. Unknown codes pass through. */
export function toBcp47(code: string): string {
  return isMappedLanguage(code) ? localeMap[code].bcp47 : code;
}

/**
 * BCP-47 tag for browser speech recognition. `auto` defers to the browser's
 * own locale since SpeechRecognition cannot auto-detect.
 */
export function toRecognitionLang(code: string): string {
  if (code === autoDetectLanguage.code) {
    return typeof navigator === "undefined" ? "en-US" : navigator.language;
  }

  if (isMappedLanguage(code)) {
    const info = localeMap[code];
    return info.recognitionLang ?? info.bcp47;
  }

  return code;
}

function normalizeVoiceLang(lang: string): string {
  return lang.toLowerCase().replace("_", "-");
}

/**
 * Picks the best synthesis voice for a language: exact BCP-47 match first,
 * then any voice sharing the primary subtag, preferring browser defaults.
 */
export function pickVoice(voices: SpeechSynthesisVoice[], code: string): SpeechSynthesisVoice | null {
  const target = normalizeVoiceLang(toBcp47(code));
  const primarySubtag = target.split("-")[0];

  const exactMatches = voices.filter((voice) => normalizeVoiceLang(voice.lang) === target);
  const prefixMatches = voices.filter((voice) => normalizeVoiceLang(voice.lang).split("-")[0] === primarySubtag);
  const candidates = exactMatches.length > 0 ? exactMatches : prefixMatches;

  return candidates.find((voice) => voice.default) ?? candidates[0] ?? null;
}

/**
 * Resolves the synthesis voice list, waiting for `voiceschanged` when the
 * list is initially empty (iOS Safari populates it late) with a timeout
 * fallback so callers never hang.
 */
export function getVoicesAsync(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis;
  const voices = synth.getVoices();

  if (voices.length > 0) {
    return Promise.resolve(voices);
  }

  return new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (!settled) {
        settled = true;
        resolve(synth.getVoices());
      }
    };

    const timer = setTimeout(finish, 1500);
    synth.addEventListener(
      "voiceschanged",
      () => {
        clearTimeout(timer);
        finish();
      },
      { once: true },
    );
  });
}
