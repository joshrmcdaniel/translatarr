"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useI18n } from "../lib/i18n/i18n-context";
import type { User, UserRole } from "../lib/user-store";

export function UserAdmin() {
  const { t } = useI18n();
  const [users, setUsers] = useState<User[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadUsers();
  }, []);

  async function loadUsers() {
    try {
      const response = await fetch("/api/users");
      const payload = (await response.json()) as { users?: User[]; error?: string };

      if (!response.ok || !payload.users) {
        throw new Error(payload.error ?? t("users.loadFailed"));
      }

      setUsers(payload.users);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("users.loadFailed"));
    }
  }

  async function addUser(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, role }),
      });
      const payload = (await response.json()) as { user?: User; error?: string };

      if (!response.ok || !payload.user) {
        throw new Error(payload.error ?? t("users.createFailed"));
      }

      setUsername("");
      setPassword("");
      setRole("user");
      await loadUsers();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t("users.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function removeUser(userId: string) {
    setBusy(true);
    setError("");

    try {
      const response = await fetch(`/api/users/${userId}`, { method: "DELETE" });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? t("users.deleteFailed"));
      }

      await loadUsers();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t("users.deleteFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-body">
      <div className="user-list">
        {users.map((user) => (
          <div className="user-row" key={user.id}>
            <strong>{user.username}</strong>
            <span className="badge">{t(user.role === "admin" ? "users.badgeAdmin" : "users.badgeUser")}</span>
            <button
              type="button"
              className="ghost-button danger-button"
              disabled={busy}
              onClick={() => {
                if (window.confirm(t("users.confirmDelete", { username: user.username }))) {
                  void removeUser(user.id);
                }
              }}
            >
              {t("common.delete")}
            </button>
          </div>
        ))}
      </div>

      <form className="user-add-form" onSubmit={addUser}>
        <div className="user-add-fields">
          <label className="settings-field">
            <span>{t("common.username")}</span>
            <input
              type="text"
              value={username}
              autoComplete="off"
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label className="settings-field">
            <span>{t("common.password")}</span>
            <input
              type="password"
              value={password}
              autoComplete="new-password"
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label className="settings-field">
            <span>{t("users.role")}</span>
            <select value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
              <option value="user">{t("users.roleUser")}</option>
              <option value="admin">{t("users.roleAdmin")}</option>
            </select>
          </label>
        </div>
        <button type="submit" className="ghost-button" disabled={busy || !username || !password}>
          {t("users.add")}
        </button>
      </form>

      {error ? <p className="composer-error">{error}</p> : null}
    </div>
  );
}
