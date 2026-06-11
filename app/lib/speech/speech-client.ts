/**
 * Client-side speech engines behind a single recognizer/synthesizer
 * abstraction, mirroring how `llm-client.ts` wraps LLM providers.
 *
 * The browser engine wraps the Web Speech API; the provider engine records
 * with MediaRecorder and calls the `/api/speech/*` routes. Engine choice is
 * resolved from the redacted `SpeechEffectiveView`, falling back from
 * browser to provider (or vice versa) when the preferred engine is
 * unavailable.
 */

import type { SpeechEffectiveView, SpeechEngine } from "../settings-types";
import { autoDetectLanguage } from "../languages";
import { getVoicesAsync, pickVoice, toBcp47, toRecognitionLang } from "./locale-map";

export type SpeechErrorCode =
  | "permission-denied"
  | "unsupported"
  | "not-configured"
  | "no-speech"
  | "network"
  | "provider";

export type SpeechError = {
  code: SpeechErrorCode;
  message: string;
};

export type RecognizerEvent =
  | { type: "interim"; transcript: string }
  | { type: "final"; transcript: string }
  | { type: "end" }
  | { type: "error"; error: SpeechError };

export type RecognizerEventHandler = (event: RecognizerEvent) => void;

export type RecognizerOptions = {
  continuous: boolean;
};

export interface SpeechRecognizer {
  readonly kind: SpeechEngine;
  start(langCode: string, options: RecognizerOptions): Promise<void>;
  /** Finalizes the session; the provider engine uploads and emits one final transcript. */
  stop(): void;
  /** Aborts without emitting a result. */
  cancel(): void;
}

export interface SpeechSynthesizer {
  readonly kind: SpeechEngine;
  /** Resolves when playback finishes or is stopped. */
  speak(text: string, langCode: string): Promise<void>;
  stop(): void;
}

const providerRecordingLimitMs = 60_000;

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export function isBrowserRecognitionSupported(): boolean {
  return getRecognitionConstructor() !== null;
}

function isBrowserSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

class BrowserRecognizer implements SpeechRecognizer {
  readonly kind = "browser";
  private recognition: SpeechRecognition | null = null;
  private cancelled = false;

  constructor(private readonly onEvent: RecognizerEventHandler) {}

  async start(langCode: string, options: RecognizerOptions): Promise<void> {
    const RecognitionConstructor = getRecognitionConstructor();

    if (!RecognitionConstructor) {
      this.onEvent({
        type: "error",
        error: { code: "unsupported", message: "Speech recognition is not supported in this browser." },
      });
      this.onEvent({ type: "end" });
      return;
    }

    const recognition = new RecognitionConstructor();
    recognition.lang = toRecognitionLang(langCode);
    recognition.continuous = options.continuous;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript ?? "";

        if (result.isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript.trim()) {
        this.onEvent({ type: "final", transcript: finalTranscript.trim() });
      }

      if (interimTranscript) {
        this.onEvent({ type: "interim", transcript: interimTranscript });
      }
    };

    recognition.onerror = (event) => {
      if (this.cancelled || event.error === "aborted") {
        return;
      }

      const code: SpeechErrorCode =
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "permission-denied"
          : event.error === "no-speech"
            ? "no-speech"
            : event.error === "network"
              ? "network"
              : "provider";
      const message =
        code === "permission-denied"
          ? "Microphone access was denied."
          : code === "no-speech"
            ? "No speech was detected."
            : `Speech recognition failed (${event.error}).`;

      this.onEvent({ type: "error", error: { code, message } });
    };

    recognition.onend = () => {
      if (!this.cancelled) {
        this.onEvent({ type: "end" });
      }
    };

    this.recognition = recognition;
    recognition.start();
  }

  stop(): void {
    this.recognition?.stop();
  }

  cancel(): void {
    this.cancelled = true;
    this.recognition?.abort();
  }
}

class ProviderRecognizer implements SpeechRecognizer {
  readonly kind = "provider";
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private cancelled = false;
  private langCode: string = autoDetectLanguage.code;
  private limitTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly onEvent: RecognizerEventHandler) {}

  async start(langCode: string): Promise<void> {
    this.langCode = langCode;

    let stream: MediaStream;

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      this.onEvent({ type: "error", error: { code: "permission-denied", message: "Microphone access was denied." } });
      this.onEvent({ type: "end" });
      return;
    }

    if (this.cancelled) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };
    recorder.onstop = () => {
      void this.finalize();
    };

    this.stream = stream;
    this.recorder = recorder;
    this.chunks = [];
    recorder.start();
    this.limitTimer = setTimeout(() => this.stop(), providerRecordingLimitMs);
  }

  stop(): void {
    this.clearLimitTimer();

    if (this.recorder && this.recorder.state !== "inactive") {
      this.recorder.stop();
    }
  }

  cancel(): void {
    this.cancelled = true;
    this.clearLimitTimer();

    if (this.recorder && this.recorder.state !== "inactive") {
      this.recorder.stop();
    } else {
      this.releaseStream();
    }
  }

  private clearLimitTimer(): void {
    if (this.limitTimer !== null) {
      clearTimeout(this.limitTimer);
      this.limitTimer = null;
    }
  }

  private releaseStream(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  private async finalize(): Promise<void> {
    this.releaseStream();

    if (this.cancelled) {
      this.chunks = [];
      return;
    }

    const mimeType = this.recorder?.mimeType || "audio/webm";
    const blob = new Blob(this.chunks, { type: mimeType });
    this.chunks = [];

    if (blob.size === 0) {
      this.onEvent({ type: "error", error: { code: "no-speech", message: "No audio was recorded." } });
      this.onEvent({ type: "end" });
      return;
    }

    const extension = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
    const form = new FormData();
    form.append("file", blob, `speech.${extension}`);

    if (this.langCode !== autoDetectLanguage.code) {
      form.append("language", this.langCode);
    }

    try {
      const response = await fetch("/api/speech/transcribe", { method: "POST", body: form });
      const payload = (await response.json()) as { text?: string; error?: string };

      if (!response.ok || typeof payload.text !== "string") {
        this.onEvent({
          type: "error",
          error: {
            code: response.status === 400 ? "not-configured" : "provider",
            message: payload.error ?? "Transcription failed.",
          },
        });
      } else if (payload.text.trim()) {
        this.onEvent({ type: "final", transcript: payload.text.trim() });
      } else {
        this.onEvent({ type: "error", error: { code: "no-speech", message: "No speech was detected." } });
      }
    } catch {
      this.onEvent({ type: "error", error: { code: "network", message: "Could not reach the server." } });
    }

    this.onEvent({ type: "end" });
  }
}

class BrowserSynthesizer implements SpeechSynthesizer {
  readonly kind = "browser";
  private delegated = false;

  /**
   * `fallback` handles utterances for which no matching voice exists — iOS
   * (especially in home-screen PWAs) otherwise ignores `utterance.lang` and
   * reads the text with its default voice.
   */
  constructor(private readonly fallback: SpeechSynthesizer | null = null) {}

  async speak(text: string, langCode: string): Promise<void> {
    const voices = await getVoicesAsync();
    const voice = pickVoice(voices, langCode);

    if (!voice && this.fallback) {
      this.delegated = true;
      return this.fallback.speak(text, langCode);
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = toBcp47(langCode);

    if (voice) {
      utterance.voice = voice;
    }

    await new Promise<void>((resolve) => {
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    });
  }

  stop(): void {
    if (this.delegated) {
      this.fallback?.stop();
      return;
    }

    window.speechSynthesis.cancel();
  }
}

let sharedAudio: HTMLAudioElement | null = null;

function getSharedAudio(): HTMLAudioElement {
  if (!sharedAudio) {
    sharedAudio = new Audio();
  }

  return sharedAudio;
}

const silentWavDataUri = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

/**
 * Marks the shared audio element as user-activated by playing a silent clip
 * inside a user gesture, so later provider-TTS auto-speak survives autoplay
 * policies. Also warms the synthesis voice list, which iOS only loads lazily
 * and most reliably inside a user gesture. Call from click handlers that may
 * lead to asynchronous playback.
 */
export function unlockAudio(): void {
  if (typeof window === "undefined") {
    return;
  }

  if (isBrowserSynthesisSupported()) {
    void getVoicesAsync();
  }

  const audio = getSharedAudio();

  if (audio.src && !audio.paused) {
    return;
  }

  audio.src = silentWavDataUri;
  void audio.play().catch(() => {});
}

class ProviderSynthesizer implements SpeechSynthesizer {
  readonly kind = "provider";
  private objectUrl: string | null = null;

  async speak(text: string, langCode: string): Promise<void> {
    const response = await fetch("/api/speech/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang: langCode }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? "Speech synthesis failed.");
    }

    const blob = await response.blob();
    const audio = getSharedAudio();
    this.objectUrl = URL.createObjectURL(blob);

    try {
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onpause = () => resolve();
        audio.onerror = () => resolve();
        audio.src = this.objectUrl as string;
        audio.play().catch(reject);
      });
    } finally {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  stop(): void {
    const audio = getSharedAudio();
    audio.pause();
  }
}

export type SpeechCapabilities = {
  stt: { available: boolean; engine: SpeechEngine | null; reason: string | null };
  tts: { available: boolean; engine: SpeechEngine | null };
};

const sttUnavailableReason = "Voice input needs Chrome, Edge, or Safari — or a configured speech provider.";

/**
 * Resolves which engines are usable right now, applying the preferred engine
 * from settings and falling back to the other engine when the preferred one
 * is unsupported (browser STT in Firefox) or unconfigured (provider).
 */
export function getSpeechCapabilities(effective: SpeechEffectiveView): SpeechCapabilities {
  const browserStt = isBrowserRecognitionSupported();
  const browserTts = isBrowserSynthesisSupported();
  const providerReady = effective.providerConfigured;
  const prefersProvider = effective.engine === "provider";

  const sttEngine: SpeechEngine | null = prefersProvider
    ? providerReady
      ? "provider"
      : browserStt
        ? "browser"
        : null
    : browserStt
      ? "browser"
      : providerReady
        ? "provider"
        : null;

  const ttsEngine: SpeechEngine | null = prefersProvider
    ? providerReady
      ? "provider"
      : browserTts
        ? "browser"
        : null
    : browserTts
      ? "browser"
      : providerReady
        ? "provider"
        : null;

  return {
    stt: { available: sttEngine !== null, engine: sttEngine, reason: sttEngine === null ? sttUnavailableReason : null },
    tts: { available: ttsEngine !== null, engine: ttsEngine },
  };
}

export function createRecognizer(
  effective: SpeechEffectiveView,
  onEvent: RecognizerEventHandler,
): SpeechRecognizer | null {
  const { stt } = getSpeechCapabilities(effective);

  if (!stt.engine) {
    return null;
  }

  return stt.engine === "browser" ? new BrowserRecognizer(onEvent) : new ProviderRecognizer(onEvent);
}

export function createSynthesizer(effective: SpeechEffectiveView): SpeechSynthesizer | null {
  const { tts } = getSpeechCapabilities(effective);

  if (!tts.engine) {
    return null;
  }

  if (tts.engine === "provider") {
    return new ProviderSynthesizer();
  }

  return new BrowserSynthesizer(effective.providerConfigured ? new ProviderSynthesizer() : null);
}
