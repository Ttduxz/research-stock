import type { Metadata } from "next";
import { Sarabun, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import MotionLayer from "@/components/MotionLayer";
import PageViewLogger from "@/components/PageViewLogger";
import SiteSidebar from "@/components/SiteSidebar";
import { auth, signOut } from "@/auth";
import { isAdmin } from "@/lib/admin";
import "./globals.css";

// รันก่อน body วาดครั้งแรก เพื่อตัดสินใจว่าจะเปิด motion ไหม — กันภาพ "โผล่มาก่อนแล้วค่อยหายไป reveal"
// ถ้า JS ปิดทั้งหมด จะไม่มีคลาสไหนถูกใส่ → CSS ของ motion ไม่ทำงาน เนื้อหาแสดงครบตามปกติ
const MOTION_BOOT = `try{document.documentElement.classList.add(window.matchMedia('(prefers-reduced-motion: reduce)').matches?'motion-off':'motion-ready')}catch(e){}`;

// แถบเมนูซ้ายที่ผู้ใช้พับไว้ต้องพับตั้งแต่เฟรมแรก — ถ้ารอ React อ่าน localStorage แถบจะโผล่แล้วค่อยหุบทุกครั้งที่เปลี่ยนหน้า
const SIDEBAR_BOOT = `try{if(localStorage.getItem('sb-collapsed')==='1')document.documentElement.classList.add('sb-collapsed')}catch(e){}`;

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
    // suppressHydrationWarning: สคริปต์ boot ด้านล่างใส่คลาสบน <html> ก่อน React hydrate (motion-ready / sb-collapsed)
    // ซึ่งตั้งใจให้ต่างจาก HTML ฝั่ง server — มีผลเฉพาะ attribute ของ <html> เอง ไม่ปิดคำเตือนของลูกข้างใน
    <html lang="th" className={`${sarabun.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MOTION_BOOT }} />
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_BOOT }} />
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
            {email && (
              <SiteSidebar
                email={email}
                admin={isAdmin(email)}
                signOutAction={async () => {
                  "use server";
                  await signOut({ redirectTo: "/login" });
                }}
              />
            )}
            <Link href="/" className="logo">
              <span className="logo-mark" aria-hidden="true" />
              Tee Stock Research
            </Link>
          </div>
        </header>
        {/* has-sidebar: จอกว้างเว้นที่ซ้ายให้แถบเมนู (หน้า login ไม่มีแถบ จึงไม่ต้องเว้น) */}
        <div className={`page-shell ${email ? "has-sidebar" : ""}`}>
          <main className="container">{children}</main>
          {email && (
            <div className="container footer-donate">
              รายงานมีประโยชน์กับคุณไหม? <Link href="/donate">เลี้ยงกาแฟคนทำระบบผ่าน PromptPay →</Link>
            </div>
          )}
          <footer className="container disclaimer">
            ข้อมูลในระบบนี้สร้างโดย AI pipeline เพื่อการศึกษาเท่านั้น
            ไม่ใช่คำแนะนำการลงทุน โปรดตรวจสอบข้อมูลจากแหล่งทางการก่อนตัดสินใจใดๆ
          </footer>
        </div>
      </body>
    </html>
  );
}
