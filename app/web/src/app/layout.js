import AppShell from "@/components/AppShell";
import "./globals.css";

export const metadata = {
  title: "會計 OCR 後台",
  description: "台灣會計文件 OCR 與報表資料庫後台"
};

export const viewport = {
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-Hant">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
