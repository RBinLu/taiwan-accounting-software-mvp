"use client";

import { useState } from "react";
import { csrfHeaders } from "@/lib/client-security";

export default function ChangePasswordForm({ email, csrfToken = "" }) {
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSaving(true);
    setMessage("更新中...");

    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form));

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: csrfHeaders({
          "content-type": "application/json",
          "x-acctly-fetch": "1"
        }),
        body: JSON.stringify(payload)
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.message || "密碼更新失敗");
      }

      setMessage("密碼已更新，正在進入系統...");
      window.setTimeout(() => {
        window.location.href = "/";
      }, 500);
    } catch (error) {
      setMessage(error.message);
      setIsSaving(false);
    }
  }

  return (
    <form
      action="/api/auth/change-password"
      className="login-form"
      method="post"
      onSubmit={handleSubmit}
    >
      <input name="csrfToken" type="hidden" value={csrfToken} />
      <label>
        <span>Email</span>
        <input value={email} disabled />
      </label>
      <label>
        <span>目前密碼</span>
        <input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      <label>
        <span>新密碼</span>
        <input name="newPassword" type="password" autoComplete="new-password" required />
      </label>
      <label>
        <span>確認新密碼</span>
        <input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </label>
      <button type="submit" disabled={isSaving}>
        {isSaving ? "更新中" : "更新密碼"}
      </button>
      {message ? <div className="login-error neutral">{message}</div> : null}
    </form>
  );
}
