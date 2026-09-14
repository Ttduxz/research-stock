import type { TrackRecordRow } from "@/lib/db";

/**
 * สถิติความแม่นของทฤษฎี — คำนวณจากผลตัดสินของทีม reviewer เท่านั้น (ไม่ใช้ราคา)
 *
 * ต้องแยกฝั่ง claim ก่อนนับ:
 * - assumption / catalyst = สิ่งที่ทฤษฎี "หวังว่าจะเกิด" → confirmed คือทฤษฎีถูก
 * - risk = สิ่งที่ theorist "เตือนว่าอาจเกิด" → confirmed คือความเสี่ยงเกิดขึ้นจริง ซึ่งทำร้าย thesis
 * ถ้าเอามารวมกันเป็นอัตราเดียว ความเสี่ยงที่เกิดจริงจะถูกนับเป็น "ทฤษฎีแม่น" ซึ่งกลับหัวกลับหาง
 */

export const THESIS_TYPES = ["assumption", "catalyst"] as const;
export const STATUS_ORDER = ["confirmed", "weakened", "broken", "too-early"] as const;
export type Status = (typeof STATUS_ORDER)[number];

/** ต่ำกว่านี้ถือว่าตัวอย่างน้อยเกินจะอ่านเป็นแนวโน้ม — แสดงได้แต่ติดป้ายเตือน */
export const MIN_RESOLVED = 10;

export interface Tally {
  total: number;
  counts: Record<Status, number>;
  /** ตัดสินได้แล้ว = ไม่ใช่ too-early */
  resolved: number;
  /** confirmed / resolved — null ถ้ายังไม่มีข้อที่ตัดสินได้ */
  confirmRate: number | null;
  /** ความมั่นใจเฉลี่ยของทฤษฎีต้นทาง (0–1) เฉพาะข้อที่ตัดสินได้แล้ว — ใช้เทียบกับ confirmRate */
  avgConfidence: number | null;
}

export function tally(rows: TrackRecordRow[]): Tally {
  const counts: Record<Status, number> = { confirmed: 0, weakened: 0, broken: 0, "too-early": 0 };
  let confSum = 0;
  let confN = 0;
  for (const r of rows) {
    const s = (STATUS_ORDER as readonly string[]).includes(r.status) ? (r.status as Status) : "too-early";
    counts[s]++;
    if (s !== "too-early" && r.confidence != null) {
      confSum += r.confidence;
      confN++;
    }
  }
  const resolved = rows.length - counts["too-early"];
  return {
    total: rows.length,
    counts,
    resolved,
    confirmRate: resolved > 0 ? counts.confirmed / resolved : null,
    avgConfidence: confN > 0 ? confSum / confN / 100 : null,
  };
}

export const isThesisClaim = (r: TrackRecordRow) => (THESIS_TYPES as readonly string[]).includes(r.claim_type);

/** ช่วงความมั่นใจ — ข้อมูลจริงกระจุกอยู่ 45–75 จึงแบ่งละเอียดกว่าช่วงละ 10 */
const CONFIDENCE_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "ต่ำกว่า 55", min: -Infinity, max: 54 },
  { label: "55–59", min: 55, max: 59 },
  { label: "60–64", min: 60, max: 64 },
  { label: "65–69", min: 65, max: 69 },
  { label: "70 ขึ้นไป", min: 70, max: Infinity },
];

export interface Group {
  label: string;
  tally: Tally;
}

export function byConfidence(rows: TrackRecordRow[]): Group[] {
  const groups = CONFIDENCE_BUCKETS.map((b) => ({
    label: b.label,
    tally: tally(rows.filter((r) => r.confidence != null && r.confidence >= b.min && r.confidence <= b.max)),
  }));
  const unknown = rows.filter((r) => r.confidence == null);
  if (unknown.length > 0) groups.push({ label: "ไม่ระบุ", tally: tally(unknown) });
  return groups.filter((g) => g.tally.total > 0);
}

/** "7 ใน 10" อ่านง่ายกว่า "74%" สำหรับคนที่ไม่อยากคิดเลข */
export const outOf10 = (rate: number) => Math.round(rate * 10);

export type Tone = "good" | "warn" | "bad" | "unknown";

export interface Verdict {
  tone: Tone;
  answer: string;
  detail: string;
}

/**
 * ตอบเป็นประโยคเดียวว่าตัวเลขความมั่นใจเชื่อได้ไหม
 * เทียบกลุ่มกว้าง 2 ฝั่ง (ต่ำกว่า 60 กับ 65 ขึ้นไป) แทนช่วงปลายสุด — ช่วงปลายตัวอย่างน้อยและดูสวยเกินจริงง่าย
 */
export function calibrationVerdict(thesis: TrackRecordRow[]): Verdict {
  const all = tally(thesis);
  const low = tally(thesis.filter((r) => r.confidence != null && r.confidence < 60));
  const high = tally(thesis.filter((r) => r.confidence != null && r.confidence >= 65));
  if (low.resolved < MIN_RESOLVED || high.resolved < MIN_RESOLVED || all.confirmRate == null || all.avgConfidence == null) {
    return { tone: "unknown", answer: "ยังเร็วไปที่จะบอก", detail: `ต้องมีข้อที่รู้ผลแล้วอย่างน้อย ${MIN_RESOLVED} ข้อทั้งฝั่งมั่นใจสูงและต่ำ` };
  }
  const compare = `มั่นใจสูง ถูก ${outOf10(high.confirmRate!)} ใน 10 · มั่นใจต่ำ ถูก ${outOf10(low.confirmRate!)} ใน 10`;
  if (all.confirmRate < all.avgConfidence - 0.1) {
    return { tone: "bad", answer: "มั่นใจเกินตัว — ถูกน้อยกว่าที่บอกไว้", detail: compare };
  }
  const gap = high.confirmRate! - low.confirmRate!;
  if (gap >= 0.1) return { tone: "good", answer: "เชื่อได้ — ยิ่งมั่นใจมาก ยิ่งถูกบ่อย", detail: compare };
  if (gap <= -0.05) return { tone: "bad", answer: "กลับหัว — ข้อที่มั่นใจมากกลับถูกน้อยกว่า", detail: compare };
  return { tone: "warn", answer: "ไม่มั่นใจเกินตัว แต่มั่นใจสูงกับต่ำยังถูกพอๆ กัน", detail: compare };
}

/** กลุ่มที่แม่นสุด/แย่สุด — นับเฉพาะกลุ่มที่รู้ผลพอ ไม่งั้น "ถูก 1 ใน 1" จะได้ที่หนึ่ง */
export function bestAndWorst(groups: Group[]): { best: Group; worst: Group } | null {
  const ok = groups
    .filter((g) => g.tally.resolved >= MIN_RESOLVED && g.tally.confirmRate != null)
    .sort((a, b) => b.tally.confirmRate! - a.tally.confirmRate!);
  if (ok.length < 2) return null;
  return { best: ok[0], worst: ok[ok.length - 1] };
}

/** จัดกลุ่มตาม key ใดๆ เรียงจากกลุ่มที่ตัดสินได้มากสุดก่อน (กลุ่มใหญ่อ่านแนวโน้มได้น่าเชื่อกว่า) */
export function groupBy(rows: TrackRecordRow[], key: (r: TrackRecordRow) => string): Group[] {
  const map = new Map<string, TrackRecordRow[]>();
  for (const r of rows) {
    const k = key(r);
    map.set(k, [...(map.get(k) ?? []), r]);
  }
  return [...map.entries()]
    .map(([label, rs]) => ({ label, tally: tally(rs) }))
    .sort((a, b) => b.tally.resolved - a.tally.resolved || b.tally.total - a.tally.total);
}
