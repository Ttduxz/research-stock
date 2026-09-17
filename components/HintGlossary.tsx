"use client";

import { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import type { HintGlossaryTerm } from "@/lib/db";

/**
 * ศัพท์ที่ต้องรู้ก่อนอ่าน — 2 ส่วนในคอมโพเนนต์เดียว:
 *   1. กล่องรายการคำ (ชิป) กดแล้วกางความหมาย
 *   2. ไฮไลต์คำเหล่านั้นในเนื้อหารายงาน (`.md` ที่อยู่ใน scope) — แตะ/ชี้แล้วเห็นความหมายตรงนั้นเลย ไม่ต้องเลื่อนกลับขึ้นมา
 *
 * การไฮไลต์ทำกับ text node ล้วน (ไม่แตะ HTML ที่ marked สร้าง) และข้าม a/code/h2/h3 — จำกัด 3 ครั้งแรกต่อคำ
 */
export default function HintGlossary({ terms, scope }: { terms: HintGlossaryTerm[]; scope: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const defs = useMemo(
    () => terms.map((t) => ({ ...t, html: marked.parseInline(t.meaning_md.replace(/~/g, "\\~"), { async: false }) as string })),
    [terms]
  );

  useEffect(() => {
    const root = document.querySelector(scope);
    if (!root || !terms.length) return;
    const marked_: HTMLElement[] = [];
    const counts = new Map<string, number>();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentElement;
        if (!p || p.closest("a, code, pre, h2, h3, .gl, .hv")) return NodeFilter.FILTER_REJECT;
        return node.nodeValue && node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    const textNodes: Text[] = [];
    let n: Node | null;
    while ((n = walker.nextNode())) textNodes.push(n as Text);

    const patterns = terms.map((t) => {
      const esc = t.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // คำละติน (CDS, spread) ต้องเป็นคำเต็ม — คำไทยไม่มีช่องว่างคั่น ใช้ substring
      const latin = /^[A-Za-z0-9 .&/-]+$/.test(t.term);
      return { term: t.term, re: new RegExp(latin ? `(?<![A-Za-z0-9])${esc}(?![A-Za-z0-9])` : esc, latin ? "i" : "") };
    });

    for (const node of textNodes) {
      let text = node.nodeValue ?? "";
      // หา match แรกสุดในโหนดนี้ (ทีละคำ) แล้วแยกโหนด — วนจนไม่มีคำเหลือ
      let guard = 0;
      let cur: Text = node;
      while (guard++ < 12) {
        let best: { idx: number; len: number; term: string } | null = null;
        for (const p of patterns) {
          if ((counts.get(p.term) ?? 0) >= 3) continue;
          const m = p.re.exec(text);
          if (m && (best == null || m.index < best.idx)) best = { idx: m.index, len: m[0].length, term: p.term };
        }
        if (!best) break;
        const after = cur.splitText(best.idx);
        const rest = after.splitText(best.len);
        const span = document.createElement("span");
        span.className = "gl";
        span.tabIndex = 0;
        span.dataset.term = best.term;
        span.setAttribute("role", "button");
        span.setAttribute("aria-label", `ความหมายของ ${best.term}`);
        span.textContent = after.nodeValue;
        after.replaceWith(span);
        marked_.push(span);
        counts.set(best.term, (counts.get(best.term) ?? 0) + 1);
        cur = rest;
        text = rest.nodeValue ?? "";
      }
    }

    // tooltip เดียวทั้งหน้า ย้ายไปใต้คำที่ถูกแตะ/ชี้ — กันซ้อนกันและกันล้นจอบนมือถือ
    const tip = document.createElement("div");
    tip.className = "gl-tip";
    tip.setAttribute("role", "tooltip");
    document.body.appendChild(tip);
    let current: HTMLElement | null = null;
    const show = (el: HTMLElement) => {
      const d = defs.find((x) => x.term === el.dataset.term);
      if (!d) return;
      tip.innerHTML = `<b>${escapeHtml(d.term)}</b> ${d.html}`;
      const r = el.getBoundingClientRect();
      const w = Math.min(340, window.innerWidth - 24);
      let left = r.left + r.width / 2 - w / 2;
      left = Math.max(12, Math.min(window.innerWidth - w - 12, left));
      tip.style.width = `${w}px`;
      tip.style.left = `${left + window.scrollX}px`;
      tip.style.top = `${r.bottom + 8 + window.scrollY}px`;
      tip.classList.add("is-on");
      current?.classList.remove("is-on");
      el.classList.add("is-on");
      current = el;
    };
    const hide = () => {
      tip.classList.remove("is-on");
      current?.classList.remove("is-on");
      current = null;
    };
    const onOver = (e: Event) => show(e.currentTarget as HTMLElement);
    const onClick = (e: Event) => {
      const el = e.currentTarget as HTMLElement;
      if (current === el && tip.classList.contains("is-on")) hide();
      else show(el);
    };
    const onDoc = (e: Event) => {
      if (!(e.target as HTMLElement).closest(".gl, .gl-tip")) hide();
    };
    for (const el of marked_) {
      el.addEventListener("mouseenter", onOver);
      el.addEventListener("focus", onOver);
      el.addEventListener("click", onClick);
      el.addEventListener("mouseleave", hide);
      el.addEventListener("blur", hide);
    }
    document.addEventListener("click", onDoc);
    return () => {
      document.removeEventListener("click", onDoc);
      tip.remove();
      for (const el of marked_) el.replaceWith(document.createTextNode(el.textContent ?? ""));
      root.normalize();
    };
  }, [terms, defs, scope]);

  if (!terms.length) return null;
  return (
    <section className="gl-box" aria-label="ศัพท์ที่ต้องรู้ก่อนอ่าน">
      <div className="gl-box-head">
        <span className="gl-box-k">ศัพท์ที่ต้องรู้ก่อนอ่าน</span>
        <span className="gl-box-n">แตะคำที่ขีดเส้นในรายงานเพื่อดูความหมายได้เลย</span>
      </div>
      <div className="gl-chips">
        {defs.map((d, i) => (
          <button
            type="button"
            key={i}
            className={`gl-chip ${open === i ? "is-open" : ""}`}
            aria-expanded={open === i}
            onClick={() => setOpen(open === i ? null : i)}
          >
            {d.term}
          </button>
        ))}
      </div>
      {open != null && (
        <p className="gl-def">
          <b>{defs[open].term}</b> <span dangerouslySetInnerHTML={{ __html: defs[open].html }} />
        </p>
      )}
    </section>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
