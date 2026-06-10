"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useI18n } from "../lib/i18n/i18n-context";
import type { User } from "../lib/user-store";
import { BrandSeal } from "./brand-seal";
import { Translator } from "./translator";

type GateState = "loading" | "setup" | "login" | "ready";

export function AuthGate() {
  const { t } = useI18n();
  const [state, setState] = useState<GateState>("loading");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    void checkSession();
  }, []);

  async function checkSession() {
    try {
      const response = await fetch("/api/auth/me");
      const payload = (await response.json()) as { user: User | null; needsSetup?: boolean };

      if (response.ok && payload.user) {
        setUser(payload.user);
        setState("ready");
      } else {
        setState(payload.needsSetup ? "setup" : "login");
      }
    } catch {
      setState("login");
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setState("login");
  }

  if (state === "loading") {
    return (
      <main className="auth-shell">
        <p className="subtle">{t("common.loading")}</p>
      </main>
    );
  }

  if (state === "ready" && user) {
    return <Translator user={user} onLogout={() => void logout()} />;
  }

  return (
    <AuthForm
      mode={state === "setup" ? "setup" : "login"}
      onAuthenticated={(authedUser) => {
        setUser(authedUser);
        setState("ready");
      }}
    />
  );
}

function AuthForm({
  mode,
  onAuthenticated,
}: {
  mode: "setup" | "login";
  onAuthenticated: (user: User) => void;
}) {
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch(mode === "setup" ? "/api/auth/setup" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = (await response.json()) as { user?: User; error?: string };

      if (!response.ok || !payload.user) {
        throw new Error(payload.error ?? t("auth.failed"));
      }

      onAuthenticated(payload.user);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : t("auth.failed"));
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <h1>
          <BrandSeal size={30} />
          Translatarr
        </h1>
        <p className="subtle">{mode === "setup" ? t("auth.setupWelcome") : t("auth.signInPrompt")}</p>

        <label className="settings-field">
          <span>{t("common.username")}</span>
          <input
            type="text"
            value={username}
            autoComplete="username"
            autoFocus
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>

        <label className="settings-field">
          <span>{t("common.password")}</span>
          <input
            type="password"
            value={password}
            autoComplete={mode === "setup" ? "new-password" : "current-password"}
            onChange={(event) => setPassword(event.target.value)}
          />
          {mode === "setup" ? <small className="field-hint">{t("auth.passwordHint")}</small> : null}
        </label>

        {error ? <p className="composer-error">{error}</p> : null}

        <button type="submit" className="send-button" disabled={submitting || !username || !password}>
          {submitting ? t("auth.working") : mode === "setup" ? t("auth.createAdmin") : t("auth.signIn")}
        </button>
      </form>
    </main>
  );
}
