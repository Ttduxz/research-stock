"use client";

import { useEffect, useRef, useState } from "react";

/** กล่องของ item ที่ active — ใช้ขยับแถบไฮไลต์ให้ไหลตามแทนการสลับสีทันที */
type Box = { l: number; t: number; w: number; h: number };

/** TOC ของหน้าหุ้น (ยาวหลาย section) — ไฮไลต์หัวข้อที่กำลังอ่านอยู่ตอนเลื่อนหน้า กันหลงในหน้ายาวๆ */
export default function TocNav({ items }: { items: { id: string; label: string }[] }) {
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);
  const [box, setBox] = useState<Box | null>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const headings = items
      .map((t) => document.getElementById(t.id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        // เอา heading ที่อยู่ใกล้ขอบบนสุดของ viewport ที่สุดในบรรดาที่กำลังมองเห็นอยู่
        const top = visible.reduce((a, b) =>
          a.boundingClientRect.top < b.boundingClientRect.top ? a : b
        );
        setActiveId(top.target.id);
      },
      // ไม่มี sticky header ในเว็บนี้ — โซนตรวจจับคือ 30% บนของ viewport ล้วนๆ ไม่ต้องหักด้านบน
      { rootMargin: "0px 0px -70% 0px", threshold: 0 }
    );
    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [items]);

  // วัดตำแหน่ง item ที่ active แล้วส่งให้แถบไฮไลต์เลื่อนไปทับ
  // (แถบเริ่มจากไม่มีอยู่จริงจนกว่าจะวัดได้ จึงไม่มีปัญหา hydration mismatch)
  useEffect(() => {
    const measure = () => {
      const nav = navRef.current;
      if (!nav) return;
      const el = nav.querySelector<HTMLElement>("a[data-active]");
      if (!el) {
        setBox(null);
        return;
      }
      setBox({ l: el.offsetLeft, t: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeId, items]);

  return (
    // toc-numbered = ให้ CSS เติมเลขลำดับ 01, 02, ... ให้เอง
    // (หน้า /research/ai-financing-web มี .toc แบบเขียนเลขไว้ในข้อความเองแล้ว จึงไม่ใส่คลาสนี้)
    <nav className="toc toc-numbered" aria-label="หัวข้อในหน้า" ref={navRef}>
      {box && (
        <span
          className="nav-slider"
          aria-hidden="true"
          style={{ transform: `translate(${box.l}px, ${box.t}px)`, width: box.w, height: box.h }}
        />
      )}
      {items.map((t) => (
        <a
          key={t.id}
          href={`#${t.id}`}
          className={t.id === activeId ? "active" : undefined}
          data-active={t.id === activeId ? "" : undefined}
        >
          {t.label}
        </a>
      ))}
    </nav>
  );
}
