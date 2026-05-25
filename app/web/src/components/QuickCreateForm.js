"use client";

import { useState } from "react";
import { csrfHeaders } from "@/lib/client-security";

const lockedModules = new Set([
  "journal",
  "receivables",
  "payables",
  "banking",
  "bank-imports",
  "taxes",
  "financials",
  "assets",
  "inventory"
]);

export default function QuickCreateForm({ moduleKey, config, periodState, csrfToken = "" }) {
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  if (!config.fields.length) {
    return (
      <div className="module-hint">
        這個模組由其他交易資料自動產生，目前不需要手動新增。
      </div>
    );
  }

  if (periodState?.isLocked && lockedModules.has(moduleKey)) {
    return (
      <div className="module-hint">
        本期已鎖帳，不能新增或修改會計交易。需要調整時請先解除鎖帳。
      </div>
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSaving(true);
    setStatus("儲存中...");

    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form));

    try {
      const response = await fetch(`/api/mvp/${moduleKey}`, {
        method: "POST",
        headers: csrfHeaders({
          "content-type": "application/json",
          "x-acctly-fetch": "1"
        }),
        body: JSON.stringify(payload)
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.message || "儲存失敗");
      }

      setStatus("已儲存");
      form.reset();
      window.setTimeout(() => window.location.reload(), 450);
    } catch (error) {
      setStatus(error.message);
      setIsSaving(false);
    }
  }

  return (
    <form
      action={`/api/mvp/${moduleKey}`}
      className="module-form"
      method="post"
      onSubmit={handleSubmit}
    >
      <input name="csrfToken" type="hidden" value={csrfToken} />
      <div className="module-form-grid">
        {config.fields.map((field) => (
          <label className="module-field" key={field.name}>
            <span>{field.label}</span>
            {field.type === "select" ? (
              <select name={field.name} required={field.required}>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : field.type === "textarea" ? (
              <textarea
                name={field.name}
                required={field.required}
                placeholder={field.placeholder || ""}
                rows={5}
              />
            ) : (
              <input
                name={field.name}
                type={field.type || "text"}
                required={field.required}
                placeholder={field.placeholder || ""}
                step={field.type === "number" ? "0.01" : undefined}
              />
            )}
          </label>
        ))}
      </div>
      <div className="module-form-actions">
        <span>{status}</span>
        <button type="submit" disabled={isSaving}>
          {isSaving ? "儲存中" : config.createLabel}
        </button>
      </div>
    </form>
  );
}
