"use client";

/**
 * Full-screen voice conversation mode: tap a language side, speak, and the
 * utterance is transcribed, translated (persisting a turn via the parent's
 * `onUtterance`), and the top translation is spoken aloud in the other
 * language. The parent `Translator` owns all chat state.
 */

import { useEffect, useRef, useState } from "react";
import type { ChatTurn } from "../lib/chat-types";
import { autoDetectLanguage, languageName } from "../lib/languages";
import type { SpeechEffectiveView } from "../lib/settings-types";
import { unlockAudio, type SpeechError } from "../lib/speech/speech-client";
import { useSpeechInput, useSpeechOutput } from "../lib/speech/use-speech";
import type { TranslationResponse } from "../lib/translation-schema";

type Side = "source" | "target";

type BusyPhase = "translating" | "speaking" | null;

type PendingUtterance = {
  side: Side;
  transcript: string;
};

export function VoiceMode({
  turns,
  sourceLang,
  targetLang,
  speech,
  onUtterance,
  onSwap,
  onClose,
}: {
  turns: ChatTurn[];
  sourceLang: string;
  targetLang: string;
  speech: SpeechEffectiveView;
  onUtterance: (text: string, fromLang: string, toLang: string) => Promise<TranslationResponse>;
  onSwap: () => void;
  onClose: () => void;
}) {
  const [activeSide, setActiveSide] = useState<Side | null>(null);
  const [busyPhase, setBusyPhase] = useState<BusyPhase>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [retryBuffer, setRetryBuffer] = useState<PendingUtterance | null>(null);
  const [replayable, setReplayable] = useState<{ text: string; lang: string } | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  const speechInput = useSpeechInput(speech);
  const speechOutput = useSpeechOutput(speech);

  const needsConcreteSource = sourceLang === autoDetectLanguage.code;
  const phase = busyPhase ?? speechInput.status;

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length, speechInput.interim]);

  function langFor(side: Side) {
    return side === "source" ? sourceLang : targetLang;
  }

  function otherLang(side: Side) {
    return side === "source" ? targetLang : sourceLang;
  }

  function tapSide(side: Side) {
    unlockAudio();
    setBanner(null);
    setRetryBuffer(null);
    setReplayable(null);

    if (speechInput.status === "listening") {
      if (activeSide === side) {
        speechInput.stop();
      } else {
        speechInput.cancel();
        setActiveSide(null);
      }
      return;
    }

    if (busyPhase === "translating" || speechInput.status === "transcribing") {
      return;
    }

    if (busyPhase === "speaking") {
      utteranceGeneration.current += 1;
      setBusyPhase(null);
    }

    speechOutput.stop();
    setActiveSide(side);
    speechInput.start(
      langFor(side),
      { continuous: false },
      {
        onFinal: (transcript) => {
          void runUtterance({ side, transcript });
        },
        onError: (speechError: SpeechError) => {
          setBanner(speechError.message);
        },
        onEnd: () => {
          setActiveSide(null);
        },
      },
    );
  }

  const utteranceGeneration = useRef(0);

  async function runUtterance(pending: PendingUtterance) {
    const fromLang = langFor(pending.side);
    const toLang = otherLang(pending.side);

    utteranceGeneration.current += 1;
    const generation = utteranceGeneration.current;

    setBusyPhase("translating");
    setBanner(null);
    setRetryBuffer(null);

    try {
      const result = await onUtterance(pending.transcript, fromLang, toLang);
      const topOption = result.translations[0];

      if (topOption) {
        setBusyPhase("speaking");
        setReplayable({ text: topOption.text, lang: toLang });
        await speechOutput.speak(`voice-${Date.now()}`, topOption.text, toLang);
      }
    } catch (utteranceError) {
      setBanner(utteranceError instanceof Error ? utteranceError.message : "Translation failed.");
      setRetryBuffer(pending);
    } finally {
      if (utteranceGeneration.current === generation) {
        setBusyPhase(null);
        setActiveSide(null);
      }
    }
  }

  function replayLast() {
    if (replayable) {
      void speechOutput.speak(`voice-replay-${Date.now()}`, replayable.text, replayable.lang);
    }
  }

  const statusLabel = needsConcreteSource
    ? "Pick a source language (not auto-detect) to converse."
    : phase === "listening"
      ? `Listening in ${languageName(langFor(activeSide ?? "source"))}... tap again to stop.`
      : phase === "transcribing"
        ? "Transcribing..."
        : phase === "translating"
          ? "Translating..."
          : phase === "speaking"
            ? "Speaking..."
            : "Tap a language and start talking.";

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="voice-mode"
        role="dialog"
        aria-modal="true"
        aria-label="Voice conversation"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="voice-header">
          <strong>Voice conversation</strong>
          <span className="badge">
            {languageName(sourceLang)} ⇄ {languageName(targetLang)}
          </span>
          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </header>

        {!speechInput.available ? (
          <div className="voice-unsupported">
            <p>{speechInput.reason ?? "Voice input is unavailable."}</p>
            <p className="subtle">You can still use the speaker buttons on translations to hear them read aloud.</p>
          </div>
        ) : (
          <>
            <div className="voice-transcript" ref={transcriptRef}>
              {turns.length === 0 && !speechInput.interim ? (
                <div className="voice-empty">Conversation turns will appear here.</div>
              ) : null}

              {turns.map((turn) => (
                <div key={turn.id} className="voice-turn">
                  <span className="voice-turn-meta">
                    {languageName(turn.sourceLang)} to {languageName(turn.targetLang)}
                  </span>
                  <p className="voice-turn-source">{turn.text}</p>
                  <p className="voice-turn-translation">{turn.result.translations[0]?.text}</p>
                  {turn.result.translations[0]?.romanization ? (
                    <span className="voice-turn-romanization">{turn.result.translations[0].romanization}</span>
                  ) : null}
                </div>
              ))}

              {speechInput.interim ? (
                <div className="voice-turn interim">
                  <p className="voice-turn-source">{speechInput.interim}</p>
                </div>
              ) : null}
            </div>

            <div className="voice-status" aria-live="polite">
              {statusLabel}
            </div>

            {banner ? (
              <div className="voice-banner">
                <span>{banner}</span>
                {retryBuffer ? (
                  <button type="button" className="ghost-button" onClick={() => void runUtterance(retryBuffer)}>
                    Retry
                  </button>
                ) : null}
              </div>
            ) : null}

            {speechOutput.error && replayable ? (
              <div className="voice-banner">
                <span>Playback was blocked.</span>
                <button type="button" className="ghost-button" onClick={replayLast}>
                  Play translation
                </button>
              </div>
            ) : null}

            <footer className="voice-controls">
              <button
                type="button"
                className={
                  activeSide === "source" && phase === "listening" ? "voice-lang-button listening" : "voice-lang-button"
                }
                onClick={() => tapSide("source")}
                disabled={needsConcreteSource || (phase === "transcribing" || phase === "translating")}
              >
                <small>Speak</small>
                <strong>{languageName(sourceLang)}</strong>
              </button>

              <button type="button" className="swap-button" onClick={onSwap} disabled={phase !== "idle"}>
                Swap
              </button>

              <button
                type="button"
                className={
                  activeSide === "target" && phase === "listening" ? "voice-lang-button listening" : "voice-lang-button"
                }
                onClick={() => tapSide("target")}
                disabled={needsConcreteSource || (phase === "transcribing" || phase === "translating")}
              >
                <small>Speak</small>
                <strong>{languageName(targetLang)}</strong>
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
