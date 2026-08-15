/**
 * Localized display names for the tone presets (see `../tones.ts`).
 *
 * English names are the base; every other locale is an exhaustive
 * `Record<TonePreset, string>`, so adding a preset to `tones.ts` will not
 * compile until it is named in each locale here — the same guarantee
 * `language-names.ts` gives for language names.
 *
 * Only preset codes are localized. Free-text tones are shown verbatim, so
 * `localizedToneName` falls back to the given string for anything unknown.
 */

import type { TonePreset } from "../tones";
import type { Locale } from "./messages";

type ToneNames = Record<TonePreset, string>;

const en: ToneNames = {
  friendly: "Friendly",
  formal: "Formal",
  polite: "Polite",
  playful: "Playful",
  affectionate: "Affectionate",
  excited: "Excited",
  confident: "Confident",
  angry: "Angry",
  urgent: "Urgent",
  apologetic: "Apologetic",
  sad: "Sad",
};

const ar: ToneNames = {
  friendly: "ودّي",
  formal: "رسمي",
  polite: "مهذّب",
  playful: "مرح",
  affectionate: "حنون",
  excited: "متحمّس",
  confident: "واثق",
  angry: "غاضب",
  urgent: "عاجل",
  apologetic: "اعتذاري",
  sad: "حزين",
};

const cs: ToneNames = {
  friendly: "Přátelský",
  formal: "Formální",
  polite: "Zdvořilý",
  playful: "Hravý",
  affectionate: "Láskyplný",
  excited: "Nadšený",
  confident: "Sebejistý",
  angry: "Rozzlobený",
  urgent: "Naléhavý",
  apologetic: "Omluvný",
  sad: "Smutný",
};

const de: ToneNames = {
  friendly: "Freundlich",
  formal: "Förmlich",
  polite: "Höflich",
  playful: "Verspielt",
  affectionate: "Liebevoll",
  excited: "Begeistert",
  confident: "Selbstbewusst",
  angry: "Wütend",
  urgent: "Dringend",
  apologetic: "Entschuldigend",
  sad: "Traurig",
};

const el: ToneNames = {
  friendly: "Φιλικός",
  formal: "Επίσημος",
  polite: "Ευγενικός",
  playful: "Παιχνιδιάρικος",
  affectionate: "Στοργικός",
  excited: "Ενθουσιασμένος",
  confident: "Σίγουρος",
  angry: "Θυμωμένος",
  urgent: "Επείγον",
  apologetic: "Απολογητικός",
  sad: "Λυπημένος",
};

const es: ToneNames = {
  friendly: "Amistoso",
  formal: "Formal",
  polite: "Cortés",
  playful: "Juguetón",
  affectionate: "Cariñoso",
  excited: "Entusiasmado",
  confident: "Seguro",
  angry: "Enojado",
  urgent: "Urgente",
  apologetic: "De disculpa",
  sad: "Triste",
};

const fa: ToneNames = {
  friendly: "دوستانه",
  formal: "رسمی",
  polite: "مؤدبانه",
  playful: "بازیگوش",
  affectionate: "مهرآمیز",
  excited: "هیجان‌زده",
  confident: "مطمئن",
  angry: "عصبانی",
  urgent: "فوری",
  apologetic: "عذرخواهانه",
  sad: "غمگین",
};

const fi: ToneNames = {
  friendly: "Ystävällinen",
  formal: "Muodollinen",
  polite: "Kohtelias",
  playful: "Leikkisä",
  affectionate: "Hellä",
  excited: "Innostunut",
  confident: "Itsevarma",
  angry: "Vihainen",
  urgent: "Kiireellinen",
  apologetic: "Anteeksipyytävä",
  sad: "Surullinen",
};

const fr: ToneNames = {
  friendly: "Amical",
  formal: "Formel",
  polite: "Poli",
  playful: "Enjoué",
  affectionate: "Affectueux",
  excited: "Enthousiaste",
  confident: "Assuré",
  angry: "En colère",
  urgent: "Urgent",
  apologetic: "D'excuse",
  sad: "Triste",
};

const hu: ToneNames = {
  friendly: "Barátságos",
  formal: "Hivatalos",
  polite: "Udvarias",
  playful: "Játékos",
  affectionate: "Szeretetteljes",
  excited: "Izgatott",
  confident: "Magabiztos",
  angry: "Dühös",
  urgent: "Sürgős",
  apologetic: "Bocsánatkérő",
  sad: "Szomorú",
};

const id: ToneNames = {
  friendly: "Ramah",
  formal: "Formal",
  polite: "Sopan",
  playful: "Ceria",
  affectionate: "Penuh kasih",
  excited: "Bersemangat",
  confident: "Percaya diri",
  angry: "Marah",
  urgent: "Mendesak",
  apologetic: "Meminta maaf",
  sad: "Sedih",
};

const it: ToneNames = {
  friendly: "Amichevole",
  formal: "Formale",
  polite: "Cortese",
  playful: "Giocoso",
  affectionate: "Affettuoso",
  excited: "Entusiasta",
  confident: "Sicuro",
  angry: "Arrabbiato",
  urgent: "Urgente",
  apologetic: "Di scuse",
  sad: "Triste",
};

const ja: ToneNames = {
  friendly: "フレンドリー",
  formal: "フォーマル",
  polite: "礼儀正しい",
  playful: "遊び心のある",
  affectionate: "愛情のこもった",
  excited: "興奮した",
  confident: "自信のある",
  angry: "怒った",
  urgent: "緊急",
  apologetic: "謝罪",
  sad: "悲しい",
};

const km: ToneNames = {
  friendly: "រួសរាយ",
  formal: "ផ្លូវការ",
  polite: "សុភាព",
  playful: "លេងសើច",
  affectionate: "ស្រឡាញ់រាប់អាន",
  excited: "រំភើប",
  confident: "ជឿជាក់",
  angry: "ខឹង",
  urgent: "បន្ទាន់",
  apologetic: "សុំទោស",
  sad: "ក្រៀមក្រំ",
};

const ko: ToneNames = {
  friendly: "친근한",
  formal: "격식 있는",
  polite: "정중한",
  playful: "장난스러운",
  affectionate: "다정한",
  excited: "신난",
  confident: "자신감 있는",
  angry: "화난",
  urgent: "긴급한",
  apologetic: "사과하는",
  sad: "슬픈",
};

const mn: ToneNames = {
  friendly: "Найрсаг",
  formal: "Албан ёсны",
  polite: "Эелдэг",
  playful: "Тоглоомч",
  affectionate: "Энхрий",
  excited: "Догдолсон",
  confident: "Итгэлтэй",
  angry: "Уурласан",
  urgent: "Яаралтай",
  apologetic: "Уучлалт хүссэн",
  sad: "Гунигтай",
};

const nl: ToneNames = {
  friendly: "Vriendelijk",
  formal: "Formeel",
  polite: "Beleefd",
  playful: "Speels",
  affectionate: "Liefdevol",
  excited: "Enthousiast",
  confident: "Zelfverzekerd",
  angry: "Boos",
  urgent: "Dringend",
  apologetic: "Verontschuldigend",
  sad: "Verdrietig",
};

const pl: ToneNames = {
  friendly: "Przyjazny",
  formal: "Formalny",
  polite: "Uprzejmy",
  playful: "Żartobliwy",
  affectionate: "Czuły",
  excited: "Podekscytowany",
  confident: "Pewny siebie",
  angry: "Zły",
  urgent: "Pilny",
  apologetic: "Przepraszający",
  sad: "Smutny",
};

const pt: ToneNames = {
  friendly: "Amigável",
  formal: "Formal",
  polite: "Educado",
  playful: "Brincalhão",
  affectionate: "Afetuoso",
  excited: "Empolgado",
  confident: "Confiante",
  angry: "Zangado",
  urgent: "Urgente",
  apologetic: "De desculpas",
  sad: "Triste",
};

const ro: ToneNames = {
  friendly: "Prietenos",
  formal: "Formal",
  polite: "Politicos",
  playful: "Jucăuș",
  affectionate: "Afectuos",
  excited: "Entuziasmat",
  confident: "Încrezător",
  angry: "Furios",
  urgent: "Urgent",
  apologetic: "De scuze",
  sad: "Trist",
};

const ru: ToneNames = {
  friendly: "Дружелюбный",
  formal: "Формальный",
  polite: "Вежливый",
  playful: "Игривый",
  affectionate: "Ласковый",
  excited: "Взволнованный",
  confident: "Уверенный",
  angry: "Злой",
  urgent: "Срочный",
  apologetic: "Извиняющийся",
  sad: "Грустный",
};

const sv: ToneNames = {
  friendly: "Vänlig",
  formal: "Formell",
  polite: "Artig",
  playful: "Lekfull",
  affectionate: "Kärleksfull",
  excited: "Entusiastisk",
  confident: "Självsäker",
  angry: "Arg",
  urgent: "Brådskande",
  apologetic: "Ursäktande",
  sad: "Ledsen",
};

const th: ToneNames = {
  friendly: "เป็นมิตร",
  formal: "เป็นทางการ",
  polite: "สุภาพ",
  playful: "ขี้เล่น",
  affectionate: "อ่อนโยน",
  excited: "ตื่นเต้น",
  confident: "มั่นใจ",
  angry: "โกรธ",
  urgent: "เร่งด่วน",
  apologetic: "ขอโทษ",
  sad: "เศร้า",
};

const tl: ToneNames = {
  friendly: "Palakaibigan",
  formal: "Pormal",
  polite: "Magalang",
  playful: "Mapaglaro",
  affectionate: "Mapagmahal",
  excited: "Sabik",
  confident: "May tiwala sa sarili",
  angry: "Galit",
  urgent: "Apurahan",
  apologetic: "Humihingi ng paumanhin",
  sad: "Malungkot",
};

const vi: ToneNames = {
  friendly: "Thân thiện",
  formal: "Trang trọng",
  polite: "Lịch sự",
  playful: "Vui đùa",
  affectionate: "Trìu mến",
  excited: "Phấn khích",
  confident: "Tự tin",
  angry: "Tức giận",
  urgent: "Khẩn cấp",
  apologetic: "Xin lỗi",
  sad: "Buồn",
};

const yue: ToneNames = {
  friendly: "友善",
  formal: "正式",
  polite: "有禮",
  playful: "頑皮",
  affectionate: "深情",
  excited: "興奮",
  confident: "自信",
  angry: "憤怒",
  urgent: "緊急",
  apologetic: "歉意",
  sad: "傷心",
};

const zh: ToneNames = {
  friendly: "友好",
  formal: "正式",
  polite: "礼貌",
  playful: "俏皮",
  affectionate: "深情",
  excited: "兴奋",
  confident: "自信",
  angry: "愤怒",
  urgent: "紧急",
  apologetic: "歉意",
  sad: "悲伤",
};

const toneNamesByLocale: Record<Locale, ToneNames> = {
  en,
  ar,
  cs,
  de,
  el,
  es,
  fa,
  fi,
  fr,
  hu,
  id,
  it,
  ja,
  km,
  ko,
  mn,
  nl,
  pl,
  pt,
  ro,
  ru,
  sv,
  th,
  tl,
  vi,
  yue,
  zh,
};

/**
 * Localized display name for a tone. Falls back to the English name for a known
 * preset, and to the given code itself for anything else (e.g. free text).
 */
export function localizedToneName(locale: Locale, code: string): string {
  return toneNamesByLocale[locale][code as TonePreset] ?? en[code as TonePreset] ?? code;
}
