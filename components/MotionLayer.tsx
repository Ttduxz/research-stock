"use client";

import { useEffect } from "react";

/**
 * ชั้น motion ของทั้งเว็บ — mount ครั้งเดียวใน layout แล้วทำงานกับทุกหน้าเหมือนกันหมด
 *
 * ออกแบบให้ "ไม่แตะ JSX ของหน้าไหนเลย": ตัวมันเดินหา element เองจาก selector
 * แล้วติด data-attribute (ไม่ใช่ className) — React ไม่ได้จัดการ data-* ที่มันไม่ได้ render
 * เวลา component re-render (เช่นตอนกรอง/ค้นหา) จึงไม่ลบ state ของ motion ทิ้ง
 *
 * สิ่งที่ทำ:
 *   1. reveal      — fade + slide ขึ้นตอน element เลื่อนเข้า viewport (ไล่ทีละชิ้นแบบ stagger)
 *   2. count-up    — ตัวเลขหลักในการ์ด/แถบสถิติ นับจาก 0 ขึ้นไปหาค่าจริง
 *   3. chart draw  — แท่งกราฟค่อยๆ สูงขึ้น เส้นมาร์จิ้นค่อยๆ ลากตัวเอง
 *   4. scroll bar  — แถบความคืบหน้าการอ่านบนสุดของหน้า
 *
 * ทุกอย่างใช้ transform/opacity ล้วน (composited — ไม่ trigger layout reflow)
 * และปิดทั้งหมดเมื่อผู้ใช้ตั้ง prefers-reduced-motion: reduce
 */

/** element ที่จะ fade+slide เข้ามา — เลือกเฉพาะ "ก้อนเนื้อหา" ไม่ลงลึกถึงทุกบรรทัด */
const REVEAL_SELECTOR = [
  "h1",
  "h2",
  ".subtitle",
  ".crumbs",
  ".stock-head",
  ".card",
  ".rail",
  ".tbl-scroll",
  ".chart-card",
  ".note",
  ".quote",
  ".panel",
  ".empty-state",
  ".seg",
  ".scenario",
  ".tranche",
  ".stake",
  ".stock-card",
  ".filter-pills",
  ".stock-search",
  ".toc",
  ".run-picker",
  ".prose-block",
  ".rangebar",
  ".disclaimer",
].join(",");

/** ค่าตัวเลขที่จะนับขึ้น — เอาเฉพาะ "ตัวเลขพระเอก" ของแต่ละบล็อก ไม่ใช่ทุกตัวเลขในหน้า */
const COUNT_SELECTOR = [
  ".stat-v",
  ".rank-score-v",
  ".score-tile .value",
  ".sc-target",
  ".tr-price",
  ".seg-rev",
  ".stock-head .price",
  ".meter-top b",
].join(",");

const STAGGER_MS = 70;
const STAGGER_MAX = 420;
const REVEAL_MS = 580;
const COUNT_MS = 900;

export default function MotionLayer() {
  useEffect(() => {
    const root = document.documentElement;

    // สคริปต์ใน layout ตั้ง motion-off ไว้แล้วถ้าผู้ใช้ขอ reduced motion — เคารพค่านั้น ไม่ทำอะไรเลย
    if (root.classList.contains("motion-off")) return;
    if (typeof IntersectionObserver === "undefined") {
      root.classList.remove("motion-ready");
      return;
    }
    root.classList.add("motion-ready");

    const cleanupTimers = new Set<number>();

    /* ---------- 1. reveal ---------- */

    const revealIO = new IntersectionObserver(
      (entries) => {
        const shown = entries.filter((e) => e.isIntersecting);
        if (shown.length === 0) return;
        // ชิ้นที่โผล่พร้อมกันในเฟรมเดียว ให้ไล่ทีละชิ้นตามลำดับบนลงล่าง
        shown.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        shown.forEach((entry, i) => {
          const el = entry.target as HTMLElement;
          revealIO.unobserve(el);
          const delay = Math.min(i * STAGGER_MS, STAGGER_MAX);
          el.style.setProperty("--d", `${delay}ms`);
          el.dataset.rin = "";
          // พอ animate จบแล้วถอด data-reveal ทิ้ง เพื่อให้ transition ของ hover
          // กลับไปใช้ค่าของตัวมันเอง ไม่โดน transition ของ reveal (ที่มี delay) ครอบ
          // แต่คง data-rin ไว้ เพราะ CSS ของกราฟ/แถบ progress ยังอ้างอิงอยู่
          const t = window.setTimeout(() => {
            el.removeAttribute("data-reveal");
            el.style.removeProperty("--d");
            cleanupTimers.delete(t);
          }, delay + REVEAL_MS + 60);
          cleanupTimers.add(t);
        });
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.01 }
    );

    /* ---------- 2. count-up ---------- */

    // ตัวปิดงานของ count-up ที่ยังวิ่งอยู่ — ใช้บังคับให้เขียนค่าจริงกลับทันทีเมื่อจำเป็น
    const pendingCounts = new Set<() => void>();
    const finishAllCounts = () => {
      // clone ก่อนวน เพราะตัว finish จะลบตัวเองออกจาก set
      [...pendingCounts].forEach((finish) => finish());
    };

    /** นับเลขตัวแรกที่เจอในข้อความขึ้นจาก 0 แล้วคืนข้อความเดิมเป๊ะๆ ตอนจบ
     *  ทำงานระดับ text node — โครงสร้าง DOM ลูก (เช่น <small> % เปลี่ยนแปลง) จึงไม่ถูกแตะ
     *
     *  สำคัญ: หน้านี้เป็นรายงานการเงิน ตัวเลขระหว่างนับเป็นค่า "ปลอม" ชั่วคราว
     *  ถ้า rAF หยุดกลางคัน (สลับแท็บ, เบราว์เซอร์ throttle) ตัวเลขจะค้างผิดคาบนหน้าจอ
     *  จึงต้องมี setTimeout คุมอีกชั้นให้เขียนค่าจริงกลับเสมอ ไม่ว่าเฟรมจะมาหรือไม่ */
    const countUp = (el: HTMLElement) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node: Text | null = null;
      let match: RegExpMatchArray | null = null;
      while (walker.nextNode()) {
        const text = walker.currentNode as Text;
        const m = text.nodeValue?.match(/\d[\d,]*(\.\d+)?/);
        if (m) {
          node = text;
          match = m;
          break;
        }
      }
      if (!node || !match || match.index == null) return;

      const original = node.nodeValue as string;
      const raw = match[0];
      const target = parseFloat(raw.replace(/,/g, ""));
      if (!isFinite(target)) return;

      const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
      const grouped = raw.includes(",");
      const head = original.slice(0, match.index);
      const tail = original.slice(match.index + raw.length);
      const fmt = (v: number) =>
        grouped
          ? v.toLocaleString("en-US", {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            })
          : v.toFixed(decimals);

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        node.nodeValue = original; // จบที่ข้อความต้นฉบับเสมอ กัน format เพี้ยน
        window.clearTimeout(guard);
        pendingCounts.delete(finish);
      };
      // ตาข่ายนิรภัย: ถึงเวลาแล้วต้องเป็นค่าจริง แม้ไม่เคยมีเฟรมมาเลยสักเฟรม
      const guard = window.setTimeout(finish, COUNT_MS + 400);
      pendingCounts.add(finish);

      const started = performance.now();
      const tick = (now: number) => {
        if (finished) return;
        const p = Math.min(1, (now - started) / COUNT_MS);
        if (p < 1) {
          const eased = 1 - Math.pow(1 - p, 3);
          node.nodeValue = head + fmt(target * eased) + tail;
          requestAnimationFrame(tick);
        } else {
          finish();
        }
      };
      requestAnimationFrame(tick);
    };

    const countIO = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          countIO.unobserve(el);
          // แท็บถูกซ่อนอยู่ = ไม่มีเฟรม อย่าเริ่มนับ ปล่อยให้เป็นค่าจริงไปเลย
          if (document.hidden) continue;
          countUp(el);
        }
      },
      { rootMargin: "0px 0px -4% 0px", threshold: 0.2 }
    );

    /* ---------- 3. กราฟการเงิน: เส้นมาร์จิ้นลากตัวเอง ---------- */

    const chartIO = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const card = entry.target as HTMLElement;
          chartIO.unobserve(card);
          card.dataset.chartIn = "";
          const line = card.querySelector<SVGPolylineElement>(".chart-line");
          if (line && typeof line.getTotalLength === "function" && !document.hidden) {
            const len = line.getTotalLength();
            if (len > 0) {
              line.style.strokeDasharray = `${len}`;
              line.style.strokeDashoffset = `${len}`;
              requestAnimationFrame(() => {
                line.style.strokeDashoffset = "0";
              });
              // ถ้าเฟรมหยุดกลางทาง เส้นจะค้างวาดไม่สุด — ถอด dash ทิ้งเมื่อครบเวลา
              // เพื่อให้เส้นมาร์จิ้นแสดงเต็มเสมอ (เป็นข้อมูล ไม่ใช่ของประดับ)
              const t = window.setTimeout(() => {
                line.style.removeProperty("stroke-dasharray");
                line.style.removeProperty("stroke-dashoffset");
                cleanupTimers.delete(t);
              }, 1600);
              cleanupTimers.add(t);
            }
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.1 }
    );

    /* ---------- ติดป้ายให้ element ที่ยังไม่เคยถูกจัดการ ---------- */

    const tag = () => {
      document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach((el) => {
        if (el.dataset.reveal !== undefined || el.dataset.rin !== undefined) return;
        if (el.closest(".md")) return; // หัวข้อ/ย่อหน้าใน markdown ไม่ต้อง reveal ทีละอัน
        el.dataset.reveal = "";
        revealIO.observe(el);
      });

      document.querySelectorAll<HTMLElement>(COUNT_SELECTOR).forEach((el) => {
        if (el.dataset.cu !== undefined) return;
        el.dataset.cu = "";
        countIO.observe(el);
      });

      document.querySelectorAll<HTMLElement>(".chart-card").forEach((el) => {
        if (el.dataset.chart !== undefined) return;
        el.dataset.chart = "";
        chartIO.observe(el);
      });
    };

    tag();

    // เนื้อหาที่ render ใหม่ฝั่ง client (ผลค้นหา, ปุ่มกรอง insights, เปลี่ยนหน้าแบบ client nav)
    // ต้องถูกติดป้ายเพิ่ม — รวบการเรียกไว้เฟรมละครั้งกัน layout thrash
    let queued = false;
    const mo = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        tag();
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });

    /* ---------- ตาข่ายนิรภัย ----------
     * reveal ซ่อนเนื้อหาไว้ก่อนแล้วรอ IntersectionObserver มาสั่งให้โผล่
     * แต่เบราว์เซอร์ส่ง callback ของ IO ตอนจบเฟรม — ถ้า renderer ไม่ผลิตเฟรมเลย
     * (แท็บถูก throttle หนัก, หน้าต่างถูกซ่อน, บาง embedded webview)
     * callback จะไม่มาสักที แล้วผู้ใช้จะเจอหน้าว่างเปล่า
     * กันด้วย 2 ชั้น: ถ้าไม่มีเฟรมเลย → ปิด motion ทิ้งทั้งหมด (เนื้อหาโผล่ครบทันที)
     *                 ถ้ามีเฟรมแต่ยังมีของค้างอยู่ในจอ → บังคับให้โผล่
     */
    let sawFrame = false;
    requestAnimationFrame(() => {
      sawFrame = true;
    });

    const disableMotion = () => {
      root.classList.remove("motion-ready");
      revealIO.disconnect();
      countIO.disconnect();
      chartIO.disconnect();
      finishAllCounts(); // ตัวเลขที่กำลังนับอยู่ ต้องกลับไปเป็นค่าจริงทันที
      document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
        el.removeAttribute("data-reveal");
        el.style.removeProperty("--d");
      });
    };

    // สลับแท็บออกไป = เบราว์เซอร์หยุดส่งเฟรม ตัวเลขที่นับค้างอยู่จะโชว์ค่าผิด
    // → บังคับให้เขียนค่าจริงกลับทันทีที่หน้าถูกซ่อน
    const onVisibility = () => {
      if (document.hidden) finishAllCounts();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const noFrameGuard = window.setTimeout(() => {
      cleanupTimers.delete(noFrameGuard);
      if (!sawFrame) disableMotion();
    }, 900);
    cleanupTimers.add(noFrameGuard);

    const stuckGuard = window.setTimeout(() => {
      cleanupTimers.delete(stuckGuard);
      if (!sawFrame) return; // เคสไม่มีเฟรม จัดการไปแล้วข้างบน
      const vh = window.innerHeight;
      document.querySelectorAll<HTMLElement>("[data-reveal]:not([data-rin])").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < vh && r.bottom > 0) {
          el.dataset.rin = "";
          el.removeAttribute("data-reveal");
        }
      });
    }, 2600);
    cleanupTimers.add(stuckGuard);

    /* ---------- 4. แถบความคืบหน้าการอ่าน ---------- */

    const applyProgress = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 8 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      root.style.setProperty("--sp", p.toFixed(4));
    };
    let scrollQueued = false;
    const onScroll = () => {
      if (scrollQueued) return;
      scrollQueued = true;
      requestAnimationFrame(() => {
        scrollQueued = false;
        applyProgress();
      });
    };
    applyProgress(); // ตั้งค่าแรกแบบ sync ไม่ต้องรอเฟรม
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      revealIO.disconnect();
      countIO.disconnect();
      chartIO.disconnect();
      mo.disconnect();
      finishAllCounts();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cleanupTimers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  return null;
}
