/**
 * React hooks over the client speech engines: one for microphone input
 * (composer dictation and conversation mode) and one for spoken output
 * (translation cards and conversation auto-speak).
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../api-error";
import type { SpeechEffectiveView } from "../settings-types";
import {
  createRecognizer,
  createSynthesizer,
  getSpeechCapabilities,
  type RecognizerOptions,
  type SpeechError,
  type SpeechRecognizer,
  type SpeechSynthesizer,
} from "./speech-client";

export type SpeechInputStatus = "idle" | "listening" | "transcribing";

export type SpeechInputHandlers = {
  onInterim?: (transcript: string) => void;
  onFinal: (transcript: string) => void;
  onError?: (error: SpeechError) => void;
  onEnd?: () => void;
};

export function useSpeechInput(effective: SpeechEffectiveView | null) {
  const [status, setStatus] = useState<SpeechInputStatus>("idle");
  const [interim, setInterim] = useState("");
  const recognizerRef = useRef<SpeechRecognizer | null>(null);

  const capabilities = effective
    ? getSpeechCapabilities(effective).stt
    : { available: false, engine: null, reason: null };

  const cancel = useCallback(() => {
    recognizerRef.current?.cancel();
    recognizerRef.current = null;
    setStatus("idle");
    setInterim("");
  }, []);

  useEffect(() => cancel, [cancel]);

  const start = useCallback(
    (langCode: string, options: RecognizerOptions, handlers: SpeechInputHandlers) => {
      if (!effective) {
        return;
      }

      recognizerRef.current?.cancel();

      const recognizer = createRecognizer(effective, (event) => {
        if (recognizerRef.current !== recognizer) {
          return;
        }

        switch (event.type) {
          case "interim":
            setInterim(event.transcript);
            handlers.onInterim?.(event.transcript);
            break;
          case "final":
            setInterim("");
            handlers.onFinal(event.transcript);
            break;
          case "end":
            recognizerRef.current = null;
            setStatus("idle");
            setInterim("");
            handlers.onEnd?.();
            break;
          case "error":
            handlers.onError?.(event.error);
            break;
        }
      });

      if (!recognizer) {
        handlers.onError?.({ code: "unsupported", message: capabilities.reason ?? "Voice input is unavailable." });
        return;
      }

      recognizerRef.current = recognizer;
      setStatus("listening");
      setInterim("");
      void recognizer.start(langCode, options);
    },
    [effective, capabilities.reason],
  );

  const stop = useCallback(() => {
    const recognizer = recognizerRef.current;

    if (!recognizer) {
      return;
    }

    if (recognizer.kind === "provider") {
      setStatus("transcribing");
    }

    recognizer.stop();
  }, []);

  return {
    status,
    interim,
    available: capabilities.available,
    engine: capabilities.engine,
    reason: capabilities.reason,
    start,
    stop,
    cancel,
  };
}

export function useSpeechOutput(effective: SpeechEffectiveView | null) {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [error, setError] = useState<SpeechError | null>(null);
  const synthesizerRef = useRef<SpeechSynthesizer | null>(null);

  const capabilities = effective ? getSpeechCapabilities(effective).tts : { available: false, engine: null };

  const stop = useCallback(() => {
    synthesizerRef.current?.stop();
    synthesizerRef.current = null;
    setSpeakingId(null);
  }, []);

  useEffect(() => stop, [stop]);

  const speak = useCallback(
    async (id: string, text: string, langCode: string) => {
      if (!effective) {
        return;
      }

      if (speakingId === id) {
        stop();
        return;
      }

      synthesizerRef.current?.stop();

      const synthesizer = createSynthesizer(effective);

      if (!synthesizer) {
        return;
      }

      synthesizerRef.current = synthesizer;
      setSpeakingId(id);
      setError(null);

      try {
        await synthesizer.speak(text, langCode);
      } catch (speakError) {
        setError(
          speakError instanceof ApiError
            ? { code: "provider", message: speakError.message, providerCode: speakError.code ?? undefined }
            : { code: "provider", message: speakError instanceof Error ? speakError.message : "Speech playback failed." },
        );
      } finally {
        if (synthesizerRef.current === synthesizer) {
          synthesizerRef.current = null;
          setSpeakingId(null);
        }
      }
    },
    [effective, speakingId, stop],
  );

  return { speakingId, error, available: capabilities.available, speak, stop };
}
