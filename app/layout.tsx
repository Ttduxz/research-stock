import type { Metadata } from "next";
import { Sarabun, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import MotionLayer from "@/components/MotionLayer";
import PageViewLogger from "@/components/PageViewLogger";
import { auth, signOut } from "@/auth";
import { isAdmin } from "@/lib/admin";
import "./globals.css";

// รันก่อน body วาดครั้งแรก เพื่อตัดสินใจว่าจะเปิด motion ไหม — กันภาพ "โผล่มาก่อนแล้วค่อยหายไป reveal"
// ถ้า JS ปิดทั้งหมด จะไม่มีคลาสไหนถูกใส่ → CSS ของ motion ไม่ทำงาน เนื้อหาแสดงครบตามปกติ
const MOTION_BOOT = `try{document.documentElement.classList.add(window.matchMedia('(prefers-reduced-motion: reduce)').matches?'motion-off':'motion-ready')}catch(e){}`;

// Sarabun = ฟอนต์ไทยมีหัว (looped) อ่านรายงานยาวๆ สบายตากว่าแบบไม่มีหัว
const sarabun = Sarabun({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-thai",
});

// IBM Plex Mono = ฟอนต์ตัวเลข/ป้ายกำกับ (ไม่มีไทย — ตัวไทยจะ fallback ไป Sarabun ทีละตัวอักษรเอง)
// จำเป็นสำหรับรายงานการเงิน: ตัวเลขความกว้างเท่ากันทุกตัว ตารางจึงเรียงเป็นคอลัมน์จริง
// และป้ายกำกับตัวพิมพ์ใหญ่เล็กๆ อ่านเป็น "เครื่องมือวัด" ไม่ปนกับเนื้อความ
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Tee Stock Research",
  description: "ระบบวิเคราะห์หุ้น: research → analyze → theorize",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const email = session?.user?.email ?? null;
  return (
    <html lang="th" className={`${sarabun.variable} ${plexMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MOTION_BOOT }} />
      </head>
      <body>
        <MotionLayer />
        {email && (
          <Suspense fallback={null}>
            <PageViewLogger />
          </Suspense>
        )}
        <header className="site-header">
          <div className="masthead">
            <Link href="/" className="logo">
              <span className="logo-mark" aria-hidden="true" />
              Tee Stock Research
            </Link>
            <span className="tagline">research → analyze → theorize</span>
            {email && (
              <nav className="site-nav">
                <Link href="/best-price">ราคาน่าสนใจ</Link>
                <Link href="/insights">Insights</Link>
                {isAdmin(email) && <Link href="/admin/logs">Log</Link>}
                <form
                  className="signout-form"
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/login" });
                  }}
                >
                  <button type="submit" className="signout-btn" title={email}>
                    ออกจากระบบ
                  </button>
                </form>
              </nav>
            )}
          </div>
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
