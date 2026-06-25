"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { ApiKey } from "../lib/api-key-store";
import { useI18n } from "../lib/i18n/i18n-context";

type CreatedKey = { apiKey: ApiKey; token: string };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
}

function isExpired(key: ApiKey): boolean {
  return key.expiresAt !== null && key.expiresAt < new Date().toISOString();
}

export function ApiKeysManager() {
  const { t } = useI18n();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [created, setCreated] = useState<CreatedKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadKeys();
  }, []);

  async function loadKeys() {
    try {
      const response = await fetch("/api/keys");
      const payload = (await response.json()) as { keys?: ApiKey[]; error?: string };

      if (!response.ok || !payload.keys) {
        throw new Error(payload.error ?? t("apiKeys.loadFailed"));
      }

      setKeys(payload.keys);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("apiKeys.loadFailed"));
    }
  }

  async function addKey(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setCreated(null);
    setCopied(false);

    try {
      const expiresAt = expiry ? new Date(`${expiry}T23:59:59`).toISOString() : null;
      const response = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, expiresAt }),
      });
      const payload = (await response.json()) as { apiKey?: ApiKey; token?: string; error?: string };

      if (!response.ok || !payload.apiKey || !payload.token) {
        throw new Error(payload.error ?? t("apiKeys.createFailed"));
      }

      setCreated({ apiKey: payload.apiKey, token: payload.token });
      setName("");
      setExpiry("");
      await loadKeys();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t("apiKeys.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function revokeKey(keyId: string) {
    setBusy(true);
    setError("");

    try {
      const response = await fetch(`/api/keys/${keyId}`, { method: "DELETE" });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? t("apiKeys.revokeFailed"));
      }

      if (created?.apiKey.id === keyId) {
        setCreated(null);
      }

      await loadKeys();
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : t("apiKeys.revokeFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function copyToken() {
    if (!created) {
      return;
    }

    await navigator.clipboard.writeText(created.token);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="settings-body">
      <p className="field-hint">{t("apiKeys.description")}</p>

      {created ? (
        <div className="api-key-new">
          <strong>{t("apiKeys.newKeyTitle")}</strong>
          <code className="api-key-token">{created.token}</code>
          <div className="api-key-new-actions">
            <button type="button" className="ghost-button" onClick={() => void copyToken()}>
              {copied ? t("common.copied") : t("common.copy")}
            </button>
            <span className="field-hint">{t("apiKeys.newKeyWarning")}</span>
          </div>
        </div>
      ) : null}

      <div className="user-list">
        {keys.length === 0 ? <p className="subtle">{t("apiKeys.none")}</p> : null}
        {keys.map((key) => (
          <div className="api-key-row" key={key.id}>
            <div className="api-key-info">
              <strong>{key.name}</strong>
              <code className="api-key-prefix">{key.prefix}…</code>
              <span className="api-key-meta">
                {t("apiKeys.created", { date: formatDate(key.createdAt) })}
                {" · "}
                {key.lastUsedAt ? t("apiKeys.lastUsed", { date: formatDate(key.lastUsedAt) }) : t("apiKeys.neverUsed")}
                {" · "}
                {key.expiresAt
                  ? isExpired(key)
                    ? t("apiKeys.expired")
                    : t("apiKeys.expiresOn", { date: formatDate(key.expiresAt) })
                  : t("apiKeys.neverExpires")}
              </span>
            </div>
            <button
              type="button"
              className="ghost-button danger-button"
              disabled={busy}
              onClick={() => {
                if (window.confirm(t("apiKeys.confirmRevoke", { name: key.name }))) {
                  void revokeKey(key.id);
                }
              }}
            >
              {t("apiKeys.revoke")}
            </button>
          </div>
        ))}
      </div>

      <form className="user-add-form" onSubmit={addKey}>
        <div className="user-add-fields api-key-fields">
          <label className="settings-field">
            <span>{t("apiKeys.name")}</span>
            <input
              type="text"
              value={name}
              autoComplete="off"
              placeholder={t("apiKeys.namePlaceholder")}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="settings-field">
            <span>{t("apiKeys.expiry")}</span>
            <input type="date" value={expiry} onChange={(event) => setExpiry(event.target.value)} />
            <small className="field-hint">{t("apiKeys.expiryHint")}</small>
          </label>
        </div>
        <button type="submit" className="ghost-button" disabled={busy || !name.trim()}>
          {t("apiKeys.create")}
        </button>
      </form>

      {error ? <p className="composer-error">{error}</p> : null}
    </div>
  );
}
