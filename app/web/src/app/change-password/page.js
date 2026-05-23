import ChangePasswordForm from "@/components/ChangePasswordForm";
import { getCurrentSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const session = await getCurrentSession();

  if (!session) {
    redirect("/login");
  }

  const isFirstLogin = session.user.mustChangePassword;

  return (
    <main className="login-page">
      <section className="login-panel">
        <div>
          <div className="eyebrow">Password Settings</div>
          <h1>{isFirstLogin ? "首次登入請變更密碼" : "更換密碼"}</h1>
          <p>
            {isFirstLogin
              ? "密碼更新後才會開放會計資料、API 與附件操作。"
              : "你可以隨時更新目前登入帳號的密碼。更新後其他裝置的舊登入狀態會失效。"}
          </p>
        </div>
        <ChangePasswordForm email={session.user.email} />
      </section>
    </main>
  );
}
