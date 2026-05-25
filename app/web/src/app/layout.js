import AppShell from "@/components/AppShell";
import { getCurrentSession } from "@/lib/auth";
import "./globals.css";

export const metadata = {
  title: "會計 OCR 後台",
  description: "台灣會計文件 OCR 與報表資料庫後台"
};

export const viewport = {
  width: "device-width",
  initialScale: 1
};

export default async function RootLayout({ children }) {
  const session = await getCurrentSession();
  const userRoles = session?.user?.companies?.map((membership) => membership.role) || [];

  return (
    <html lang="zh-Hant">
      <body>
        <AppShell userRoles={userRoles}>{children}</AppShell>
      </body>
    </html>
  );
}
