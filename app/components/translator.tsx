"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatDetail, ChatSummary, ChatTurn } from "../lib/chat-types";
import { autoDetectLanguage, languageName, languages } from "../lib/languages";
import type { TranslationOption, TranslationResponse } from "../lib/translation-schema";
import type { User } from "../lib/user-store";
import { BrandSeal } from "./brand-seal";
import { SettingsDialog } from "./settings-dialog";

const MAX_CHARS = 12000;
const DEBOUNCE_MS = 1500;

type RequestState = "idle" | "loading" | "error" | "success";

export function Translator({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [text, setText] = useState("");
  const [sourceLang, setSourceLang] = useState(autoDetectLanguage.code);
  const [targetLang, setTargetLang] = useState("es");
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChat, setActiveChat] = useState<ChatDetail | null>(null);
  const [livePreview, setLivePreview] = useState(false);
  const [previewResult, setPreviewResult] = useState<TranslationResponse | null>(null);
  const [previewStatus, setPreviewStatus] = useState<RequestState>("idle");
  const [sendStatus, setSendStatus] = useState<RequestState>("idle");
  const [loadStatus, setLoadStatus] = useState<RequestState>("loading");
  const [error, setError] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const cancelTitleEdit = useRef(false);
  const previewRequestId = useRef(0);
  const previewFor = useRef<{ text: string; sourceLang: string; targetLang: string } | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  const trimmedText = text.trim();
  const isTooLong = text.length > MAX_CHARS;
  const canSend = Boolean(trimmedText) && !isTooLong && sendStatus !== "loading";
  const latestResult = previewResult ?? activeChat?.turns.at(-1)?.result ?? null;

  useEffect(() => {
    void initializeChats();
  }, []);

  useEffect(() => {
    setTitleDraft(activeChat?.title ?? "");
    setEditingTitle(false);
  }, [activeChat?.id, activeChat?.title]);

  useEffect(() => {
    timelineRef.current?.scrollTo({
      top: timelineRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [activeChat?.turns.length, previewResult, activeChat?.id]);

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
      setError(`Keep the source text under ${MAX_CHARS.toLocaleString()} characters.`);
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
        setError(translationError instanceof Error ? translationError.message : "Translation failed.");
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [trimmedText, sourceLang, targetLang, livePreview, isTooLong]);

  const detectedLabel = useMemo(() => {
    if (!latestResult) {
      return "No detection yet";
    }

    return `${languageName(latestResult.detectedSourceLanguage)} - ${Math.round(latestResult.confidence * 100)}%`;
  }, [latestResult]);

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
      setError(loadError instanceof Error ? loadError.message : "Could not load chats.");
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
      setError(loadError instanceof Error ? loadError.message : "Could not load chat.");
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
      setError(createError instanceof Error ? createError.message : "Could not create chat.");
    }
  }

  async function sendMessage() {
    if (!canSend) {
      return;
    }

    const submittedText = trimmedText;
    setSendStatus("loading");
    setError("");

    try {
      const reusablePreview =
        previewResult &&
        previewFor.current?.text === submittedText &&
        previewFor.current.sourceLang === sourceLang &&
        previewFor.current.targetLang === targetLang
          ? previewResult
          : null;

      const chat = activeChat ?? (await createChat(sourceLang, targetLang));
      const updatedChat = await addChatTurn(chat.id, submittedText, sourceLang, targetLang, reusablePreview);

      setActiveChat(updatedChat);
      setChats((current) => upsertSummary(current, toSummary(updatedChat)));
      setText("");
      setPreviewResult(null);
      setPreviewStatus("idle");
      setSendStatus("success");
    } catch (translationError) {
      setSendStatus("error");
      setError(translationError instanceof Error ? translationError.message : "Translation failed.");
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
      setError(clearError instanceof Error ? clearError.message : "Could not clear chat.");
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
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete chat.");
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
      setError(renameError instanceof Error ? renameError.message : "Could not rename chat.");
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

  return (
    <main className="app-shell">
      <section className="chat-workspace with-sidebar" aria-label="Translation chats">
        {sidebarOpen ? (
          <div className="sidebar-backdrop" aria-hidden="true" onClick={() => setSidebarOpen(false)} />
        ) : null}
        <aside className={sidebarOpen ? "chat-sidebar open" : "chat-sidebar"} aria-label="Chats">
          <div className="sidebar-header">
            <div className="brand">
              <BrandSeal />
              <strong>Translatarr</strong>
            </div>
            <div className="sidebar-header-actions">
              <button type="button" className="send-button" onClick={createNewChat}>
                New
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
                    {languageName(chat.sourceLang)} to {languageName(chat.targetLang)}
                  </small>
                </button>
              ))
            ) : (
              <div className="sidebar-empty">No chats yet.</div>
            )}
          </div>

          <div className="sidebar-footer">
            <div className="user-chip">
              <strong>{user.username}</strong>
              <small>{user.role}</small>
            </div>
            <div className="sidebar-footer-actions">
              <button type="button" className="ghost-button" onClick={() => setSettingsOpen(true)}>
                Settings
              </button>
              <button type="button" className="ghost-button" onClick={onLogout}>
                Log out
              </button>
            </div>
          </div>
        </aside>

        <div className="chat-main">
          <header className="control-bar">
            <button
              type="button"
              className="ghost-button menu-button"
              aria-label="Open chats"
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
                    aria-label="Chat title"
                    placeholder="Chat title"
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
                      Rename
                    </button>
                  </>
                )}
              </div>
            ) : null}

            <div className="language-controls">
              <label>
                <span>From</span>
                <select value={sourceLang} onChange={(event) => setSourceLang(event.target.value)}>
                  <option value={autoDetectLanguage.code}>{autoDetectLanguage.name}</option>
                  {languages.map((language) => (
                    <option key={language.code} value={language.code}>
                      {language.name}
                    </option>
                  ))}
                </select>
              </label>

              <button type="button" className="swap-button" onClick={swapLanguages} aria-label="Swap languages">
                Swap
              </button>

              <label>
                <span>To</span>
                <select value={targetLang} onChange={(event) => setTargetLang(event.target.value)}>
                  {languages.map((language) => (
                    <option key={language.code} value={language.code}>
                      {language.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="bar-actions">
              <span className="badge">{detectedLabel}</span>
              <label className="toggle">
                <input type="checkbox" checked={livePreview} onChange={(event) => setLivePreview(event.target.checked)} />
                <span>Live preview</span>
              </label>
              <button type="button" className="ghost-button" onClick={clearActiveChat} disabled={!activeChat?.turns.length}>
                Clear
              </button>
              <button type="button" className="ghost-button danger-button" onClick={removeActiveChat} disabled={!activeChat}>
                Delete
              </button>
            </div>
          </header>

          <div className="timeline" ref={timelineRef}>
            {loadStatus === "loading" && !activeChat ? <div className="conversation-empty">Loading chats...</div> : null}

            {loadStatus !== "loading" && !activeChat && !previewResult ? (
              <div className="conversation-empty">Create a chat or send text to start one.</div>
            ) : null}

            {activeChat?.turns.length === 0 && !previewResult && previewStatus !== "loading" ? (
              <div className="conversation-empty">Send text to start this translation thread.</div>
            ) : null}

            {activeChat?.turns.map((entry) => (
              <ConversationTurn key={entry.id} entry={entry} copiedKey={copiedKey} onCopy={copyTranslation} />
            ))}

            {previewStatus === "loading" ? (
              <div className="assistant-message pending">
                <span className="typing-dot" />
                <span>Previewing translation...</span>
              </div>
            ) : null}

            {previewResult ? (
              <section className="preview-turn" aria-label="Live translation preview">
                <div className="user-message draft">
                  <span className="message-meta">Draft</span>
                  <p>{trimmedText}</p>
                </div>
                <TranslationCard
                  result={previewResult}
                  title="Live Preview"
                  copyScope="preview"
                  copiedKey={copiedKey}
                  onCopy={copyTranslation}
                />
              </section>
            ) : null}
          </div>

          <footer className="composer-shell">
            {error ? <div className="composer-error">{error}</div> : null}
            <div className="composer">
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder="Enter text, then press Enter to send"
                aria-label="Source text"
                spellCheck="true"
                rows={3}
              />
              <div className="composer-actions">
                <span className={isTooLong ? "counter over" : "counter"}>
                  {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
                </span>
                <button type="button" className="ghost-button" onClick={() => setText("")} disabled={!text}>
                  Clear
                </button>
                <button type="button" className="send-button" onClick={sendMessage} disabled={!canSend}>
                  {sendStatus === "loading" ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          </footer>
        </div>
      </section>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} isAdmin={user.role === "admin"} />
    </main>
  );
}

function ConversationTurn({
  entry,
  copiedKey,
  onCopy,
}: {
  entry: ChatTurn;
  copiedKey: string | null;
  onCopy: (option: TranslationOption, key: string) => void;
}) {
  return (
    <section className="conversation-turn">
      <div className="user-message">
        <span className="message-meta">
          {languageName(entry.sourceLang)} to {languageName(entry.targetLang)}
        </span>
        <p>{entry.text}</p>
      </div>
      <TranslationCard
        result={entry.result}
        title="Translation"
        copyScope={entry.id}
        copiedKey={copiedKey}
        onCopy={onCopy}
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
}: {
  result: TranslationResponse;
  title: string;
  copyScope: string;
  copiedKey: string | null;
  onCopy: (option: TranslationOption, key: string) => void;
}) {
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
          {languageName(result.detectedSourceLanguage)} - {Math.round(result.confidence * 100)}%
        </span>
      </div>

      <div className="options" aria-label="Translation options">
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
              </div>
              <button type="button" className="copy-button" onClick={() => onCopy(option, copyKey)}>
                {copiedKey === copyKey ? "Copied" : "Copy"}
              </button>
            </article>
          );
        })}
      </div>

      {keyWords.length ? (
        <details className="keywords">
          <summary>Key Words ({keyWords.length})</summary>
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
