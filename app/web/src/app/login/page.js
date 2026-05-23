export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const error = resolvedSearchParams?.error;
  const nextPath = resolvedSearchParams?.next || "/";
  const errorMessages = {
    "1": "帳號或密碼不正確",
    locked: "登入失敗次數過多，帳號已暫時鎖定",
    rate: "登入嘗試太頻繁，請稍後再試"
  };

  return (
    <main className="login-page">
      <section className="login-panel">
        <div>
          <div className="eyebrow">Secure Accounting Console</div>
          <h1>登入 ACCTLY</h1>
          <p>使用具備公司角色的帳號進入後台。所有會計異動會寫入稽核軌跡。</p>
        </div>
        {error ? <div className="login-error">{errorMessages[error] || "登入失敗"}</div> : null}
        <form className="login-form" action="/api/auth/login" method="post">
          <input type="hidden" name="next" value={nextPath} />
          <label>
            <span>Email</span>
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
            />
          </label>
          <label>
            <span>密碼</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit">登入</button>
          <a className="login-secondary-link" href="/forgot-password">
            忘記密碼？
          </a>
        </form>
      </section>
    </main>
  );
}
