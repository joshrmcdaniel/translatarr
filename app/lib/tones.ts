/**
 * The optional translation-tone registry.
 *
 * A tone is an emotion or attitude the user wants the translation to convey
 * (friendly, angry, apologetic, …). It is an *input* — distinct from the
 * per-option `tone` the model reports in `translation-schema.ts`. Selecting one
 * injects a clause into the system prompt (see `translation-service.ts`);
 * selecting nothing leaves the prompt untouched.
 *
 * Each preset code doubles as the English term sent to the API and prompt (the
 * prompt is English, so an English tone word is what we inject). Free-text tones
 * are sent verbatim. UI display names are localized in `i18n/tone-names.ts`.
 */

export const tonePresets = [
  "friendly",
  "formal",
  "polite",
  "playful",
  "affectionate",
  "excited",
  "confident",
  "angry",
  "urgent",
  "apologetic",
  "sad",
] as const;

export type TonePreset = (typeof tonePresets)[number];

/** Upper bound on a tone value (preset code or free text). */
export const MAX_TONE_CHARS = 60;
