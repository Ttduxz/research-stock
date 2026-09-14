"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * เมนูหลักแบบแถบซ้ายเต็มความสูง พับเข้าซ้ายได้ — แทนแถบลิงก์แนวนอนที่รกขึ้นทุกครั้งที่เพิ่มหน้า
 *
 * จอกว้าง (≥1024px): เปิดเป็นค่าเริ่มต้น เนื้อหาหลบไปทางขวา พับแล้วจำไว้ใน localStorage
 *   — สคริปต์ SIDEBAR_BOOT ใน layout.tsx ใส่คลาส sb-collapsed ก่อนวาดหน้า กันแถบโผล่แล้วค่อยหุบ
 * จอแคบ: ซ่อนเป็นค่าเริ่มต้น กดแล้วเลื่อนออกมาทับเนื้อหา ปิดเมื่อกดฉากหลัง / Esc / เปลี่ยนหน้า
 * สถานะจริงอยู่ที่คลาสบน <html> (sb-collapsed / sb-open) ให้ CSS คุมทั้งหมด state ในนี้แค่สะท้อนไว้ทำ aria
 */

const READ_LINKS = [
  { href: "/", label: "หุ้นทั้งหมด", desc: "รายชื่อหุ้นที่วิเคราะห์แล้ว" },
  { href: "/best-price", label: "ราคาน่าสนใจ", desc: "จัดอันดับจากราคาตลาดตอนนี้" },
  { href: "/insights", label: "Insights", desc: "ประเด็นที่กระทบทั้งอุตสาหกรรม" },
  { href: "/track-record", label: "Track Record", desc: "ทฤษฎีที่เคยตั้งไว้ แม่นแค่ไหน" },
];

const DESKTOP = "(min-width: 1024px)";

export default function SiteSidebar({
  email,
  admin,
  signOutAction,
}: {
  email: string;
  admin: boolean;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [desktop, setDesktop] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  /** หน้าที่เพิ่งกด แต่ server ยังส่งมาไม่ถึง — ไฮไลต์ทันที + โชว์แถบโหลด ให้รู้ว่ากดติดแล้ว (ข้อมูลอยู่ us-east ใช้เวลาเกือบวินาที) */
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    const sync = () => {
      setDesktop(mq.matches);
      if (mq.matches) setMobileOpen(false);
    };
    sync();
    setCollapsed(document.documentElement.classList.contains("sb-collapsed"));
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setPending(null);
  }, [pathname]);

  useEffect(() => {
    document.documentElement.classList.toggle("sb-open", mobileOpen);
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const toggle = () => {
    if (!window.matchMedia(DESKTOP).matches) {
      setMobileOpen((v) => !v);
      return;
    }
    const next = !collapsed;
    setCollapsed(next);
    document.documentElement.classList.toggle("sb-collapsed", next);
    try {
      localStorage.setItem("sb-collapsed", next ? "1" : "0");
    } catch {
      // private mode / storage ถูกบล็อก — พับได้ในหน้านี้ แค่ไม่จำข้ามหน้า
    }
  };

  const expanded = desktop ? !collapsed : mobileOpen;

  // หน้าย่อยนับเป็นหมวดเดียวกับหน้าแม่ (เช่น /insights/<slug> ไฮไลต์ Insights) ยกเว้นหน้าแรกที่ต้องตรงเป๊ะ
  // ระหว่างรอหน้าใหม่ ให้ไฮไลต์หน้าที่กดไปแล้ว ไม่ใช่หน้าที่กำลังจะออก
  const current = pending ?? pathname;
  const isActive = (href: string) => (href === "/" ? current === "/" : current.startsWith(href));

  const item = (href: string, label: string, desc?: string, extra = "") => (
    <Link
      key={href}
      href={href}
      className={`menu-link ${extra} ${isActive(href) ? "active" : ""}`}
      aria-current={isActive(href) ? "page" : undefined}
      onClick={(e) => {
        // เปิดแท็บใหม่ (ctrl/cmd/shift/กลางเมาส์) หรือกดหน้าเดิม = ไม่มีการเปลี่ยนหน้าในแท็บนี้ ไม่ต้องขึ้นสถานะรอ
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || href === pathname) return;
        setPending(href);
      }}
    >
      <span className="menu-link-label">{label}</span>
      {desc && <span className="menu-link-desc">{desc}</span>}
    </Link>
  );

  return (
    <>
      {pending && <div className="nav-progress" role="progressbar" aria-label="กำลังเปิดหน้า" />}
      <button
        type="button"
        className={`sb-toggle ${expanded ? "open" : ""}`}
        aria-expanded={expanded}
        aria-controls="site-sidebar"
        aria-label={expanded ? "พับเมนู" : "เปิดเมนู"}
        title={expanded ? "พับเมนู" : "เปิดเมนู"}
        onClick={toggle}
      >
        <span className="sb-bars" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>

      <nav id="site-sidebar" className="sidebar" aria-label="เมนูหลัก">
        <div className="menu-section">
          <div className="menu-heading">ของฉัน</div>
          {item("/watchlist", "หุ้นที่ฉันติดตาม", "หุ้นที่กด ☆ ไว้ + ผลทบทวนล่าสุด")}
        </div>

        <div className="menu-section">
          <div className="menu-heading">อ่านรายงาน</div>
          {READ_LINKS.map((l) => item(l.href, l.label, l.desc))}
        </div>

        <div className="menu-section">
          <div className="menu-heading">สนับสนุน</div>
          {item("/donate", "Donate", "เลี้ยงกาแฟคนทำระบบผ่าน PromptPay", "menu-donate")}
        </div>

        {admin && (
          <div className="menu-section">
            <div className="menu-heading">ผู้ดูแล</div>
            {item("/admin/logs", "Log การเข้าใช้")}
          </div>
        )}

        <div className="menu-account">
          <span className="menu-email" title={email}>
            {email}
          </span>
          <form action={signOutAction}>
            <button type="submit" className="menu-signout">
              ออกจากระบบ
            </button>
          </form>
        </div>
      </nav>

      {mobileOpen && <div className="sb-backdrop" onClick={() => setMobileOpen(false)} aria-hidden="true" />}
    </>
  );
}
