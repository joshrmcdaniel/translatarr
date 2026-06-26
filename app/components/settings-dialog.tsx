"use client";

import { useEffect, useState } from "react";
import { useI18n } from "../lib/i18n/i18n-context";
import { localeNativeNames } from "../lib/i18n/language-names";
import { detectBrowserLocale, locales, type Locale } from "../lib/i18n/messages";
import type { LLMProvider, SettingsPayload, SpeechEngine } from "../lib/settings-types";
import { ApiKeysManager } from "./api-keys-manager";
import { UserAdmin } from "./user-admin";

type RequestState = "idle" | "loading" | "error" | "success";

type UserPrefsForm = {
  locale: "" | Locale;
  model: string;
  systemPrompt: string;
  speechEngine: "" | SpeechEngine;
};

type InstanceForm = {
  provider: "" | LLMProvider;
  model: string;
  baseUrl: string;
  apiKey: string;
  systemPrompt: string;
  speechEngine: "" | SpeechEngine;
  speechBaseUrl: string;
  speechApiKey: string;
  speechSttModel: string;
  speechTtsModel: string;
  speechTtsVoice: string;
};

const emptyUserPrefs: UserPrefsForm = { locale: "", model: "", systemPrompt: "", speechEngine: "" };
const emptyInstance: InstanceForm = {
  provider: "",
  model: "",
  baseUrl: "",
  apiKey: "",
  systemPrompt: "",
  speechEngine: "",
  speechBaseUrl: "",
  speechApiKey: "",
  speechSttModel: "",
  speechTtsModel: "",
  speechTtsVoice: "",
};

export function SettingsDialog({
  open,
  onClose,
  isAdmin,
  currentUserId,
}: {
  open: boolean;
  onClose: () => void;
  isAdmin: boolean;
  currentUserId: string;
}) {
  const { t, setLocale } = useI18n();
  const [payload, setPayload] = useState<SettingsPayload | null>(null);
  const [userPrefs, setUserPrefs] = useState<UserPrefsForm>(emptyUserPrefs);
  const [instance, setInstance] = useState<InstanceForm>(emptyInstance);
  const [clearApiKey, setClearApiKey] = useState(false);
  const [clearSpeechApiKey, setClearSpeechApiKey] = useState(false);
  const [loadStatus, setLoadStatus] = useState<RequestState>("idle");
  const [saveStatus, setSaveStatus] = useState<RequestState>("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    setSaveStatus("idle");
    setClearApiKey(false);
    setClearSpeechApiKey(false);
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
      setError(loadError instanceof Error ? loadError.message : t("settings.loadFailed"));
    }
  }

  function applyPayload(fetched: SettingsPayload) {
    setPayload(fetched);
    setUserPrefs({
      locale: fetched.settings.locale ?? "",
      model: fetched.settings.user.model ?? "",
      systemPrompt: fetched.settings.user.systemPrompt ?? "",
      speechEngine: fetched.settings.speech.user.engine ?? "",
    });
    setInstance({
      provider: fetched.settings.instance?.provider ?? "",
      model: fetched.settings.instance?.model ?? "",
      baseUrl: fetched.settings.instance?.baseUrl ?? "",
      apiKey: "",
      systemPrompt: fetched.settings.instance?.systemPrompt ?? "",
      speechEngine: fetched.settings.speech.instance?.engine ?? "",
      speechBaseUrl: fetched.settings.speech.instance?.baseUrl ?? "",
      speechApiKey: "",
      speechSttModel: fetched.settings.speech.instance?.sttModel ?? "",
      speechTtsModel: fetched.settings.speech.instance?.ttsModel ?? "",
      speechTtsVoice: fetched.settings.speech.instance?.ttsVoice ?? "",
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
            locale: userPrefs.locale || null,
            model: userPrefs.model.trim() || null,
            systemPrompt: userPrefs.systemPrompt.trim() || null,
            speechEngine: userPrefs.speechEngine || null,
          }),
        }),
      );

      if (isAdmin) {
        const apiKeyPatch = clearApiKey
          ? { apiKey: null }
          : instance.apiKey.trim()
            ? { apiKey: instance.apiKey.trim() }
            : {};
        const speechApiKeyPatch = clearSpeechApiKey
          ? { speechApiKey: null }
          : instance.speechApiKey.trim()
            ? { speechApiKey: instance.speechApiKey.trim() }
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
              speechEngine: instance.speechEngine || null,
              speechBaseUrl: instance.speechBaseUrl.trim() || null,
              speechSttModel: instance.speechSttModel.trim() || null,
              speechTtsModel: instance.speechTtsModel.trim() || null,
              speechTtsVoice: instance.speechTtsVoice.trim() || null,
              ...apiKeyPatch,
              ...speechApiKeyPatch,
            }),
          }),
        );
      }

      applyPayload(updated);
      setLocale(updated.settings.locale ?? detectBrowserLocale());
      setClearApiKey(false);
      setClearSpeechApiKey(false);
      setSaveStatus("success");
    } catch (saveError) {
      setSaveStatus("error");
      setError(saveError instanceof Error ? saveError.message : t("settings.saveFailed"));
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
          body: JSON.stringify({ locale: null, model: null, systemPrompt: null, speechEngine: null }),
        }),
      );

      applyPayload(updated);
      setLocale(detectBrowserLocale());
      setSaveStatus("success");
    } catch (resetError) {
      setSaveStatus("error");
      setError(resetError instanceof Error ? resetError.message : t("settings.resetFailed"));
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
          <strong>{t("common.settings")}</strong>
          <button type="button" className="ghost-button" onClick={onClose}>
            {t("common.close")}
          </button>
        </header>

        {loadStatus === "loading" ? <p className="subtle">{t("settings.loading")}</p> : null}

        {settings && loadStatus === "success" ? (
          <>
            <section className="settings-section">
              <h3>{t("settings.yourPreferences")}</h3>
              <div className="settings-body">
                <label className="settings-field">
                  <span>{t("settings.interfaceLanguage")}</span>
                  <select
                    value={userPrefs.locale}
                    onChange={(event) =>
                      setUserPrefs({ ...userPrefs, locale: event.target.value as UserPrefsForm["locale"] })
                    }
                  >
                    <option value="">{t("settings.interfaceLanguageDefault")}</option>
                    {locales.map((localeOption) => (
                      <option key={localeOption} value={localeOption}>
                        {localeNativeNames[localeOption]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="settings-field">
                  <span>{t("settings.model")}</span>
                  <input
                    type="text"
                    value={userPrefs.model}
                    placeholder={settings.effective.model}
                    onChange={(event) => setUserPrefs({ ...userPrefs, model: event.target.value })}
                  />
                  <small className="field-hint">{t("settings.blankUsesInstanceDefault")}</small>
                </label>

                <label className="settings-field">
                  <span>{t("settings.systemPrompt")}</span>
                  <textarea
                    value={userPrefs.systemPrompt}
                    placeholder={payload?.defaultSystemPrompt}
                    rows={6}
                    onChange={(event) => setUserPrefs({ ...userPrefs, systemPrompt: event.target.value })}
                  />
                  <small className="field-hint">{t("settings.systemPromptHint")}</small>
                </label>
              </div>
            </section>

            <section className="settings-section">
              <h3>{t("settings.voiceSection")}</h3>
              <div className="settings-body">
                <label className="settings-field">
                  <span>{t("settings.speechEngine")}</span>
                  <select
                    value={userPrefs.speechEngine}
                    onChange={(event) =>
                      setUserPrefs({ ...userPrefs, speechEngine: event.target.value as UserPrefsForm["speechEngine"] })
                    }
                  >
                    <option value="">{t("settings.engineDefault", { engine: settings.speech.effective.engine })}</option>
                    <option value="browser">{t("settings.engineBrowser")}</option>
                    <option value="provider">{t("settings.engineProvider")}</option>
                  </select>
                  <small className="field-hint">
                    {t("settings.speechEngineHint")}{" "}
                    {settings.speech.effective.providerConfigured
                      ? t("settings.speechProviderReady")
                      : t("settings.speechProviderMissing")}
                  </small>
                </label>
              </div>
            </section>

            <section className="settings-section">
              <h3>{t("apiKeys.section")}</h3>
              <ApiKeysManager />
            </section>

            {isAdmin && settings.instance ? (
              <>
                <section className="settings-section">
                  <h3>{t("settings.instanceSection")}</h3>
                  <div className="settings-body">
                    <label className="settings-field">
                      <span>{t("settings.provider")}</span>
                      <select
                        value={instance.provider}
                        onChange={(event) =>
                          setInstance({ ...instance, provider: event.target.value as InstanceForm["provider"] })
                        }
                      >
                        <option value="">{t("settings.providerDefault", { provider: settings.effective.provider })}</option>
                        <option value="openai-compatible">{t("settings.providerOpenAI")}</option>
                        <option value="anthropic">{t("settings.providerAnthropic")}</option>
                        <option value="custom">{t("settings.providerCustom")}</option>
                      </select>
                    </label>

                    <label className="settings-field">
                      <span>{t("settings.defaultModel")}</span>
                      <input
                        type="text"
                        value={instance.model}
                        placeholder={settings.effective.model}
                        onChange={(event) => setInstance({ ...instance, model: event.target.value })}
                      />
                      <small className="field-hint">{t("settings.modelOverrideHint")}</small>
                    </label>

                    <label className="settings-field">
                      <span>{t("settings.baseUrl")}</span>
                      <input
                        type="text"
                        value={instance.baseUrl}
                        placeholder={settings.effective.baseUrl}
                        onChange={(event) => setInstance({ ...instance, baseUrl: event.target.value })}
                      />
                      <small className="field-hint">{t("settings.baseUrlHint")}</small>
                    </label>

                    <label className="settings-field">
                      <span>{t("settings.apiKey")}</span>
                      <input
                        type="password"
                        value={instance.apiKey}
                        placeholder={settings.effective.hasApiKey ? t("settings.keepCurrentKey") : t("settings.enterApiKey")}
                        autoComplete="off"
                        disabled={clearApiKey}
                        onChange={(event) => setInstance({ ...instance, apiKey: event.target.value })}
                      />
                      <small className="field-hint">
                        {settings.instance.hasStoredApiKey
                          ? t("settings.keyStored")
                          : settings.effective.hasApiKey
                            ? t("settings.keyFromEnv")
                            : t("settings.keyMissing")}
                      </small>
                      {settings.instance.hasStoredApiKey ? (
                        <label className="toggle">
                          <input
                            type="checkbox"
                            checked={clearApiKey}
                            onChange={(event) => setClearApiKey(event.target.checked)}
                          />
                          <span>{t("settings.removeStoredKey")}</span>
                        </label>
                      ) : null}
                    </label>

                    <label className="settings-field">
                      <span>{t("settings.defaultSystemPrompt")}</span>
                      <textarea
                        value={instance.systemPrompt}
                        placeholder={payload?.defaultSystemPrompt}
                        rows={5}
                        onChange={(event) => setInstance({ ...instance, systemPrompt: event.target.value })}
                      />
                      <small className="field-hint">{t("settings.instancePromptHint")}</small>
                    </label>
                  </div>
                </section>

                <section className="settings-section">
                  <h3>{t("settings.voiceProviderSection")}</h3>
                  <div className="settings-body">
                    <label className="settings-field">
                      <span>{t("settings.defaultEngine")}</span>
                      <select
                        value={instance.speechEngine}
                        onChange={(event) =>
                          setInstance({ ...instance, speechEngine: event.target.value as InstanceForm["speechEngine"] })
                        }
                      >
                        <option value="">{t("settings.engineDefaultBrowser")}</option>
                        <option value="browser">{t("settings.engineBrowser")}</option>
                        <option value="provider">{t("settings.engineProvider")}</option>
                      </select>
                      <small className="field-hint">{t("settings.engineOverrideHint")}</small>
                    </label>

                    <label className="settings-field">
                      <span>{t("settings.speechBaseUrl")}</span>
                      <input
                        type="text"
                        value={instance.speechBaseUrl}
                        placeholder="https://api.openai.com/v1"
                        onChange={(event) => setInstance({ ...instance, speechBaseUrl: event.target.value })}
                      />
                      <small className="field-hint">{t("settings.speechBaseUrlHint")}</small>
                    </label>

                    <label className="settings-field">
                      <span>{t("settings.speechApiKey")}</span>
                      <input
                        type="password"
                        value={instance.speechApiKey}
                        placeholder={
                          settings.speech.effective.providerConfigured
                            ? t("settings.keepCurrentKey")
                            : t("settings.enterApiKey")
                        }
                        autoComplete="off"
                        disabled={clearSpeechApiKey}
                        onChange={(event) => setInstance({ ...instance, speechApiKey: event.target.value })}
                      />
                      <small className="field-hint">
                        {settings.speech.instance?.hasStoredApiKey
                          ? t("settings.speechKeyStored")
                          : settings.speech.effective.providerConfigured
                            ? t("settings.speechKeyReused")
                            : t("settings.speechKeyMissing")}
                      </small>
                      {settings.speech.instance?.hasStoredApiKey ? (
                        <label className="toggle">
                          <input
                            type="checkbox"
                            checked={clearSpeechApiKey}
                            onChange={(event) => setClearSpeechApiKey(event.target.checked)}
                          />
                          <span>{t("settings.removeStoredKey")}</span>
                        </label>
                      ) : null}
                    </label>

                    <label className="settings-field">
                      <span>{t("settings.sttModel")}</span>
                      <input
                        type="text"
                        value={instance.speechSttModel}
                        placeholder={settings.speech.effective.sttModel}
                        onChange={(event) => setInstance({ ...instance, speechSttModel: event.target.value })}
                      />
                    </label>

                    <label className="settings-field">
                      <span>{t("settings.ttsModel")}</span>
                      <input
                        type="text"
                        value={instance.speechTtsModel}
                        placeholder={settings.speech.effective.ttsModel}
                        onChange={(event) => setInstance({ ...instance, speechTtsModel: event.target.value })}
                      />
                    </label>

                    <label className="settings-field">
                      <span>{t("settings.ttsVoice")}</span>
                      <input
                        type="text"
                        value={instance.speechTtsVoice}
                        placeholder={settings.speech.effective.ttsVoice}
                        onChange={(event) => setInstance({ ...instance, speechTtsVoice: event.target.value })}
                      />
                      <small className="field-hint">{t("settings.ttsVoiceHint")}</small>
                    </label>
                  </div>
                </section>

                <section className="settings-section">
                  <h3>{t("settings.usersSection")}</h3>
                  <UserAdmin currentUserId={currentUserId} />
                </section>
              </>
            ) : null}
          </>
        ) : null}

        {error ? <p className="composer-error">{error}</p> : null}
        {saveStatus === "success" && !error ? <p className="settings-saved">{t("settings.saved")}</p> : null}

        <footer className="settings-actions">
          <button
            type="button"
            className="ghost-button danger-button"
            onClick={resetUserPrefs}
            disabled={saveStatus === "loading" || loadStatus !== "success"}
          >
            {t("settings.resetMine")}
          </button>
          <div className="settings-actions-right">
            <button type="button" className="ghost-button" onClick={onClose}>
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className="send-button"
              onClick={saveSettings}
              disabled={saveStatus === "loading" || loadStatus !== "success"}
            >
              {saveStatus === "loading" ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </footer>

        {settings ? <p className="settings-version">Translatarr v{settings.version}</p> : null}
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
