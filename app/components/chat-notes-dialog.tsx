"use client";

import { useEffect, useState } from "react";
import { MAX_CHAT_NOTES_CHARS } from "../lib/chat-types";
import { useI18n } from "../lib/i18n/i18n-context";

/**
 * Editor for a chat's persistent background notes (see `translation-service.ts`'s
 * `notesClause`). Saving an empty draft clears the notes, matching how
 * `updateChatNotes` in `chat-store.ts` treats a blank string.
 */
export function ChatNotesDialog({
  open,
  notes,
  onClose,
  onSave,
}: {
  open: boolean;
  notes: string | null;
  onClose: () => void;
  onSave: (notes: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setDraft(notes ?? "");
      setError("");
    }
  }, [open, notes]);

  if (!open) {
    return null;
  }

  async function handleSave() {
    setSaving(true);
    setError("");

    try {
      await onSave(draft.trim());
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("translator.chatNotesSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="settings-dialog chat-notes-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("translator.chatNotesTitle")}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="settings-header">
          <strong>{t("translator.chatNotesTitle")}</strong>
          <button type="button" className="ghost-button" onClick={onClose}>
            {t("common.close")}
          </button>
        </header>

        <div className="settings-body">
          <label className="settings-field">
            <textarea
              value={draft}
              maxLength={MAX_CHAT_NOTES_CHARS}
              rows={6}
              autoFocus
              placeholder={t("translator.chatNotesPlaceholder")}
              onChange={(event) => setDraft(event.target.value)}
            />
            <small className="field-hint">{t("translator.chatNotesHint")}</small>
          </label>
        </div>

        {error ? <p className="composer-error">{error}</p> : null}

        <footer className="settings-actions-right">
          <button type="button" className="ghost-button" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </button>
          <button type="button" className="send-button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </button>
        </footer>
      </div>
    </div>
  );
}
