"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatDetail, ChatSummary, ChatTurn } from "../lib/chat-types";
import { speechErrorMessage, useI18n } from "../lib/i18n/i18n-context";
import { detectBrowserLocale, type Locale } from "../lib/i18n/messages";
import { autoDetectLanguage, languages } from "../lib/languages";
import type { SettingsPayload, SpeechEffectiveView } from "../lib/settings-types";
import { unlockAudio } from "../lib/speech/speech-client";
import { useSpeechInput, useSpeechOutput } from "../lib/speech/use-speech";
import type { TranslationOption, TranslationResponse } from "../lib/translation-schema";
import type { User } from "../lib/user-store";
import { BrandSeal } from "./brand-seal";
import { SettingsDialog } from "./settings-dialog";
import { VoiceMode } from "./voice-mode";

const MAX_CHARS = 12000;
const DEBOUNCE_MS = 1500;

type RequestState = "idle" | "loading" | "error" | "success";

type PendingTurn = {
  text: string;
  sourceLang: string;
  targetLang: string;
};

export function Translator({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { t, languageLabel, setLocale } = useI18n();
  const [text, setText] = useState("");
  const [sourceLang, setSourceLang] = useState(autoDetectLanguage.code);
  const [targetLang, setTargetLang] = useState("es");
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChat, setActiveChat] = useState<ChatDetail | null>(null);
  const [livePreview, setLivePreview] = useState(false);
  const [previewResult, setPreviewResult] = useState<TranslationResponse | null>(null);
  const [previewStatus, setPreviewStatus] = useState<RequestState>("idle");
  const [sendStatus, setSendStatus] = useState<RequestState>("idle");
  const [pendingTurn, setPendingTurn] = useState<PendingTurn | null>(null);
  const [loadStatus, setLoadStatus] = useState<RequestState>("loading");
  const [error, setError] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [speechConfig, setSpeechConfig] = useState<SpeechEffectiveView | null>(null);
  const [voiceModeOpen, setVoiceModeOpen] = useState(false);
  const cancelTitleEdit = useRef(false);
  const previewRequestId = useRef(0);
  const previewFor = useRef<{ text: string; sourceLang: string; targetLang: string } | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const dictationBase = useRef("");

  const speechInput = useSpeechInput(speechConfig);
  const speechOutput = useSpeechOutput(speechConfig);

  const trimmedText = text.trim();
  const isTooLong = text.length > MAX_CHARS;
  const canSend = Boolean(trimmedText) && !isTooLong && sendStatus !== "loading";
  const latestResult = previewResult ?? activeChat?.turns.at(-1)?.result ?? null;

  useEffect(() => {
    void initializeChats();
  }, []);

  useEffect(() => {
    if (settingsOpen) {
      return;
    }

    void loadClientSettings().then((loaded) => {
      if (!loaded) {
        return;
      }

      setSpeechConfig(loaded.speech);
      setLocale(loaded.locale ?? detectBrowserLocale());
    });
  }, [settingsOpen, setLocale]);

  useEffect(() => {
    setTitleDraft(activeChat?.title ?? "");
    setEditingTitle(false);
  }, [activeChat?.id, activeChat?.title]);

  useEffect(() => {
    timelineRef.current?.scrollTo({
      top: timelineRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [activeChat?.turns.length, previewResult, pendingTurn, activeChat?.id]);

  useEffect(() => {
    if (!livePreview || !trimmedText) {
      setPreviewResult(null);
      setPreviewStatus("idle");
      if (!trimmedText) {
        setError("");
      }
      return;
    }

    if (isTooLong) {
      setPreviewResult(null);
      setPreviewStatus("error");
      setError(t("translator.tooLong", { max: MAX_CHARS.toLocaleString() }));
      return;
    }

    const controller = new AbortController();
    const currentRequest = previewRequestId.current + 1;
    previewRequestId.current = currentRequest;

    const timeout = window.setTimeout(async () => {
      setPreviewStatus("loading");
      setError("");

      try {
        const result = await requestTranslation(trimmedText, sourceLang, targetLang, controller.signal);

        if (previewRequestId.current !== currentRequest) {
          return;
        }

        previewFor.current = { text: trimmedText, sourceLang, targetLang };
        setPreviewResult(result);
        setPreviewStatus("success");
      } catch (translationError) {
        if (controller.signal.aborted || previewRequestId.current !== currentRequest) {
          return;
        }

        setPreviewResult(null);
        setPreviewStatus("error");
        setError(translationError instanceof Error ? translationError.message : t("common.translationFailed"));
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [trimmedText, sourceLang, targetLang, livePreview, isTooLong, t]);

  const detectedLabel = useMemo(() => {
    if (!latestResult) {
      return t("translator.noDetection");
    }

    return `${languageLabel(latestResult.detectedSourceLanguage)} - ${Math.round(latestResult.confidence * 100)}%`;
  }, [latestResult, t, languageLabel]);

  async function initializeChats() {
    setLoadStatus("loading");
    setError("");

    try {
      const summaries = await listChats();
      setChats(summaries);

      if (summaries[0]) {
        const chat = await getChat(summaries[0].id);
        setActiveChat(chat);
        setSourceLang(chat.sourceLang);
        setTargetLang(chat.targetLang);
      }

      setLoadStatus("success");
    } catch (loadError) {
      setLoadStatus("error");
      setError(loadError instanceof Error ? loadError.message : t("translator.chatsLoadFailed"));
    }
  }

  async function selectChat(chatId: string) {
    setSidebarOpen(false);

    if (activeChat?.id === chatId) {
      return;
    }

    setLoadStatus("loading");
    setError("");
    setPreviewResult(null);

    try {
      const chat = await getChat(chatId);
      setActiveChat(chat);
      setSourceLang(chat.sourceLang);
      setTargetLang(chat.targetLang);
      setLoadStatus("success");
    } catch (loadError) {
      setLoadStatus("error");
      setError(loadError instanceof Error ? loadError.message : t("translator.chatLoadFailed"));
    }
  }

  async function createNewChat() {
    setSidebarOpen(false);
    setLoadStatus("loading");
    setError("");
    setPreviewResult(null);

    try {
      const chat = await createChat(sourceLang, targetLang);
      setChats((current) => [toSummary(chat), ...current]);
      setActiveChat(chat);
      setLoadStatus("success");
    } catch (createError) {
      setLoadStatus("error");
      setError(createError instanceof Error ? createError.message : t("translator.chatCreateFailed"));
    }
  }

  async function sendMessage() {
    if (!canSend) {
      return;
    }

    const submittedText = trimmedText;
    const reusablePreview =
      previewResult &&
      previewFor.current?.text === submittedText &&
      previewFor.current.sourceLang === sourceLang &&
      previewFor.current.targetLang === targetLang
        ? previewResult
        : null;

    setSendStatus("loading");
    setError("");
    setPendingTurn({ text: submittedText, sourceLang, targetLang });
    setText("");
    setPreviewResult(null);
    setPreviewStatus("idle");

    try {
      const chat = activeChat ?? (await createChat(sourceLang, targetLang));
      const updatedChat = await addChatTurn(chat.id, submittedText, sourceLang, targetLang, reusablePreview);

      setActiveChat(updatedChat);
      setChats((current) => upsertSummary(current, toSummary(updatedChat)));
      setSendStatus("success");
    } catch (translationError) {
      setText((current) => current || submittedText);
      setSendStatus("error");
      setError(translationError instanceof Error ? translationError.message : t("common.translationFailed"));
    } finally {
      setPendingTurn(null);
    }
  }

  async function clearActiveChat() {
    if (!activeChat) {
      return;
    }

    setLoadStatus("loading");
    setError("");

    try {
      const chat = await clearChat(activeChat.id);
      setActiveChat(chat);
      setChats((current) => upsertSummary(current, toSummary(chat)));
      setLoadStatus("success");
    } catch (clearError) {
      setLoadStatus("error");
      setError(clearError instanceof Error ? clearError.message : t("translator.chatClearFailed"));
    }
  }

  async function removeActiveChat() {
    if (!activeChat) {
      return;
    }

    const removedId = activeChat.id;
    setLoadStatus("loading");
    setError("");

    try {
      await deleteChat(removedId);
      const remaining = chats.filter((chat) => chat.id !== removedId);
      setChats(remaining);

      if (remaining[0]) {
        const nextChat = await getChat(remaining[0].id);
        setActiveChat(nextChat);
        setSourceLang(nextChat.sourceLang);
        setTargetLang(nextChat.targetLang);
      } else {
        setActiveChat(null);
      }

      setLoadStatus("success");
    } catch (deleteError) {
      setLoadStatus("error");
      setError(deleteError instanceof Error ? deleteError.message : t("translator.chatDeleteFailed"));
    }
  }

  async function commitChatTitle() {
    if (!activeChat) {
      return;
    }

    const nextTitle = titleDraft.trim();

    if (!nextTitle || nextTitle === activeChat.title) {
      setTitleDraft(activeChat.title);
      return;
    }

    try {
      const chat = await renameChat(activeChat.id, nextTitle);
      setActiveChat(chat);
      setChats((current) => upsertSummary(current, toSummary(chat)));
    } catch (renameError) {
      setTitleDraft(activeChat.title);
      setError(renameError instanceof Error ? renameError.message : t("translator.chatRenameFailed"));
    } finally {
      setEditingTitle(false);
    }
  }

  function swapLanguages() {
    const nextSource = targetLang;
    const nextTarget =
      sourceLang !== autoDetectLanguage.code ? sourceLang : latestResult?.detectedSourceLanguage ?? languages[0].code;

    setSourceLang(nextSource);
    setTargetLang(nextTarget === nextSource ? languages.find((language) => language.code !== nextSource)?.code ?? "en" : nextTarget);
  }

  async function copyTranslation(option: TranslationOption, key: string) {
    await navigator.clipboard.writeText(option.text);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1200);
  }

  function toggleDictation() {
    unlockAudio();

    if (speechInput.status === "listening") {
      speechInput.stop();
      return;
    }

    if (speechInput.status !== "idle") {
      return;
    }

    dictationBase.current = text;
    setError("");
    speechInput.start(
      sourceLang,
      { continuous: true },
      {
        onInterim: (transcript) => setText(joinDictation(dictationBase.current, transcript)),
        onFinal: (transcript) => {
          const combined = joinDictation(dictationBase.current, transcript);
          dictationBase.current = combined;
          setText(combined);
        },
        onError: (speechError) => setError(speechErrorMessage(t, speechError)),
      },
    );
  }

  function speakTranslation(option: TranslationOption, key: string, lang: string) {
    unlockAudio();
    void speechOutput.speak(key, option.text, lang);
  }

  async function handleVoiceUtterance(utterance: string, fromLang: string, toLang: string): Promise<TranslationResponse> {
    const chat = activeChat ?? (await createChat(fromLang, toLang));

    if (!activeChat) {
      setChats((current) => [toSummary(chat), ...current]);
      setActiveChat(chat);
    }

    const updatedChat = await addChatTurn(chat.id, utterance, fromLang, toLang);
    setActiveChat(updatedChat);
    setChats((current) => upsertSummary(current, toSummary(updatedChat)));

    const lastTurn = updatedChat.turns.at(-1);

    if (!lastTurn) {
      throw new Error(t("common.translationFailed"));
    }

    return lastTurn.result;
  }

  return (
    <main className="app-shell">
      <section className="chat-workspace with-sidebar" aria-label={t("translator.translationChats")}>
        {sidebarOpen ? (
          <div className="sidebar-backdrop" aria-hidden="true" onClick={() => setSidebarOpen(false)} />
        ) : null}
        <aside className={sidebarOpen ? "chat-sidebar open" : "chat-sidebar"} aria-label={t("translator.chats")}>
          <div className="sidebar-header">
            <div className="brand">
              <BrandSeal />
              <strong>Translatarr</strong>
            </div>
            <div className="sidebar-header-actions">
              <button type="button" className="send-button" onClick={createNewChat}>
                {t("translator.new")}
              </button>
            </div>
          </div>

          <div className="chat-list">
            {chats.length ? (
              chats.map((chat) => (
                <button
                  type="button"
                  key={chat.id}
                  className={chat.id === activeChat?.id ? "chat-list-item active" : "chat-list-item"}
                  onClick={() => void selectChat(chat.id)}
                >
                  <span>{chat.title}</span>
                  <small>
                    {t("translator.languagePair", {
                      source: languageLabel(chat.sourceLang),
                      target: languageLabel(chat.targetLang),
                    })}
                  </small>
                </button>
              ))
            ) : (
              <div className="sidebar-empty">{t("translator.noChats")}</div>
            )}
          </div>

          <div className="sidebar-footer">
            <div className="user-chip">
              <strong>{user.username}</strong>
              <small>{t(user.role === "admin" ? "users.badgeAdmin" : "users.badgeUser")}</small>
            </div>
            <div className="sidebar-footer-actions">
              <button type="button" className="ghost-button" onClick={() => setSettingsOpen(true)}>
                {t("common.settings")}
              </button>
              <button type="button" className="ghost-button" onClick={onLogout}>
                {t("translator.logOut")}
              </button>
            </div>
          </div>
        </aside>

        <div className="chat-main">
          <header className="control-bar">
            <div className="bar-top">
              <button
                type="button"
                className="ghost-button menu-button"
                aria-label={t("translator.openChats")}
                aria-expanded={sidebarOpen}
                onClick={() => setSidebarOpen(true)}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                  <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
              {activeChat ? (
                <div className="chat-title-row">
                  {editingTitle ? (
                    <input
                      className="chat-title-input"
                      value={titleDraft}
                      maxLength={80}
                      autoFocus
                      aria-label={t("translator.chatTitle")}
                      placeholder={t("translator.chatTitle")}
                      onChange={(event) => setTitleDraft(event.target.value)}
                      onBlur={() => {
                        if (cancelTitleEdit.current) {
                          cancelTitleEdit.current = false;
                          return;
                        }
                        void commitChatTitle();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          event.currentTarget.blur();
                        } else if (event.key === "Escape") {
                          cancelTitleEdit.current = true;
                          setTitleDraft(activeChat.title);
                          setEditingTitle(false);
                        }
                      }}
                    />
                  ) : (
                    <>
                      <span className="chat-title">{activeChat.title}</span>
                      <button
                        type="button"
                        className="ghost-button rename-button"
                        onClick={() => {
                          setTitleDraft(activeChat.title);
                          setEditingTitle(true);
                        }}
                      >
                        {t("common.rename")}
                      </button>
                    </>
                  )}
                </div>
              ) : null}
            </div>

            <div className="language-controls">
              <label>
                <span>{t("translator.from")}</span>
                <select value={sourceLang} onChange={(event) => setSourceLang(event.target.value)}>
                  <option value={autoDetectLanguage.code}>{languageLabel(autoDetectLanguage.code)}</option>
                  {languages.map((language) => (
                    <option key={language.code} value={language.code}>
                      {languageLabel(language.code)}
                    </option>
                  ))}
                </select>
              </label>

              <button type="button" className="swap-button" onClick={swapLanguages} aria-label={t("translator.swapLanguages")}>
                {t("common.swap")}
              </button>

              <label>
                <span>{t("translator.to")}</span>
                <select value={targetLang} onChange={(event) => setTargetLang(event.target.value)}>
                  {languages.map((language) => (
                    <option key={language.code} value={language.code}>
                      {languageLabel(language.code)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="bar-actions">
              <span className="badge">{detectedLabel}</span>
              <label className="toggle">
                <input type="checkbox" checked={livePreview} onChange={(event) => setLivePreview(event.target.checked)} />
                <span>{t("translator.livePreview")}</span>
              </label>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  unlockAudio();
                  setVoiceModeOpen(true);
                }}
                disabled={!speechConfig}
              >
                {t("translator.voice")}
              </button>
              <button type="button" className="ghost-button" onClick={clearActiveChat} disabled={!activeChat?.turns.length}>
                {t("common.clear")}
              </button>
              <button type="button" className="ghost-button danger-button" onClick={removeActiveChat} disabled={!activeChat}>
                {t("common.delete")}
              </button>
            </div>
          </header>

          <div className="timeline" ref={timelineRef}>
            {loadStatus === "loading" && !activeChat ? (
              <div className="conversation-empty">{t("translator.loadingChats")}</div>
            ) : null}

            {loadStatus !== "loading" && !activeChat && !previewResult && !pendingTurn ? (
              <div className="conversation-empty">{t("translator.emptyNoChat")}</div>
            ) : null}

            {activeChat?.turns.length === 0 && !previewResult && previewStatus !== "loading" && !pendingTurn ? (
              <div className="conversation-empty">{t("translator.emptyChat")}</div>
            ) : null}

            {activeChat?.turns.map((entry) => (
              <ConversationTurn
                key={entry.id}
                entry={entry}
                copiedKey={copiedKey}
                onCopy={copyTranslation}
                speakingKey={speechOutput.speakingId}
                onSpeak={speechOutput.available ? speakTranslation : null}
              />
            ))}

            {pendingTurn ? (
              <section className="conversation-turn">
                <div className="user-message">
                  <span className="message-meta">
                    {t("translator.languagePair", {
                      source: languageLabel(pendingTurn.sourceLang),
                      target: languageLabel(pendingTurn.targetLang),
                    })}
                  </span>
                  <p>{pendingTurn.text}</p>
                </div>
                <div className="assistant-message pending" role="status" aria-label={t("common.sending")}>
                  <span className="typing-dot" />
                </div>
              </section>
            ) : null}

            {previewStatus === "loading" ? (
              <div className="assistant-message pending">
                <span className="typing-dot" />
                <span>{t("translator.previewing")}</span>
              </div>
            ) : null}

            {previewResult ? (
              <section className="preview-turn" aria-label={t("translator.livePreviewAria")}>
                <div className="user-message draft">
                  <span className="message-meta">{t("translator.draft")}</span>
                  <p>{trimmedText}</p>
                </div>
                <TranslationCard
                  result={previewResult}
                  title={t("translator.livePreviewTitle")}
                  copyScope="preview"
                  copiedKey={copiedKey}
                  onCopy={copyTranslation}
                  targetLang={targetLang}
                  speakingKey={speechOutput.speakingId}
                  onSpeak={speechOutput.available ? speakTranslation : null}
                />
              </section>
            ) : null}
          </div>

          <footer className="composer-shell">
            {error ? <div className="composer-error">{error}</div> : null}
            <div className="composer">
              <div className="composer-bubble">
                <textarea
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage();
                    }
                  }}
                  placeholder={t("translator.composerPlaceholder")}
                  aria-label={t("translator.sourceText")}
                  spellCheck="true"
                  rows={3}
                />
                <button
                  type="button"
                  className="send-button send-fab"
                  onClick={sendMessage}
                  disabled={!canSend}
                  aria-label={sendStatus === "loading" ? t("common.sending") : t("common.send")}
                  title={t("common.send")}
                >
                  {sendStatus === "loading" ? (
                    "…"
                  ) : (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 19V5" />
                      <path d="M5 12l7-7 7 7" />
                    </svg>
                  )}
                </button>
              </div>
              <div className="composer-actions">
                <span className={isTooLong ? "counter over" : "counter"}>
                  {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
                </span>
                <button
                  type="button"
                  className={speechInput.status === "listening" ? "ghost-button mic-button recording" : "ghost-button mic-button"}
                  onClick={toggleDictation}
                  disabled={!speechInput.available || speechInput.status === "transcribing"}
                  title={speechInput.available ? t("translator.dictate") : t("speech.unavailableReason")}
                  aria-pressed={speechInput.status === "listening"}
                >
                  {speechInput.status === "listening"
                    ? t("common.stop")
                    : speechInput.status === "transcribing"
                      ? "..."
                      : t("translator.mic")}
                </button>
                <button type="button" className="ghost-button" onClick={() => setText("")} disabled={!text}>
                  {t("common.clear")}
                </button>
              </div>
            </div>
          </footer>
        </div>
      </section>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} isAdmin={user.role === "admin"} />

      {voiceModeOpen && speechConfig ? (
        <VoiceMode
          turns={activeChat?.turns ?? []}
          sourceLang={sourceLang}
          targetLang={targetLang}
          speech={speechConfig}
          onUtterance={handleVoiceUtterance}
          onSwap={swapLanguages}
          onClose={() => setVoiceModeOpen(false)}
        />
      ) : null}
    </main>
  );
}

function joinDictation(base: string, transcript: string) {
  if (!transcript) {
    return base;
  }

  const trimmedBase = base.replace(/\s+$/, "");
  return trimmedBase ? `${trimmedBase} ${transcript}` : transcript;
}

type ClientSettings = {
  speech: SpeechEffectiveView;
  locale: Locale | null;
};

async function loadClientSettings(): Promise<ClientSettings | null> {
  try {
    const response = await fetch("/api/settings");
    const payload = (await response.json()) as SettingsPayload & { error?: string };

    if (!response.ok || !payload.settings) {
      return null;
    }

    return { speech: payload.settings.speech.effective, locale: payload.settings.locale };
  } catch {
    return null;
  }
}

function ConversationTurn({
  entry,
  copiedKey,
  onCopy,
  speakingKey,
  onSpeak,
}: {
  entry: ChatTurn;
  copiedKey: string | null;
  onCopy: (option: TranslationOption, key: string) => void;
  speakingKey: string | null;
  onSpeak: ((option: TranslationOption, key: string, lang: string) => void) | null;
}) {
  const { t, languageLabel } = useI18n();

  return (
    <section className="conversation-turn">
      <div className="user-message">
        <span className="message-meta">
          {t("translator.languagePair", {
            source: languageLabel(entry.sourceLang),
            target: languageLabel(entry.targetLang),
          })}
        </span>
        <p>{entry.text}</p>
      </div>
      <TranslationCard
        result={entry.result}
        title={t("translator.translation")}
        copyScope={entry.id}
        copiedKey={copiedKey}
        onCopy={onCopy}
        targetLang={entry.targetLang}
        speakingKey={speakingKey}
        onSpeak={onSpeak}
      />
    </section>
  );
}

function TranslationCard({
  result,
  title,
  copyScope,
  copiedKey,
  onCopy,
  targetLang,
  speakingKey,
  onSpeak,
}: {
  result: TranslationResponse;
  title: string;
  copyScope: string;
  copiedKey: string | null;
  onCopy: (option: TranslationOption, key: string) => void;
  targetLang: string;
  speakingKey: string | null;
  onSpeak: ((option: TranslationOption, key: string, lang: string) => void) | null;
}) {
  const { t, languageLabel } = useI18n();
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [result]);

  const selectedKeyWords = result.translations[selectedIndex]?.keyWords ?? [];
  const keyWords = selectedKeyWords.length ? selectedKeyWords : result.keyWords;

  return (
    <article className="assistant-card">
      <div className="result-toolbar">
        <strong>{title}</strong>
        <span className="badge">
          {languageLabel(result.detectedSourceLanguage)} - {Math.round(result.confidence * 100)}%
        </span>
      </div>

      <div className="options" aria-label={t("translator.translationOptions")}>
        {result.translations.map((option, index) => {
          const copyKey = `${copyScope}-${index}`;

          if (index !== selectedIndex) {
            return (
              <button
                key={`${option.text}-${index}`}
                type="button"
                className="option-row"
                onClick={() => setSelectedIndex(index)}
              >
                <span className="option-row-text">{option.text}</span>
                {option.register ? <span className="register">{option.register}</span> : null}
                {option.tone && option.tone !== "neutral" ? <span className="register tone">{option.tone}</span> : null}
              </button>
            );
          }

          return (
            <article key={`${option.text}-${index}`} className="option-featured">
              <div className="option-featured-body">
                <p className="featured-text">{option.text}</p>
                {option.romanization ? <span className="romanization">{option.romanization}</span> : null}
                <span className="source-equivalent">({option.sourceEquivalent})</span>
                {option.register ? <span className="register">{option.register}</span> : null}
                {option.tone && option.tone !== "neutral" ? <span className="register tone">{option.tone}</span> : null}
              </div>
              <div className="option-actions">
                <button type="button" className="copy-button" onClick={() => onCopy(option, copyKey)}>
                  {copiedKey === copyKey ? t("common.copied") : t("common.copy")}
                </button>
                {onSpeak ? (
                  <button
                    type="button"
                    className={speakingKey === copyKey ? "copy-button speak-button speaking" : "copy-button speak-button"}
                    onClick={() => onSpeak(option, copyKey, targetLang)}
                  >
                    {speakingKey === copyKey ? t("common.stop") : t("common.speak")}
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {keyWords.length ? (
        <details className="keywords">
          <summary>{t("translator.keyWords", { count: keyWords.length })}</summary>
          <div className="keyword-list">
            {keyWords.map((word, index) => (
              <div className="keyword-row" key={`${word.source}-${word.target}-${index}`}>
                <span>{word.source}</span>
                <strong>{word.target}</strong>
                {word.romanization ? <em>{word.romanization}</em> : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </article>
  );
}

function toSummary(chat: ChatDetail): ChatSummary {
  return {
    id: chat.id,
    title: chat.title,
    sourceLang: chat.sourceLang,
    targetLang: chat.targetLang,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
  };
}

function upsertSummary(chats: ChatSummary[], summary: ChatSummary) {
  return [summary, ...chats.filter((chat) => chat.id !== summary.id)].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

async function listChats() {
  const response = await fetch("/api/chats");
  const payload = (await response.json()) as { chats?: ChatSummary[]; error?: string };

  if (!response.ok || !payload.chats) {
    throw new Error(payload.error ?? "Could not load chats.");
  }

  return payload.chats;
}

async function createChat(sourceLang: string, targetLang: string) {
  const response = await fetch("/api/chats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceLang, targetLang }),
  });
  const payload = (await response.json()) as { chat?: ChatDetail; error?: string };

  if (!response.ok || !payload.chat) {
    throw new Error(payload.error ?? "Could not create chat.");
  }

  return payload.chat;
}

async function getChat(chatId: string) {
  const response = await fetch(`/api/chats/${chatId}`);
  const payload = (await response.json()) as { chat?: ChatDetail; error?: string };

  if (!response.ok || !payload.chat) {
    throw new Error(payload.error ?? "Could not load chat.");
  }

  return payload.chat;
}

async function renameChat(chatId: string, title: string) {
  const response = await fetch(`/api/chats/${chatId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "rename", title }),
  });
  const payload = (await response.json()) as { chat?: ChatDetail; error?: string };

  if (!response.ok || !payload.chat) {
    throw new Error(payload.error ?? "Could not rename chat.");
  }

  return payload.chat;
}

async function clearChat(chatId: string) {
  const response = await fetch(`/api/chats/${chatId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "clear" }),
  });
  const payload = (await response.json()) as { chat?: ChatDetail; error?: string };

  if (!response.ok || !payload.chat) {
    throw new Error(payload.error ?? "Could not clear chat.");
  }

  return payload.chat;
}

async function deleteChat(chatId: string) {
  const response = await fetch(`/api/chats/${chatId}`, { method: "DELETE" });
  const payload = (await response.json()) as { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Could not delete chat.");
  }
}

async function addChatTurn(
  chatId: string,
  text: string,
  sourceLang: string,
  targetLang: string,
  precomputedResult: TranslationResponse | null = null,
) {
  const response = await fetch(`/api/chats/${chatId}/turns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, sourceLang, targetLang, ...(precomputedResult ? { result: precomputedResult } : {}) }),
  });

  const payload = (await response.json()) as { chat?: ChatDetail; error?: string };

  if (!response.ok || !payload.chat) {
    throw new Error(payload.error ?? "Translation failed.");
  }

  return payload.chat;
}

async function requestTranslation(text: string, sourceLang: string, targetLang: string, signal?: AbortSignal) {
  const response = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, sourceLang, targetLang }),
    signal,
  });

  const payload = (await response.json()) as TranslationResponse | { error?: string };

  if (!response.ok) {
    throw new Error("error" in payload && payload.error ? payload.error : "Translation failed.");
  }

  return payload as TranslationResponse;
}
