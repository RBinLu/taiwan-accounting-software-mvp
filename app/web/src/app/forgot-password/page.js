import ForgotPasswordForm from "@/components/ForgotPasswordForm";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <main className="login-page">
      <section className="login-panel">
        <div>
          <div className="eyebrow">Account Recovery</div>
          <h1>忘記密碼</h1>
          <p>
            送出請求後，總管理員可在權限管理中產生臨時密碼，使用者下次登入後會被要求重新設定密碼。
          </p>
        </div>
        <ForgotPasswordForm />
      </section>
    </main>
  );
}
