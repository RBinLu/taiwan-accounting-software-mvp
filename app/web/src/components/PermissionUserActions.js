"use client";

import { useState } from "react";
import { csrfHeaders } from "@/lib/client-security";

const roleOptions = [
  "OWNER",
  "ADMIN",
  "ACCOUNTANT",
  "REVIEWER",
  "CLIENT_READONLY"
];

export default function PermissionUserActions({
  membershipId,
  role,
  isActive,
  isCurrentUser
}) {
  const [selectedRole, setSelectedRole] = useState(role);
  const [status, setStatus] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function updateAccess(nextValues) {
    setIsSaving(true);
    setStatus("更新中...");

    try {
      const response = await fetch("/api/accounting/user-access", {
        method: "PATCH",
        headers: csrfHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          membershipId,
          role: selectedRole,
          isActive,
          ...nextValues
        })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.message || "權限更新失敗");
      }

      setStatus("已更新");
      window.setTimeout(() => window.location.reload(), 350);
    } catch (error) {
      setStatus(error.message);
      setIsSaving(false);
    }
  }

  async function resetPassword() {
    if (!window.confirm("確定要為此使用者產生臨時密碼嗎？原登入狀態會失效。")) {
      return;
    }

    setIsSaving(true);
    setTemporaryPassword("");
    setStatus("重設中...");

    try {
      const response = await fetch("/api/accounting/user-password-reset", {
        method: "POST",
        headers: csrfHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ membershipId })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.message || "密碼重設失敗");
      }

      setTemporaryPassword(body.temporaryPassword);
      setStatus("臨時密碼已產生");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  if (isCurrentUser) {
    return <span className="module-muted-action">目前登入者</span>;
  }

  return (
    <div className="permission-actions">
      <select
        aria-label="使用者角色"
        value={selectedRole}
        disabled={isSaving}
        onChange={(event) => setSelectedRole(event.target.value)}
      >
        {roleOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={isSaving || selectedRole === role}
        onClick={() => updateAccess({ role: selectedRole })}
      >
        套用
      </button>
      <button
        type="button"
        disabled={isSaving}
        onClick={() => updateAccess({ isActive: !isActive })}
      >
        {isActive ? "停用" : "啟用"}
      </button>
      <button type="button" disabled={isSaving} onClick={resetPassword}>
        重設密碼
      </button>
      {status ? <span>{status}</span> : null}
      {temporaryPassword ? (
        <span className="temporary-password">臨時密碼：{temporaryPassword}</span>
      ) : null}
    </div>
  );
}
