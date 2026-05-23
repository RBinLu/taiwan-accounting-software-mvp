"use client";

import { useState } from "react";
import { csrfHeaders } from "@/lib/client-security";

const exportTypes = [
  ["trial-balance", "試算表"],
  ["ledger", "總帳"],
  ["taxes", "稅務"],
  ["financials", "財報"],
  ["vat-401-official", "401 正式格式"],
  ["einvoice-mig", "電子發票 MIG"],
  ["receivables", "應收"],
  ["payables", "應付"],
  ["banking", "銀行對帳"]
];

function moneyText(value) {
  return new Intl.NumberFormat("zh-TW", {
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

export default function ModuleAutomationPanel({ moduleKey, state }) {
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [exportType, setExportType] = useState("trial-balance");

  if (!["taxes", "financials", "exports", "assets", "batch"].includes(moduleKey)) {
    return null;
  }

  async function postJson(url, payload = {}) {
    setIsSaving(true);
    setMessage("處理中...");

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: csrfHeaders({ "content-type": "application/json" }),
        body: JSON.stringify(payload)
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.message || "操作失敗");
      }

      setMessage("已完成");
      window.setTimeout(() => window.location.reload(), 450);
    } catch (error) {
      setMessage(error.message);
      setIsSaving(false);
    }
  }

  if (moduleKey === "taxes") {
    return (
      <div className="module-automation-panel">
        <div className="module-section-head">
          <span>Tax Workflow</span>
          <h2>401 稅務流程</h2>
        </div>
        <div className="automation-metrics">
          <div>
            <span>銷售額</span>
            <strong>NT$ {moneyText(state.salesAmount)}</strong>
          </div>
          <div>
            <span>應納稅額</span>
            <strong>NT$ {moneyText(state.payableTax)}</strong>
          </div>
        </div>
        <div className="automation-actions">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => postJson("/api/accounting/tax-workflow", { action: "rebuild" })}
          >
            重算稅務
          </button>
          <button
            type="button"
            disabled={isSaving || !state.hasTaxRecord}
            onClick={() => postJson("/api/accounting/tax-workflow", { action: "review" })}
          >
            標記複核
          </button>
          <button
            type="button"
            disabled={isSaving || state.status !== "REVIEWED"}
            onClick={() => postJson("/api/accounting/tax-workflow", { action: "file" })}
          >
            標記申報
          </button>
        </div>
        <p>{message || "稅務資料由本期應收、應付單據自動彙總。"}</p>
      </div>
    );
  }

  if (moduleKey === "financials") {
    return (
      <div className="module-automation-panel">
        <div className="module-section-head">
          <span>Statement Close</span>
          <h2>財報產生</h2>
        </div>
        <div className="automation-metrics">
          <div>
            <span>本期損益</span>
            <strong>NT$ {moneyText(state.netIncome)}</strong>
          </div>
          <div>
            <span>自動列數</span>
            <strong>{state.generatedLineCount}</strong>
          </div>
        </div>
        <div className="automation-actions">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => postJson("/api/accounting/financials-generate")}
          >
            由總帳產生財報
          </button>
        </div>
        <p>{message || "損益表與資產負債表會從已過帳分錄重新產生。"}</p>
      </div>
    );
  }

  if (moduleKey === "assets") {
    return (
      <div className="module-automation-panel">
        <div className="module-section-head">
          <span>Depreciation</span>
          <h2>每月折舊</h2>
        </div>
        <div className="automation-actions">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => postJson("/api/accounting/fixed-assets/depreciate")}
          >
            提列本期折舊
          </button>
        </div>
        <p>{message || `本期已提列：${state.depreciationCount || 0} 筆。`}</p>
      </div>
    );
  }

  if (moduleKey === "batch") {
    return (
      <div className="module-automation-panel">
        <div className="module-section-head">
          <span>Diagnostics</span>
          <h2>批次測試</h2>
        </div>
        <div className="automation-actions">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => postJson("/api/accounting/batch-diagnostics", { action: "run" })}
          >
            執行批次檢查
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() =>
              postJson("/api/accounting/batch-diagnostics", { action: "recover" })
            }
          >
            錯誤復原
          </button>
        </div>
        <p>{message || `最近批次狀態：${state.latestStatus || "尚未執行"}。`}</p>
      </div>
    );
  }

  return (
    <div className="module-automation-panel">
      <div className="module-section-head">
        <span>Export Center</span>
        <h2>產生匯出檔</h2>
      </div>
      <label className="module-field">
        <span>匯出類型</span>
        <select value={exportType} onChange={(event) => setExportType(event.target.value)}>
          {exportTypes.map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <div className="automation-actions">
        <button
          type="button"
          disabled={isSaving}
          onClick={() =>
            postJson("/api/accounting/export-generate", {
              exportType
            })
          }
        >
          產生 CSV
        </button>
      </div>
      <p>{message || `已產生檔案：${state.generatedCount} 份。`}</p>
    </div>
  );
}
