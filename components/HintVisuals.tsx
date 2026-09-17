"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { marked } from "marked";
import type {
  HintVisual,
  HintVisualBars,
  HintVisualCompare,
  HintVisualFlow,
  HintVisualScale,
  HintVisualTimeline,
} from "@/lib/db";

/**
 * ภาพประกอบของรายงาน hint — วาดจาก JSON spec (pipeline/hint-visuals-spec.md) ฝั่งเว็บล้วน
 * agent ไม่เคยส่ง SVG/HTML มา: ทุกภาพเป็นข้อมูล (ตัวเลข/กล่อง/เส้น) ที่ scripts/hint-visuals.mjs ตรวจแล้วว่าตรงกับเนื้อหา
 *
 * ทุกภาพเล่น animation ตอนเลื่อนเข้าจอ (ครั้งเดียว) และเคารพ prefers-reduced-motion
 * ชนิด: bars (เทียบขนาด) · compare (ก่อน/หลัง) · flow (การไหล + เล่นทีละขั้น) · scale (ตำแหน่งบนช่วง) · timeline (ลำดับ+สะสม)
 */
export default function HintVisualFigure({ visual }: { visual: HintVisual }) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -12% 0px" });
  const reduced = useReducedMotion();
  const go = inView || !!reduced;

  return (
    <figure className={`hv type-${visual.type}`} ref={ref} data-visual={visual.id}>
      <figcaption className="hv-head">
        <span className="hv-kind">{KIND_LABEL[visual.type]}</span>
        <span className="hv-title">{visual.title}</span>
      </figcaption>
      {visual.type === "bars" && <Bars v={visual} go={go} />}
      {visual.type === "compare" && <Compare v={visual} go={go} />}
      {visual.type === "flow" && <Flow v={visual} go={go} />}
      {visual.type === "scale" && <Scale v={visual} go={go} />}
      {visual.type === "timeline" && <Timeline v={visual} go={go} />}
      <div className="hv-read">
        <span className="hv-read-k">อ่านภาพ</span>
        <Inline md={visual.read_md} />
      </div>
    </figure>
  );
}

const KIND_LABEL: Record<HintVisual["type"], string> = {
  bars: "เทียบขนาด",
  compare: "ก่อน → หลัง",
  flow: "เงินไหลไปไหน",
  scale: "อยู่ตรงไหนบนสเกล",
  timeline: "ลำดับเหตุการณ์",
};

function Inline({ md, className }: { md: string; className?: string }) {
  const html = useMemo(() => marked.parseInline(md.replace(/~/g, "\\~"), { async: false }) as string, [md]);
  return <span className={className ?? "md-inline"} dangerouslySetInnerHTML={{ __html: html }} />;
}

/* ---------- utils ---------- */

const EASE = [0.22, 0.61, 0.36, 1] as const;

function fmtNum(n: number) {
  const a = Math.abs(n);
  const s = a >= 100 ? a.toFixed(0) : a >= 10 ? (Number.isInteger(a) ? String(a) : a.toFixed(1)) : Number.isInteger(a) ? String(a) : a.toFixed(a < 1 ? 2 : 1);
  return (n < 0 ? "-" : "") + s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** นับเลขขึ้นจาก 0 → target เมื่อ go เป็นจริง (ease-out) — คืนค่าปัจจุบัน */
function useCountUp(target: number, go: boolean, delay = 0, duration = 900) {
  const reduced = useReducedMotion();
  const [v, setV] = useState(reduced ? target : 0);
  useEffect(() => {
    if (!go) return;
    if (reduced) {
      setV(target);
      return;
    }
    let raf = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start - delay) / duration);
      if (p < 0) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const e = 1 - Math.pow(1 - p, 3);
      setV(target * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else setV(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [go, target, delay, duration, reduced]);
  return v;
}

function CountText({ value, go, delay, display, unit }: { value: number; go: boolean; delay?: number; display?: string; unit?: string }) {
  const v = useCountUp(value, go, delay);
  const done = v === value;
  // ตอนนับถึงค่าจริงแล้วค่อยสลับเป็น display ของรายงาน (เช่น "$230-240B") — ระหว่างนับโชว์ตัวเลขดิบ
  if (done && display) return <>{display}</>;
  return (
    <>
      {fmtNum(v)}
      {unit && !display ? <span className="hv-unit"> {unit}</span> : null}
    </>
  );
}

/* ---------- bars: เทียบขนาด ---------- */

function Bars({ v, go }: { v: HintVisualBars; go: boolean }) {
  const max = Math.max(...v.items.map((i) => i.value), 0) || 1;
  const [active, setActive] = useState<number | null>(null);
  const shown = active ?? v.items.length - 1;
  const cur = v.items[shown];
  return (
    <div className="hv-body">
      <div className="hv-bars" role="img" aria-label={v.items.map((i) => `${i.label} ${i.display ?? i.value}`).join(", ")}>
        {v.items.map((it, i) => {
          const h = Math.max(2, (Math.abs(it.value) / max) * 100);
          const kind = it.kind ?? "base";
          return (
            <button
              type="button"
              key={i}
              className={`hv-bar-col ${shown === i ? "is-active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              aria-label={`${it.label}: ${it.display ?? it.value}`}
            >
              <span className="hv-bar-v">
                <CountText value={it.value} go={go} delay={i * 140} display={it.display} />
              </span>
              <span className="hv-bar-track">
                <motion.span
                  className={`hv-bar k-${kind}`}
                  initial={{ height: "0%" }}
                  animate={go ? { height: `${h}%` } : { height: "0%" }}
                  transition={{ duration: 0.9, delay: i * 0.14, ease: EASE }}
                />
              </span>
              <span className="hv-bar-l">{it.label}</span>
            </button>
          );
        })}
      </div>
      <div className="hv-legend">
        {v.unit && <span className="hv-unit-tag">หน่วย {v.unit}</span>}
        {v.items.some((i) => i.kind === "est") && (
          <span>
            <i className="hv-sw k-est" /> คาดการณ์
          </span>
        )}
        {v.items.some((i) => i.kind === "hot") && (
          <span>
            <i className="hv-sw k-hot" /> จุดที่เรื่องนี้พูดถึง
          </span>
        )}
      </div>
      <div className="hv-caption" aria-live="polite">
        <b>{cur.label}</b> {cur.display ?? `${fmtNum(cur.value)}${v.unit ? " " + v.unit : ""}`}
        {cur.note && <span className="hv-note"> · {cur.note}</span>}
        {shown > 0 && v.items[0].value !== 0 && (
          <span className="hv-note"> · {(cur.value / v.items[0].value).toFixed(1)}× ของ{v.items[0].label}</span>
        )}
      </div>
    </div>
  );
}

/* ---------- compare: ก่อน → หลัง ---------- */

function Compare({ v, go }: { v: HintVisualCompare; go: boolean }) {
  const max = Math.max(...v.items.flatMap((i) => [i.before, i.after]), 0) || 1;
  return (
    <div className="hv-body">
      <div className="hv-cmp-head">
        <span>
          <i className="hv-sw k-before" /> {v.before_label}
        </span>
        <span>
          <i className="hv-sw k-after" /> {v.after_label}
        </span>
        {v.unit && <span className="hv-unit-tag">หน่วย {v.unit}</span>}
      </div>
      <div className="hv-cmp" role="img" aria-label={v.items.map((i) => `${i.label} ${i.before} → ${i.after}`).join(", ")}>
        {v.items.map((it, i) => {
          const b = (it.before / max) * 100;
          const a = (it.after / max) * 100;
          const delta = it.after - it.before;
          const up = delta > 0;
          const pct = it.before !== 0 ? (delta / it.before) * 100 : 0;
          const d0 = i * 0.18;
          return (
            <div className="hv-cmp-row" key={i}>
              <div className="hv-cmp-l">{it.label}</div>
              <div className="hv-cmp-track">
                <motion.span
                  className="hv-cmp-bar k-before"
                  initial={{ width: 0 }}
                  animate={go ? { width: `${b}%` } : { width: 0 }}
                  transition={{ duration: 0.7, delay: d0, ease: EASE }}
                />
                <motion.span
                  className={`hv-cmp-bar k-after ${up ? "is-up" : "is-down"}`}
                  style={{ left: `${Math.min(a, b)}%` }}
                  initial={{ width: 0, opacity: 0 }}
                  animate={go ? { width: `${Math.abs(a - b)}%`, opacity: 1 } : { width: 0, opacity: 0 }}
                  transition={{ duration: 0.6, delay: d0 + 0.7, ease: EASE }}
                />
                <motion.span
                  className="hv-cmp-tip k-before"
                  style={{ left: `${b}%` }}
                  initial={{ opacity: 0 }}
                  animate={go ? { opacity: 1 } : { opacity: 0 }}
                  transition={{ delay: d0 + 0.6 }}
                />
                <motion.span
                  className="hv-cmp-tip k-after"
                  style={{ left: `${a}%` }}
                  initial={{ opacity: 0 }}
                  animate={go ? { opacity: 1 } : { opacity: 0 }}
                  transition={{ delay: d0 + 1.2 }}
                />
              </div>
              <div className="hv-cmp-v">
                <span className="k-before">{fmtNum(it.before)}</span>
                <span className="hv-arrow">→</span>
                <span className="k-after">
                  <CountText value={it.after} go={go} delay={(d0 + 0.7) * 1000} />
                </span>
                <motion.span
                  className={`hv-delta ${up ? "is-up" : "is-down"}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={go ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }}
                  transition={{ delay: d0 + 1.25 }}
                >
                  {up ? "+" : ""}
                  {fmtNum(delta)}
                  {it.before !== 0 && <small> ({pct > 0 ? "+" : ""}{pct.toFixed(0)}%)</small>}
                </motion.span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- flow: การไหล + เล่นทีละขั้น ---------- */

const FW = 680;
const NODE_H = 60;
const ROW_GAP = 64;
const PAD_X = 16;
const PAD_Y = 44; // เผื่อป้ายบนลูกศรที่ยกขึ้นเหนือแถวบนสุด / ลงใต้แถวล่างสุด (ป้ายสูง 20 + ระยะ 12 จากขอบกล่อง)

function Flow({ v, go }: { v: HintVisualFlow; go: boolean }) {
  const reduced = useReducedMotion();
  // บีบ col/row ที่ agent ให้มาเป็นลำดับต่อเนื่อง (ถ้าใช้แค่ row 2-3 ก็ไม่ต้องเว้นแถว 1 ว่างไว้)
  const colIdx = [...new Set(v.nodes.map((n) => n.col))].sort((a, b) => a - b);
  const rowIdx = [...new Set(v.nodes.map((n) => n.row))].sort((a, b) => a - b);
  const cols = colIdx.length;
  const rows = rowIdx.length;
  const gapX = cols > 2 ? 44 : 64;
  const nodeW = Math.floor((FW - PAD_X * 2 - gapX * (cols - 1)) / cols);
  const H = PAD_Y * 2 + rows * NODE_H + (rows - 1) * ROW_GAP;

  const pos = useMemo(() => {
    const m = new Map<string, { x: number; y: number; w: number; h: number; cx: number; cy: number }>();
    for (const n of v.nodes) {
      const x = PAD_X + colIdx.indexOf(n.col) * (nodeW + gapX);
      const y = PAD_Y + rowIdx.indexOf(n.row) * (NODE_H + ROW_GAP);
      m.set(n.id, { x, y, w: nodeW, h: NODE_H, cx: x + nodeW / 2, cy: y + NODE_H / 2 });
    }
    return m;
  }, [v.nodes, nodeW, gapX, colIdx, rowIdx]);

  // เส้นสวนทางระหว่างกล่องคู่เดียวกัน (A→B และ B→A) ต้องเยื้องกัน ไม่งั้นทับกันสนิท
  const edges = useMemo(() => {
    const seen = new Map<string, number>();
    return v.edges.map((e) => {
      const key = [e.from, e.to].sort().join("|");
      const n = seen.get(key) ?? 0;
      seen.set(key, n + 1);
      const twin = v.edges.some((o) => o.from === e.to && o.to === e.from);
      const offset = twin ? (e.from < e.to ? -11 : 11) : 0;
      return { ...e, key: `${e.from}>${e.to}`, offset, d: edgePath(pos.get(e.from)!, pos.get(e.to)!, offset) };
    });
  }, [v.edges, pos]);

  // stepper
  const steps = v.steps && v.steps.length >= 2 ? v.steps : null;
  const [step, setStep] = useState(-1); // -1 = ยังไม่เริ่ม (โชว์ทุกเส้น)
  const [playing, setPlaying] = useState(false);
  const startedRef = useRef(false);
  useEffect(() => {
    if (!steps || !go || startedRef.current) return;
    startedRef.current = true;
    if (reduced) return;
    // เริ่มเล่นเองหลังเส้นวาดเสร็จ — วนครบแล้วหยุดค้างที่ขั้นสุดท้าย
    const t = setTimeout(() => {
      setStep(0);
      setPlaying(true);
    }, 1400);
    return () => clearTimeout(t);
  }, [steps, go, reduced]);
  useEffect(() => {
    if (!playing || !steps) return;
    const t = setTimeout(() => {
      if (step >= steps.length - 1) setPlaying(false);
      else setStep(step + 1);
    }, 3200);
    return () => clearTimeout(t);
  }, [playing, step, steps]);

  const activeEdges = steps && step >= 0 ? new Set(steps[step].edges) : null;

  return (
    <div className="hv-body">
      <div className="chart-scroll hv-flow-scroll">
        <svg viewBox={`0 0 ${FW} ${H}`} className="hv-flow" role="img" aria-label={v.title}>
          <defs>
            <marker id={`hv-arr-${v.id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          </defs>
          {edges.map((e, i) => {
            const dim = activeEdges ? !activeEdges.has(e.key) : false;
            const kind = e.kind ?? "money";
            return (
              <g key={e.key + i} className={`hv-edge k-${kind} ${dim ? "is-dim" : ""} ${activeEdges && !dim ? "is-hot" : ""}`}>
                <motion.path
                  d={e.d}
                  fill="none"
                  markerEnd={`url(#hv-arr-${v.id})`}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={go ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                  transition={{ duration: 0.8, delay: 0.5 + i * 0.18, ease: EASE }}
                />
                {/* เส้นวิ่ง (dash ไหล) ซ้อนบนเส้นหลัก — โชว์ทิศทางการไหลตลอดเวลา */}
                <path d={e.d} fill="none" className="hv-edge-flow" />
                {e.label && <EdgeLabel d={e.d} text={e.label} go={go} delay={0.9 + i * 0.18} side={e.offset} />}
              </g>
            );
          })}
          {v.nodes.map((n, i) => {
            const p = pos.get(n.id)!;
            const touched = activeEdges ? [...activeEdges].some((k) => k.split(">").includes(n.id)) : true;
            return (
              <motion.g
                key={n.id}
                className={`hv-node k-${n.kind ?? "neutral"} ${activeEdges && !touched ? "is-dim" : ""}`}
                initial={{ opacity: 0, y: 8 }}
                animate={go ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
                transition={{ duration: 0.5, delay: i * 0.1, ease: EASE }}
              >
                <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="9" />
                <text x={p.cx} y={p.y + (n.sub ? 25 : 35)} textAnchor="middle" className="hv-node-t">
                  {n.label}
                </text>
                {n.sub && (
                  <text x={p.cx} y={p.y + 44} textAnchor="middle" className="hv-node-s">
                    {n.sub}
                  </text>
                )}
              </motion.g>
            );
          })}
        </svg>
      </div>
      {steps && (
        <div className="hv-steps">
          <div className="hv-steps-bar">
            <button type="button" className="hv-btn" onClick={() => { setPlaying(false); setStep((s) => Math.max(0, s - 1)); }} disabled={step <= 0} aria-label="ขั้นก่อนหน้า">
              ‹
            </button>
            <div className="hv-steps-dots" role="tablist">
              {steps.map((s, i) => (
                <button
                  type="button"
                  key={i}
                  role="tab"
                  aria-selected={step === i}
                  className={`hv-dot ${step === i ? "is-on" : ""} ${step > i ? "is-done" : ""}`}
                  onClick={() => { setPlaying(false); setStep(i); }}
                  aria-label={s.title}
                />
              ))}
            </div>
            <button type="button" className="hv-btn" onClick={() => { setPlaying(false); setStep((s) => Math.min(steps.length - 1, s + 1)); }} disabled={step >= steps.length - 1} aria-label="ขั้นถัดไป">
              ›
            </button>
            <button
              type="button"
              className="hv-btn hv-play"
              onClick={() => {
                if (playing) setPlaying(false);
                else {
                  setStep(step >= steps.length - 1 || step < 0 ? 0 : step);
                  setPlaying(true);
                }
              }}
              aria-label={playing ? "หยุด" : "เล่นทีละขั้น"}
            >
              {playing ? "❚❚" : "▶"}
            </button>
          </div>
          <div className="hv-step-cap" aria-live="polite">
            {step < 0 ? (
              <span className="hv-note">กด ▶ เพื่อดูทีละขั้นว่าเงินไหลอย่างไร</span>
            ) : (
              <motion.div key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
                <b>{steps[step].title}</b> <Inline md={steps[step].caption_md} />
              </motion.div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type Box = { x: number; y: number; w: number; h: number; cx: number; cy: number };

/** เส้นระหว่างกล่อง: แถวเดียวกัน = แนวนอน, คอลัมน์เดียวกัน = แนวตั้ง, ต่างทั้งคู่ = หักศอก (ออกด้านข้างก่อนแล้วขึ้น/ลง) */
function edgePath(a: Box, b: Box, offset: number) {
  const gap = 4;
  if (a.y === b.y) {
    const y = a.cy + offset;
    if (b.x > a.x) return `M${a.x + a.w + gap} ${y} L${b.x - gap} ${y}`;
    return `M${a.x - gap} ${y} L${b.x + b.w + gap} ${y}`;
  }
  if (a.x === b.x) {
    const x = a.cx + offset;
    if (b.y > a.y) return `M${x} ${a.y + a.h + gap} L${x} ${b.y - gap}`;
    return `M${x} ${a.y - gap} L${x} ${b.y + b.h + gap}`;
  }
  const goRight = b.cx > a.cx;
  const sx = goRight ? a.x + a.w + gap : a.x - gap;
  const sy = a.cy + offset;
  const ex = b.cx;
  const ey = b.y > a.y ? b.y - gap : b.y + b.h + gap;
  const r = 12;
  const dirX = goRight ? 1 : -1;
  const dirY = ey > sy ? 1 : -1;
  return `M${sx} ${sy} L${ex - dirX * r} ${sy} Q${ex} ${sy} ${ex} ${sy + dirY * r} L${ex} ${ey}`;
}

function EdgeLabel({ d, text, go, delay, side }: { d: string; text: string; go: boolean; delay: number; side: number }) {
  // จุดกึ่งกลางของเส้น — ใช้ปลายทั้งสองข้าง (พอสำหรับเส้นตรง/หักศอกที่ท่อนยาวสุดคือท่อนแรก)
  const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  const x1 = nums[0], y1 = nums[1];
  const x2 = nums[2] ?? x1, y2 = nums[3] ?? y1;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const w = Math.min(230, text.length * 7.2 + 18);
  const vertical = Math.abs(x2 - x1) < 2;
  const horizontal = Math.abs(y2 - y1) < 2;
  const lx = vertical ? mx + 8 + w / 2 : mx;
  // เส้นแนวนอนระหว่างกล่องข้างกัน: ช่องว่างแคบกว่าป้าย → ยกป้ายขึ้นเหนือ/ลงใต้แถบกล่อง (เส้นสวนทางแยกบน-ล่างตาม side)
  const ly = horizontal ? (side > 0 ? my + NODE_H / 2 + 12 : my - NODE_H / 2 - 12) : my;
  return (
    <motion.g className="hv-edge-label" initial={{ opacity: 0 }} animate={go ? { opacity: 1 } : { opacity: 0 }} transition={{ delay }}>
      <rect x={lx - w / 2} y={ly - 10} width={w} height={20} rx="10" />
      <text x={lx} y={ly + 4} textAnchor="middle">
        {text}
      </text>
    </motion.g>
  );
}

/* ---------- scale: ตำแหน่งบนช่วง ---------- */

function Scale({ v, go }: { v: HintVisualScale; go: boolean }) {
  const span = v.max - v.min || 1;
  const at = (x: number) => ((x - v.min) / span) * 100;
  const sorted = [...v.markers].sort((a, b) => a.value - b.value);
  const now = v.markers.find((m) => m.kind === "now");
  const pasts = v.markers.filter((m) => m.kind !== "now" && m.kind !== "threshold");
  const first = pasts.length ? Math.min(...pasts.map((m) => m.value)) : null;
  return (
    <div className="hv-body">
      <div className="hv-scale" role="img" aria-label={sorted.map((m) => `${m.label} ${m.value}`).join(", ")}>
        <div className="hv-scale-track">
          {v.zones?.map((z, i) => (
            <div key={i} className={`hv-zone t-${z.tone ?? "warn"}`} style={{ left: `${at(z.from)}%`, width: `${at(z.to) - at(z.from)}%` }}>
              <span>{z.label}</span>
            </div>
          ))}
          {now && first != null && first < now.value && (
            <motion.div
              className="hv-scale-travel"
              style={{ left: `${at(first)}%` }}
              initial={{ width: 0 }}
              animate={go ? { width: `${at(now.value) - at(first)}%` } : { width: 0 }}
              transition={{ duration: 1.1, delay: 0.5, ease: EASE }}
            />
          )}
          {sorted.map((m, i) => (
            <motion.div
              key={i}
              className={`hv-mark k-${m.kind ?? "past"}`}
              style={{ left: `${at(m.value)}%` }}
              initial={{ opacity: 0, scale: 0.4 }}
              animate={go ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.4 }}
              transition={{ duration: 0.45, delay: 0.3 + i * 0.3, ease: EASE }}
            >
              <i />
              <span className={`hv-mark-l ${i % 2 ? "is-below" : ""}`}>
                <b>
                  {m.kind === "now" ? <CountText value={m.value} go={go} delay={300 + i * 300} /> : fmtNum(m.value)}
                  {v.unit ? ` ${v.unit}` : ""}
                </b>
                {m.label}
              </span>
            </motion.div>
          ))}
        </div>
        <div className="hv-scale-axis">
          <span>
            {fmtNum(v.min)}
            {v.unit ? ` ${v.unit}` : ""}
          </span>
          <span>
            {fmtNum(v.max)}
            {v.unit ? ` ${v.unit}` : ""}
          </span>
        </div>
      </div>
      {now && first != null && first > 0 && (
        <div className="hv-caption">
          <b>ตอนนี้</b> {fmtNum(now.value)}
          {v.unit ? ` ${v.unit}` : ""} <span className="hv-note">= {(now.value / first).toFixed(1)}× ของจุดต่ำสุดที่รายงานอ้าง</span>
        </div>
      )}
    </div>
  );
}

/* ---------- timeline: ลำดับเหตุการณ์ + สะสม ---------- */

function Timeline({ v, go }: { v: HintVisualTimeline; go: boolean }) {
  const hasValues = v.items.every((i) => typeof i.value === "number");
  const cum: number[] = [];
  let run = 0;
  for (const it of v.items) {
    run += it.value ?? 0;
    cum.push(run);
  }
  const total = run;
  const [active, setActive] = useState<number | null>(null);
  const shown = active ?? v.items.length - 1;
  const cur = v.items[shown];
  return (
    <div className="hv-body">
      <div className="hv-tl" role="list">
        <div className="hv-tl-line">
          <motion.i initial={{ width: 0 }} animate={go ? { width: "100%" } : { width: 0 }} transition={{ duration: 1.2, ease: EASE }} />
        </div>
        {v.items.map((it, i) => {
          const size = hasValues && total > 0 ? 14 + Math.round(((it.value ?? 0) / total) * 34) : 16;
          return (
            <button
              type="button"
              role="listitem"
              key={i}
              className={`hv-tl-ev ${shown === i ? "is-active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              aria-label={`${it.date} ${it.label}${it.value != null ? " " + it.value : ""}`}
            >
              <span className="hv-tl-date">{fmtDate(it.date)}</span>
              <motion.span
                className="hv-tl-dot"
                style={{ width: size, height: size }}
                initial={{ scale: 0, opacity: 0 }}
                animate={go ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
                transition={{ duration: 0.45, delay: 0.25 + i * 0.28, ease: [0.34, 1.4, 0.64, 1] }}
              />
              <span className="hv-tl-l">{it.label}</span>
              {it.value != null && (
                <span className="hv-tl-v">
                  <CountText value={it.value} go={go} delay={250 + i * 280} unit={v.unit} />
                </span>
              )}
              {hasValues && (
                <motion.span
                  className="hv-tl-cum"
                  initial={{ opacity: 0 }}
                  animate={go ? { opacity: 1 } : { opacity: 0 }}
                  transition={{ delay: 0.9 + i * 0.28 }}
                >
                  สะสม {fmtNum(cum[i])}
                  {v.unit ? ` ${v.unit}` : ""}
                </motion.span>
              )}
            </button>
          );
        })}
      </div>
      <div className="hv-caption" aria-live="polite">
        <b>{fmtDate(cur.date)}</b> {cur.label}
        {cur.note && <span className="hv-note"> · {cur.note}</span>}
        {hasValues && (
          <span className="hv-note">
            {" "}· รวมถึงตอนนั้น {fmtNum(cum[shown])}
            {v.unit ? ` ${v.unit}` : ""} จากทั้งหมด {fmtNum(total)}
            {v.unit ? ` ${v.unit}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}

const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
function fmtDate(d: string) {
  const [y, m, day] = d.split("-");
  const mon = TH_MONTH[Number(m) - 1] ?? m;
  return day ? `${Number(day)} ${mon} ${y}` : `${mon} ${y}`;
}
