"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { User, UserRole } from "../lib/user-store";

export function UserAdmin() {
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
        throw new Error(payload.error ?? "Could not load users.");
      }

      setUsers(payload.users);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load users.");
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
        throw new Error(payload.error ?? "Could not create user.");
      }

      setUsername("");
      setPassword("");
      setRole("user");
      await loadUsers();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create user.");
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
        throw new Error(payload.error ?? "Could not delete user.");
      }

      await loadUsers();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete user.");
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
            <span className="badge">{user.role}</span>
            <button
              type="button"
              className="ghost-button danger-button"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Delete ${user.username}? Their chats and settings will be removed.`)) {
                  void removeUser(user.id);
                }
              }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>

      <form className="user-add-form" onSubmit={addUser}>
        <div className="user-add-fields">
          <label className="settings-field">
            <span>Username</span>
            <input
              type="text"
              value={username}
              autoComplete="off"
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label className="settings-field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              autoComplete="new-password"
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label className="settings-field">
            <span>Role</span>
            <select value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </label>
        </div>
        <button type="submit" className="ghost-button" disabled={busy || !username || !password}>
          Add user
        </button>
      </form>

      {error ? <p className="composer-error">{error}</p> : null}
    </div>
  );
}
