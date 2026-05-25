export const dynamic = "force-dynamic";

export default function ForbiddenPage() {
  return (
    <main className="login-page">
      <section className="login-panel">
        <div>
          <div className="eyebrow">Access Control</div>
          <h1>沒有此頁權限</h1>
          <p>目前帳號角色不能開啟這個頁面。請回到總覽，或請管理員調整角色。</p>
        </div>
        <a className="login-secondary-link" href="/">
          返回總覽
        </a>
      </section>
    </main>
  );
}
