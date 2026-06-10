"use client";

import { useEffect, useState } from "react";
import type { LLMProvider, SettingsPayload } from "../lib/settings-types";
import { UserAdmin } from "./user-admin";

type RequestState = "idle" | "loading" | "error" | "success";

type UserPrefsForm = {
  model: string;
  systemPrompt: string;
};

type InstanceForm = {
  provider: "" | LLMProvider;
  model: string;
  baseUrl: string;
  apiKey: string;
  systemPrompt: string;
};

const emptyUserPrefs: UserPrefsForm = { model: "", systemPrompt: "" };
const emptyInstance: InstanceForm = { provider: "", model: "", baseUrl: "", apiKey: "", systemPrompt: "" };

export function SettingsDialog({
  open,
  onClose,
  isAdmin,
}: {
  open: boolean;
  onClose: () => void;
  isAdmin: boolean;
}) {
  const [payload, setPayload] = useState<SettingsPayload | null>(null);
  const [userPrefs, setUserPrefs] = useState<UserPrefsForm>(emptyUserPrefs);
  const [instance, setInstance] = useState<InstanceForm>(emptyInstance);
  const [clearApiKey, setClearApiKey] = useState(false);
  const [loadStatus, setLoadStatus] = useState<RequestState>("idle");
  const [saveStatus, setSaveStatus] = useState<RequestState>("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    setSaveStatus("idle");
    setClearApiKey(false);
    setError("");
    void loadSettings();
  }, [open]);

  async function loadSettings() {
    setLoadStatus("loading");

    try {
      const fetched = await fetchPayload(await fetch("/api/settings"));
      applyPayload(fetched);
      setLoadStatus("success");
    } catch (loadError) {
      setLoadStatus("error");
      setError(loadError instanceof Error ? loadError.message : "Could not load settings.");
    }
  }

  function applyPayload(fetched: SettingsPayload) {
    setPayload(fetched);
    setUserPrefs({
      model: fetched.settings.user.model ?? "",
      systemPrompt: fetched.settings.user.systemPrompt ?? "",
    });
    setInstance({
      provider: fetched.settings.instance?.provider ?? "",
      model: fetched.settings.instance?.model ?? "",
      baseUrl: fetched.settings.instance?.baseUrl ?? "",
      apiKey: "",
      systemPrompt: fetched.settings.instance?.systemPrompt ?? "",
    });
  }

  async function saveSettings() {
    setSaveStatus("loading");
    setError("");

    try {
      let updated = await fetchPayload(
        await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: userPrefs.model.trim() || null,
            systemPrompt: userPrefs.systemPrompt.trim() || null,
          }),
        }),
      );

      if (isAdmin) {
        const apiKeyPatch = clearApiKey
          ? { apiKey: null }
          : instance.apiKey.trim()
            ? { apiKey: instance.apiKey.trim() }
            : {};

        updated = await fetchPayload(
          await fetch("/api/settings/instance", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider: instance.provider || null,
              model: instance.model.trim() || null,
              baseUrl: instance.baseUrl.trim() || null,
              systemPrompt: instance.systemPrompt.trim() || null,
              ...apiKeyPatch,
            }),
          }),
        );
      }

      applyPayload(updated);
      setClearApiKey(false);
      setSaveStatus("success");
    } catch (saveError) {
      setSaveStatus("error");
      setError(saveError instanceof Error ? saveError.message : "Could not save settings.");
    }
  }

  async function resetUserPrefs() {
    setSaveStatus("loading");
    setError("");

    try {
      const updated = await fetchPayload(
        await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: null, systemPrompt: null }),
        }),
      );

      applyPayload(updated);
      setSaveStatus("success");
    } catch (resetError) {
      setSaveStatus("error");
      setError(resetError instanceof Error ? resetError.message : "Could not reset settings.");
    }
  }

  if (!open) {
    return null;
  }

  const settings = payload?.settings ?? null;

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="settings-header">
          <strong>Settings</strong>
          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </header>

        {loadStatus === "loading" ? <p className="subtle">Loading settings...</p> : null}

        {settings && loadStatus === "success" ? (
          <>
            <section className="settings-section">
              <h3>Your preferences</h3>
              <div className="settings-body">
                <label className="settings-field">
                  <span>Model</span>
                  <input
                    type="text"
                    value={userPrefs.model}
                    placeholder={settings.effective.model}
                    onChange={(event) => setUserPrefs({ ...userPrefs, model: event.target.value })}
                  />
                  <small className="field-hint">Leave blank to use the instance default.</small>
                </label>

                <label className="settings-field">
                  <span>System prompt</span>
                  <textarea
                    value={userPrefs.systemPrompt}
                    placeholder={payload?.defaultSystemPrompt}
                    rows={6}
                    onChange={(event) => setUserPrefs({ ...userPrefs, systemPrompt: event.target.value })}
                  />
                  <small className="field-hint">
                    Leave blank to use the instance default. Use {"{{source}}"} and {"{{target}}"} as language
                    placeholders. JSON output-format instructions are appended automatically.
                  </small>
                </label>
              </div>
            </section>

            {isAdmin && settings.instance ? (
              <>
                <section className="settings-section">
                  <h3>Instance settings (admin)</h3>
                  <div className="settings-body">
                    <label className="settings-field">
                      <span>Provider</span>
                      <select
                        value={instance.provider}
                        onChange={(event) =>
                          setInstance({ ...instance, provider: event.target.value as InstanceForm["provider"] })
                        }
                      >
                        <option value="">Default ({settings.effective.provider})</option>
                        <option value="openai-compatible">OpenAI-compatible</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="custom">Custom (not yet implemented)</option>
                      </select>
                    </label>

                    <label className="settings-field">
                      <span>Default model</span>
                      <input
                        type="text"
                        value={instance.model}
                        placeholder={settings.effective.model}
                        onChange={(event) => setInstance({ ...instance, model: event.target.value })}
                      />
                      <small className="field-hint">Users can override this with their own model preference.</small>
                    </label>

                    <label className="settings-field">
                      <span>Base URL</span>
                      <input
                        type="text"
                        value={instance.baseUrl}
                        placeholder={settings.effective.baseUrl}
                        onChange={(event) => setInstance({ ...instance, baseUrl: event.target.value })}
                      />
                      <small className="field-hint">
                        API root only, e.g. https://openrouter.ai/api/v1 — endpoint paths like /chat/completions are
                        added automatically.
                      </small>
                    </label>

                    <label className="settings-field">
                      <span>API key</span>
                      <input
                        type="password"
                        value={instance.apiKey}
                        placeholder={
                          settings.effective.hasApiKey ? "Leave blank to keep the current key" : "Enter an API key"
                        }
                        autoComplete="off"
                        disabled={clearApiKey}
                        onChange={(event) => setInstance({ ...instance, apiKey: event.target.value })}
                      />
                      <small className="field-hint">
                        {settings.instance.hasStoredApiKey
                          ? "A key is stored in instance settings."
                          : settings.effective.hasApiKey
                            ? "Using the key from the LLM_API_KEY environment variable."
                            : "No API key configured. Translations will fail until one is set."}
                      </small>
                      {settings.instance.hasStoredApiKey ? (
                        <label className="toggle">
                          <input
                            type="checkbox"
                            checked={clearApiKey}
                            onChange={(event) => setClearApiKey(event.target.checked)}
                          />
                          <span>Remove stored key on save</span>
                        </label>
                      ) : null}
                    </label>

                    <label className="settings-field">
                      <span>Default system prompt</span>
                      <textarea
                        value={instance.systemPrompt}
                        placeholder={payload?.defaultSystemPrompt}
                        rows={5}
                        onChange={(event) => setInstance({ ...instance, systemPrompt: event.target.value })}
                      />
                      <small className="field-hint">Instance-wide default; users can override it for themselves.</small>
                    </label>
                  </div>
                </section>

                <section className="settings-section">
                  <h3>Users (admin)</h3>
                  <UserAdmin />
                </section>
              </>
            ) : null}
          </>
        ) : null}

        {error ? <p className="composer-error">{error}</p> : null}
        {saveStatus === "success" && !error ? <p className="settings-saved">Settings saved.</p> : null}

        <footer className="settings-actions">
          <button
            type="button"
            className="ghost-button danger-button"
            onClick={resetUserPrefs}
            disabled={saveStatus === "loading" || loadStatus !== "success"}
          >
            Reset my preferences
          </button>
          <div className="settings-actions-right">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="send-button"
              onClick={saveSettings}
              disabled={saveStatus === "loading" || loadStatus !== "success"}
            >
              {saveStatus === "loading" ? "Saving..." : "Save"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

async function fetchPayload(response: Response): Promise<SettingsPayload> {
  const payload = (await response.json()) as SettingsPayload & { error?: string };

  if (!response.ok || !payload.settings) {
    throw new Error(payload.error ?? "Settings request failed.");
  }

  return payload;
}
