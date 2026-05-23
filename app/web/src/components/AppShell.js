"use client";

import { useState } from "react";
import {
  BarChart3,
  Bell,
  BookOpen,
  Database,
  FileSearch,
  Home,
  Landmark,
  LogOut,
  ReceiptText,
  ShieldCheck,
  Settings,
  UploadCloud
} from "lucide-react";
import GlobalSearch from "@/components/GlobalSearch";
import { csrfHeaders } from "@/lib/client-security";
import { usePathname } from "next/navigation";

const navGroups = [
  {
    label: "資料",
    icon: UploadCloud,
    items: [
      { href: "/documents", label: "文件上傳", description: "憑證與報表" },
      { href: "/ocr", label: "OCR 任務", description: "辨識與複核" },
      { href: "/attachments", label: "附件", description: "來源關聯" }
    ]
  },
  {
    label: "帳務",
    icon: BookOpen,
    items: [
      { href: "/accounts", label: "科目表", description: "會計科目" },
      { href: "/journal", label: "分錄 / 傳票", description: "借貸與過帳" },
      { href: "/ledger", label: "總帳", description: "科目明細" },
      { href: "/trial-balance", label: "試算表", description: "借貸餘額" }
    ]
  },
  {
    label: "交易",
    icon: ReceiptText,
    items: [
      { href: "/receivables", label: "應收帳款", description: "客戶請款" },
      { href: "/payables", label: "應付帳款", description: "供應商付款" },
      { href: "/banking", label: "銀行對帳", description: "交易匹配" },
      { href: "/bank-imports", label: "銀行匯入", description: "CSV 匯入" },
      { href: "/bank-rules", label: "銀行規則", description: "自動配帳" },
      { href: "/assets", label: "固定資產", description: "折舊管理" },
      { href: "/inventory", label: "存貨明細帳", description: "進出庫" }
    ]
  },
  {
    label: "稅報",
    icon: BarChart3,
    items: [
      { href: "/taxes", label: "稅務", description: "401 流程" },
      { href: "/financials", label: "財報", description: "報表列資料" },
      { href: "/reports/balance-sheet", label: "資產負債表", description: "財報檢視" },
      { href: "/reports/vat-returns", label: "401 報表", description: "營業稅申報" },
      { href: "/exports", label: "匯出", description: "CSV / 交換檔" }
    ]
  },
  {
    label: "管控",
    icon: ShieldCheck,
    items: [
      { href: "/permissions", label: "權限", description: "角色與帳號" },
      { href: "/approvals", label: "審核", description: "待辦流程" },
      { href: "/audit", label: "稽核軌跡", description: "操作留痕" },
      { href: "/batch", label: "批次診斷", description: "檢查與復原" }
    ]
  }
];

function isActivePath(pathname, href) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export default function AppShell({ children }) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isAuthPage =
    pathname === "/login" ||
    pathname === "/change-password" ||
    pathname === "/forgot-password";
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  if (isAuthPage) {
    return children;
  }

  async function logout() {
    if (!window.confirm("確定要登出目前帳號嗎？")) {
      return;
    }

    setIsLoggingOut(true);
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: csrfHeaders()
    });
    window.location.href = "/login";
  }

  return (
    <div className="app-shell">
      <div className="app-frame">
        <header className="topbar">
          <a className="brand" href="/">
            <span className="brand-mark">
              <Database size={21} strokeWidth={2.4} />
            </span>
            <span className="brand-title">ACCTLY</span>
          </a>

          <nav className="nav-list" aria-label="主選單">
            <a href="/" className={`nav-item ${isActivePath(pathname, "/") ? "active" : ""}`}>
              <Home size={15} strokeWidth={2.1} />
              <span>總覽</span>
            </a>
            {navGroups.map((group) => {
              const Icon = group.icon || Landmark;
              const isActive = group.items.some((item) => isActivePath(pathname, item.href));
              return (
                <div className={`nav-group ${isActive ? "active" : ""}`} key={group.label}>
                  <button
                    className="nav-group-trigger"
                    type="button"
                    aria-haspopup="menu"
                    aria-label={`${group.label}選單`}
                  >
                    <Icon size={15} strokeWidth={2.1} />
                    <span>{group.label}</span>
                  </button>
                  <div className="nav-group-menu" role="menu">
                    {group.items.map((item) => (
                      <a
                        key={item.href}
                        href={item.href}
                        role="menuitem"
                        className={isActivePath(pathname, item.href) ? "active" : ""}
                      >
                        <strong>{item.label}</strong>
                        <span>{item.description}</span>
                      </a>
                    ))}
                  </div>
                </div>
              );
            })}
          </nav>

          <div className="topbar-actions">
            <GlobalSearch />

            <div className="topbar-tool">
              <button
                className="icon-button"
                aria-haspopup="menu"
                aria-label="設定"
                title="設定"
                type="button"
              >
                <Settings size={18} strokeWidth={2.1} />
              </button>
              <div className="topbar-popover" role="menu">
                <div className="popover-head">
                  <strong>設定</strong>
                  <span>管理帳號與系統</span>
                </div>
                <a href="/change-password" role="menuitem">
                  <strong>更換密碼</strong>
                  <span>更新目前登入帳號</span>
                </a>
                <a href="/company-settings" role="menuitem">
                  <strong>公司主檔</strong>
                  <span>統編、申報別與公司資料</span>
                </a>
                <a href="/permissions" role="menuitem">
                  <strong>權限管理</strong>
                  <span>使用者角色與啟用狀態</span>
                </a>
                <a href="/audit" role="menuitem">
                  <strong>稽核軌跡</strong>
                  <span>查看系統操作紀錄</span>
                </a>
              </div>
            </div>

            <div className="topbar-tool">
              <button
                className="icon-button"
                aria-haspopup="menu"
                aria-label="通知"
                title="通知"
                type="button"
              >
                <Bell size={18} strokeWidth={2.1} />
              </button>
              <div className="topbar-popover notification-popover" role="menu">
                <div className="popover-head">
                  <strong>通知</strong>
                  <span>待辦與異常入口</span>
                </div>
                <a href="/ocr" role="menuitem">
                  <strong>OCR 任務</strong>
                  <span>查看辨識與複核工作</span>
                </a>
                <a href="/approvals" role="menuitem">
                  <strong>審核待辦</strong>
                  <span>處理分錄、報表與匯出審核</span>
                </a>
                <a href="/batch" role="menuitem">
                  <strong>批次診斷</strong>
                  <span>檢查借貸、稅務、財報狀態</span>
                </a>
              </div>
            </div>

            <button
              className="icon-button"
              aria-label={isLoggingOut ? "登出中" : "登出"}
              disabled={isLoggingOut}
              title="登出"
              type="button"
              onClick={logout}
            >
              <LogOut size={18} strokeWidth={2.1} />
            </button>
            <div className="avatar" aria-label="目前使用者">A</div>
          </div>
        </header>
        <main className={`main-area ${isHome ? "fit-screen" : ""}`}>{children}</main>
      </div>
    </div>
  );
}
