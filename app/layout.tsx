import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const notoThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  variable: "--font-thai",
});

export const metadata: Metadata = {
  title: "Tee Stock Research",
  description: "ระบบวิเคราะห์หุ้น: research → analyze → theorize",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={notoThai.variable}>
      <body>
        <header className="site-header">
          <Link href="/" className="logo">📈 Tee Stock Research</Link>
          <span className="tagline">research → analyze → theorize</span>
          <nav style={{ marginLeft: "auto", display: "flex", gap: 16 }}>
            <Link href="/best-price" style={{ fontSize: 13, color: "var(--text-dim)" }}>ราคาน่าสนใจ</Link>
            <Link href="/insights" style={{ fontSize: 13, color: "var(--text-dim)" }}>Insights</Link>
          </nav>
        </header>
        <main className="container">{children}</main>
        <footer className="container disclaimer">
          ข้อมูลในระบบนี้สร้างโดย AI pipeline เพื่อการศึกษาเท่านั้น
          ไม่ใช่คำแนะนำการลงทุน โปรดตรวจสอบข้อมูลจากแหล่งทางการก่อนตัดสินใจใดๆ
        </footer>
      </body>
    </html>
  );
}
