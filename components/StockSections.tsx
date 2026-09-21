"use client";

import { useEffect, useRef, useState } from "react";

/**
 * กล่องรวมหัวข้อพับได้ของหน้าหุ้น (/stock/[ticker]) — หน้านี้เคยยาว ~39 จอ ทุกหัวข้อจึงพับไว้ก่อน
 * 1) ลิงก์ที่มี #id (เช่น #theories, #pl) ยังใช้ได้: เปิด <details> ที่ห่อ id นั้นทุกชั้นแล้วเลื่อนไปหา
 * 2) ปุ่ม "เปิดทั้งหมด / พับทั้งหมด" — ให้ค้นด้วย Ctrl+F หรืออ่านรวดเดียวได้เหมือนหน้าเดิม
 * ตัวหัวข้อเป็น <details> ธรรมดา (server render) — ไม่มี JS ก็ยังกดเปิดได้
 */
export default function StockSections({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [allOpen, setAllOpen] = useState(false);

  useEffect(() => {
    const openFor = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const el = document.getElementById(id);
      if (!el || !ref.current?.contains(el)) return;
      let d: HTMLDetailsElement | null = el instanceof HTMLDetailsElement ? el : el.closest("details");
      while (d) {
        d.open = true;
        d = d.parentElement?.closest("details") ?? null;
      }
      requestAnimationFrame(() => el.scrollIntoView({ block: "start" }));
    };
    openFor();
    window.addEventListener("hashchange", openFor);
    return () => window.removeEventListener("hashchange", openFor);
  }, []);

  // ปุ่มบอกสถานะตามที่เห็นจริง — ผู้ใช้เปิด/พับเองทีละหัวข้อ ปุ่มก็เปลี่ยนตาม
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const sync = () => {
      const secs = Array.from(root.querySelectorAll<HTMLDetailsElement>("details.sp-sec"));
      setAllOpen(secs.length > 0 && secs.every((d) => d.open));
    };
    root.addEventListener("toggle", sync, true);
    return () => root.removeEventListener("toggle", sync, true);
  }, []);

  const toggleAll = () => {
    const next = !allOpen;
    ref.current?.querySelectorAll<HTMLDetailsElement>("details.sp-sec").forEach((d) => {
      d.open = next;
    });
    setAllOpen(next);
  };

  return (
    <div className="sp-secs" ref={ref}>
      <div className="sp-secs-head">
        <h2 className="sp-secs-title">รายงานฉบับเต็ม</h2>
        <button type="button" className="sp-toggle-all" onClick={toggleAll} aria-pressed={allOpen}>
          {allOpen ? "พับทั้งหมด" : "เปิดทั้งหมด"}
        </button>
      </div>
      {children}
    </div>
  );
}
