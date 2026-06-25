"use client";

/**
 * Full-screen voice conversation mode: tap a language side, speak, and the
 * utterance is transcribed, translated (persisting a turn via the parent's
 * `onUtterance`), and the top translation is spoken aloud in the other
 * language. The parent `Translator` owns all chat state.
 */

import { useEffect, useRef, useState } from "react";
import type { ChatTurn } from "../lib/chat-types";
import { speechErrorMessage, useI18n } from "../lib/i18n/i18n-context";
import { autoDetectLanguage } from "../lib/languages";
import type { SpeechEffectiveView } from "../lib/settings-types";
import { unlockAudio, type SpeechError } from "../lib/speech/speech-client";
import { useSpeechInput, useSpeechOutput } from "../lib/speech/use-speech";
import { translationOutputLang, type TranslationResponse } from "../lib/translation-schema";

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
  const { t, languageLabel } = useI18n();
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
          setBanner(speechErrorMessage(t, speechError));
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
        const spokenLang = translationOutputLang(result, fromLang, toLang);
        setBusyPhase("speaking");
        setReplayable({ text: topOption.text, lang: spokenLang });
        await speechOutput.speak(`voice-${Date.now()}`, topOption.text, spokenLang);
      }
    } catch (utteranceError) {
      setBanner(
        utteranceError instanceof Error && utteranceError.message
          ? utteranceError.message
          : t("common.translationFailed"),
      );
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
    ? t("voice.pickConcreteSource")
    : phase === "listening"
      ? t("voice.listening", { language: languageLabel(langFor(activeSide ?? "source")) })
      : phase === "transcribing"
        ? t("voice.transcribing")
        : phase === "translating"
          ? t("voice.translating")
          : phase === "speaking"
            ? t("voice.speaking")
            : t("voice.tapToTalk");

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="voice-mode"
        role="dialog"
        aria-modal="true"
        aria-label={t("voice.title")}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="voice-header">
          <strong>{t("voice.title")}</strong>
          <span className="badge">
            {languageLabel(sourceLang)} ⇄ {languageLabel(targetLang)}
          </span>
          <button type="button" className="ghost-button" onClick={onClose}>
            {t("common.close")}
          </button>
        </header>

        {!speechInput.available ? (
          <div className="voice-unsupported">
            <p>{t("speech.unavailableReason")}</p>
            <p className="subtle">{t("voice.unavailableHint")}</p>
          </div>
        ) : (
          <>
            <div className="voice-transcript" ref={transcriptRef}>
              {turns.length === 0 && !speechInput.interim ? (
                <div className="voice-empty">{t("voice.emptyTranscript")}</div>
              ) : null}

              {turns.map((turn) => {
                const chosenOption = turn.result.translations[turn.selectedOption] ?? turn.result.translations[0];

                return (
                  <div key={turn.id} className="voice-turn">
                    <span className="voice-turn-meta">
                      {t("translator.languagePair", {
                        source: languageLabel(turn.sourceLang),
                        target: languageLabel(turn.targetLang),
                      })}
                    </span>
                    <p className="voice-turn-source">{turn.text}</p>
                    <p className="voice-turn-translation">{chosenOption?.text}</p>
                    {chosenOption?.romanization ? (
                      <span className="voice-turn-romanization">{chosenOption.romanization}</span>
                    ) : null}
                  </div>
                );
              })}

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
                    {t("common.retry")}
                  </button>
                ) : null}
              </div>
            ) : null}

            {speechOutput.error ? (
              <div className="voice-banner">
                <span>
                  {speechOutput.error.providerCode
                    ? speechErrorMessage(t, speechOutput.error)
                    : t("voice.playbackBlocked")}
                </span>
                {replayable && !speechOutput.error.providerCode ? (
                  <button type="button" className="ghost-button" onClick={replayLast}>
                    {t("voice.playTranslation")}
                  </button>
                ) : null}
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
                <small>{t("voice.speakSide")}</small>
                <strong>{languageLabel(sourceLang)}</strong>
              </button>

              <button type="button" className="swap-button" onClick={onSwap} disabled={phase !== "idle"}>
                {t("common.swap")}
              </button>

              <button
                type="button"
                className={
                  activeSide === "target" && phase === "listening" ? "voice-lang-button listening" : "voice-lang-button"
                }
                onClick={() => tapSide("target")}
                disabled={needsConcreteSource || (phase === "transcribing" || phase === "translating")}
              >
                <small>{t("voice.speakSide")}</small>
                <strong>{languageLabel(targetLang)}</strong>
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
