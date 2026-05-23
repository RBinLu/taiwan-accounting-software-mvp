"use client";

import { useState } from "react";

export default function ForgotPasswordForm() {
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSaving(true);
    setMessage("送出中...");

    const payload = Object.fromEntries(new FormData(event.currentTarget));

    try {
      const response = await fetch("/api/auth/password-reset-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.message || "請稍後再試");
      }

      setMessage("若帳號存在，系統已記錄重設請求。請由總管理員在權限管理中重設密碼。");
      event.currentTarget.reset();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label>
        <span>Email</span>
        <input name="email" type="email" autoComplete="username" required />
      </label>
      <button type="submit" disabled={isSaving}>
        {isSaving ? "送出中" : "送出重設請求"}
      </button>
      {message ? <div className="login-error neutral">{message}</div> : null}
      <a className="login-secondary-link" href="/login">
        返回登入
      </a>
    </form>
  );
}
