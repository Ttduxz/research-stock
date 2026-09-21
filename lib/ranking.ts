import type { EntryPlan, LatestSnapshot } from "./db";
import type { Quote } from "./quote";
import { ema, priceRange, emaTrend, rangePosition, type TrendState } from "./indicators";

/**
 * จัดอันดับ "ราคาน่าสนใจที่สุดตอนนี้"
 *
 * ราคาที่ใช้: ราคาตลาดสด (ถ้าดึงได้) มิฉะนั้น fallback เป็น price_at_run ของ run ล่าสุด
 * ทุกอย่างที่เหลือ — เป้า bull/base/bear, คะแนนพื้นฐาน, risk_level, verdict —
 * มาจากรายงานใน DB ณ วัน run ไม่มีการประเมินมูลค่าใหม่
 *
 * ข้อควรระวัง: ถ้าราคาสดวิ่งไกลจากราคา ณ วัน run มาก แปลว่าบทวิเคราะห์เริ่มเก่า
 * (ดู field `stale`) — ส่วนต่างถึงเป้าที่ดูดีอาจเป็นเพราะเป้ายังไม่ถูกปรับ ไม่ใช่เพราะของถูก
 */

/** ราคาขยับจากวัน run เกินเท่านี้ = เตือนว่าบทวิเคราะห์เริ่มเก่า */
export const STALE_MOVE_THRESHOLD = 0.15;

/** จำนวนวันทำการย้อนหลังที่ใช้หากรอบราคาสำหรับ premium/discount zone (~6 เดือน)
 *  สั้นกว่า 52 สัปดาห์เพื่อสะท้อน "ตอนนี้" ไม่ใช่ลากพฤติกรรมราคาข้ามปี, ยาวกว่ากรอบเทรดสั้น (20-60 วัน)
 *  เพราะจุดประสงค์คือหาจังหวะทยอยเก็บของ ไม่ใช่จับจังหวะเข้าออกไม้ */
export const RANGE_LOOKBACK = 120;

/** เส้นแบ่งโซน — 38.2/61.8 ตามระดับที่คนอ่านกราฟใช้กันทั่วไป equilibrium เป็นแถบกว้างตรงกลาง ไม่ใช่เส้นเดียว
 *  กันไม่ให้ราคาที่ห่างจุดกลางแค่ 1% โดนเรียก premium/discount ทั้งที่ยังอยู่แถวกลางกรอบ */
export const ZONE_BOUNDS = { discount: 0.382, premium: 0.618 } as const;

export type ZoneState = "discount" | "equilibrium" | "premium";

/** คะแนนแต่ละสถานะโครงเทรนด์ — เป็นขั้นบันได ไม่ใช่ linear เพราะสิ่งที่สนใจคือ "โครงเป็นแบบไหน" ไม่ใช่ห่างเส้นกี่ % */
export const TREND_SCORE: Record<TrendState, number> = {
  strong_up: 1,
  up: 0.8,
  mixed: 0.5,
  down: 0.15,
};

// ---------- Types ----------

export interface Scenario {
  target: number;
  probability: number;
  rationale?: string;
}

/** above = ยังไม่ถึงไม้ไหนเลย (แพงกว่าที่ theorist จะเริ่มซื้อ), in = อยู่ในไม้ที่แสดง,
 *  between = หลุดไม้ที่แสดงแล้ว แต่ยังไม่ถึงไม้ถัดไป, below = หลุดทุกไม้ (ถูกกว่าแผนสุดขั้ว) */
export type EntryState = "above" | "in" | "between" | "below";

export interface EntryZone {
  /** ช่วงราคาของ "ไม้ที่แสดง" (ดู tranche) ไม่ใช่ไม้แรกเสมอไป */
  range: string;
  low: number;
  high: number;
  state: EntryState;
  /** เลขไม้ที่แสดง (1 = แพงสุด) หลังเรียงทุกไม้ตามราคาจากมากไปน้อย ไม่อิง level ดิบใน JSON */
  tranche: number;
  trancheCount: number;
  /** ช่วงราคาไม้ถัดไป (ลึกกว่า) — มีค่าเฉพาะตอน state === "between" */
  nextRange: string | null;
  /** allocation ของไม้ที่แสดง คิดเป็นสัดส่วนของผลรวมทุกไม้ (0-1) */
  allocShare: number;
  /** สัดส่วนสะสมของแผนที่ theorist จะลงเงินไปแล้ว ณ ราคานี้ (0-1) — ใช้คิดคะแนน entry ตรงๆ */
  cumShare: number;
  /** false = entry plan ไม่ได้ระบุ allocation เลย (แผนเก่า) ระบบสมมุติแบ่งเท่ากันแทน */
  allocKnown: boolean;
  /** (ขอบบนไม้ 1 - ราคา) / ราคา — ใช้เฉพาะตอน state === "above" */
  gapPct: number;
}

export interface ScoreParts {
  value: number;
  rr: number;
  quality: number;
  trend: number;
  zone: number;
  entry: number;
  risk: number;
  verdict: number;
}

export interface Technical {
  /** null = ประวัติราคาไม่ถึง 200 วันทำการ หรือดึงราคาไม่ได้ */
  trend: TrendState | null;
  ema50: number | null;
  ema100: number | null;
  ema200: number | null;
  /** null = ประวัติราคาไม่ถึง RANGE_LOOKBACK วัน */
  zone: ZoneState | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  rangeMid: number | null;
  /** ตำแหน่งราคาในกรอบ 0-1 (0 = ชนขอบล่าง, 1 = ชนขอบบน) */
  rangePos: number | null;
  distFromMidPct: number | null;
}

export interface PriceRank {
  ticker: string;
  name: string;
  sector: string | null;
  currency: string;
  runId: number;
  runDate: string;
  /** ราคาที่ใช้คำนวณทุกอย่างในแถวนี้ — สดถ้าดึงได้ ไม่งั้นเท่ากับ runPrice */
  price: number;
  /** price_at_run ของ run ล่าสุด (ราคาที่ทีม analyze/theorie เห็นตอนเขียนรายงาน) */
  runPrice: number;
  priceSource: "live" | "run";
  /** เวลาของราคาสด (ISO) — null เมื่อ fallback */
  priceAsOf: string | null;
  /** % เปลี่ยนแปลงของวัน จาก Yahoo — null เมื่อ fallback */
  dayChangePct: number | null;
  /** ราคาสดขยับจากราคา ณ วัน run เท่าไร — null เมื่อ fallback */
  moveSinceRunPct: number | null;
  /** ราคาขยับจากวัน run เกินเกณฑ์ = บทวิเคราะห์เริ่มเก่า ควรรัน research ใหม่ */
  stale: boolean;

  verdict: string | null;
  fundamentals: number | null;
  momentum: number | null;
  riskLevel: string | null;

  /** เป้าถ่วงน้ำหนักความน่าจะเป็น เฉลี่ยจากทุกทฤษฎีของ run ล่าสุด */
  evTarget: number;
  upsidePct: number;
  bullTarget: number;
  bullPct: number;
  baseTarget: number;
  basePct: number;
  bearTarget: number;
  bearPct: number;
  /** upside ฝั่ง bull ต่อ downside ฝั่ง bear */
  rewardRisk: number;
  theoryCount: number;
  topTheory: string | null;

  entry: EntryZone | null;
  score: number; // 0-100
  parts: ScoreParts;

  /** โครงเทรนด์ (EMA 50/100/200) + ตำแหน่งในกรอบราคา 6 เดือน — ฟิลด์ข้างในเป็น null ได้เมื่อข้อมูลไม่พอ */
  tech: Technical;
}

// ---------- Score model ----------

export const WEIGHTS: { key: keyof ScoreParts; weight: number; label: string; how: string }[] = [
  {
    key: "value",
    weight: 0.25,
    label: "ส่วนต่างถึงเป้า",
    how: "เป้าถ่วงน้ำหนักความน่าจะเป็น (bull/base/bear ของทุกทฤษฎี) เทียบราคาตลาดล่าสุด — เต็มที่ +20% ขึ้นไป, ศูนย์ที่ −5%",
  },
  {
    key: "rr",
    weight: 0.17,
    label: "reward / risk",
    how: "upside ฝั่ง bull หารด้วย downside ฝั่ง bear — เต็มที่ 2.0 เท่าขึ้นไป, ศูนย์ที่ 0.5 เท่า",
  },
  {
    key: "quality",
    weight: 0.18,
    label: "คุณภาพกิจการ",
    how: "คะแนนพื้นฐาน (น้ำหนัก 60%) + momentum (40%) จากรายงาน",
  },
  {
    key: "trend",
    weight: 0.09,
    label: "โครงเทรนด์ (EMA 50/100/200)",
    how: "เรียง price > EMA50 > EMA100 > EMA200 = 1.00, ย่อในขาขึ้น (EMA เรียงดีแต่ราคาหลุด EMA50) = 0.80, ริบบิ้นพันกัน = 0.50, เรียงกลับขาลง = 0.15",
  },
  {
    key: "zone",
    weight: 0.12,
    label: "กรอบราคา 6 เดือน",
    how: "ตำแหน่งราคาในกรอบสูง-ต่ำ 120 วันทำการ — ล่างกรอบ (ต่ำกว่า 38.2%) ได้เต็ม, บนกรอบ (สูงกว่า 61.8%) ได้ศูนย์ ใช้หาจังหวะทยอยเก็บของ ไม่ใช่จับจังหวะเทรด",
  },
  {
    key: "entry",
    weight: 0.07,
    label: "ถึงไม้ไหนของแผน",
    how: "เทียบราคากับทุกไม้ในแผนสะสมของรายงาน (ไม่ใช่แค่ไม้แรก) — คะแนน = สัดส่วนเงินที่แผนตั้งใจลงไปแล้ว ณ ราคานี้ (ไม้แรกที่แบ่งเงินไว้น้อย = คะแนนต่ำ แม้ราคาจะ 'อยู่ในโซน' ก็ตาม) เหนือไม้ 1 ลดหลั่นจนศูนย์ที่ +8%",
  },
  {
    key: "risk",
    weight: 0.07,
    label: "ระดับความเสี่ยง",
    how: "ระดับความเสี่ยงจากรายงาน — low 1.00 / medium 0.70 / high 0.35",
  },
  {
    key: "verdict",
    weight: 0.05,
    label: "มุมมองรวม",
    how: "bullish 1.00 / neutral 0.50 / bearish 0.00",
  },
];

const RISK_SCORE: Record<string, number> = { low: 1, medium: 0.7, high: 0.35 };
const VERDICT_SCORE: Record<string, number> = { bullish: 1, neutral: 0.5, bearish: 0 };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

// ---------- Parsing ----------

function parseScenarios(raw: string | null): { bull?: Scenario; base?: Scenario; bear?: Scenario } | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;
    return obj;
  } catch {
    return null;
  }
}

/** parse "25%", "20% (เหลือเงินสด 25%)", "30-40%" → เอา match แรกเท่านั้น (กันจับตัวเลขในวงเล็บผิด),
 *  ช่วง (30-40%) ใช้กึ่งกลาง — null ถ้าไม่มี % หรือค่านอกช่วง (0, 100] */
function parseAllocationPct(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = raw.match(/(\d+(?:\.\d+)?)\s*(?:[-–]\s*(\d+(?:\.\d+)?))?\s*%/);
  if (!m) return null;
  const a = Number(m[1]);
  const v = m[2] !== undefined ? (a + Number(m[2])) / 2 : a;
  return Number.isFinite(v) && v > 0 && v <= 100 ? v : null;
}

/** อ่านทุกไม้จาก entry plan แล้วหาว่าราคาปัจจุบัน "ไปถึงไม้ไหนแล้ว" คิดเป็นสัดส่วนเงินสะสมตาม allocation
 *  ของแต่ละไม้ (ไม่ใช่แค่เช็คไม้แรกเฉยๆ) — ไม้ allocation เล็ก (ไม้ทดลอง) ให้ cumShare ต่ำกว่าไม้ allocation ใหญ่ */
function parseEntryZone(raw: string | null, price: number): EntryZone | null {
  if (!raw) return null;
  let plan: EntryPlan;
  try {
    plan = JSON.parse(raw) as EntryPlan;
  } catch {
    return null;
  }
  if (!Array.isArray(plan.tranches) || plan.tranches.length === 0) return null;

  const parsed: { range: string; low: number; high: number; allocRaw: number | null }[] = [];
  for (const t of plan.tranches) {
    if (!t?.price_range) continue;
    const nums = (t.price_range.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => Number(n.replace(/,/g, "")));
    if (nums.length === 0) continue;
    parsed.push({
      range: t.price_range,
      low: Math.min(...nums),
      high: Math.max(...nums),
      allocRaw: parseAllocationPct(t.allocation),
    });
  }
  if (parsed.length === 0) return null;

  // เรียงจากแพง→ถูก ไม่เชื่อ `level` ดิบ (กันเลขซ้ำ/ข้าม/ไม่มี)
  parsed.sort((a, b) => b.high - a.high);
  const n = parsed.length;

  const allocKnown = parsed.every((t) => t.allocRaw != null);
  let allocs: number[];
  if (allocKnown) {
    allocs = parsed.map((t) => t.allocRaw as number);
  } else if (parsed.every((t) => t.allocRaw == null)) {
    allocs = parsed.map(() => 100 / n); // แผนเก่าไม่มี allocation เลย — สมมุติแบ่งเท่ากัน
  } else {
    const known = parsed.map((t) => t.allocRaw).filter((v): v is number => v != null);
    const knownSum = known.reduce((a, b) => a + b, 0);
    const unknownCount = n - known.length;
    const fillEach = knownSum < 100 ? (100 - knownSum) / unknownCount : knownSum / known.length;
    allocs = parsed.map((t) => t.allocRaw ?? fillEach);
  }
  const allocSum = allocs.reduce((a, b) => a + b, 0) || 1; // รวมอาจไม่ถึง 100 ถ้าตั้งใจกันเงินสดสำรอง
  const shares = allocs.map((a) => a / allocSum);
  const cumShareUpTo = (idx: number) => shares.slice(0, idx + 1).reduce((a, b) => a + b, 0);

  const k = parsed.filter((t) => t.high >= price).length; // จำนวนไม้ที่ราคาลงมาถึง/ทะลุแล้ว

  let idx: number;
  let state: EntryState;
  let cumShare: number;
  let nextRange: string | null = null;

  if (k === 0) {
    idx = 0;
    state = "above";
    cumShare = 0;
  } else {
    idx = k - 1;
    if (price >= parsed[idx].low) {
      state = "in";
      cumShare = cumShareUpTo(idx);
    } else if (k < n) {
      state = "between";
      cumShare = cumShareUpTo(idx);
      nextRange = parsed[idx + 1].range;
    } else {
      state = "below";
      cumShare = 1;
    }
  }

  const shown = parsed[idx];
  return {
    range: shown.range,
    low: shown.low,
    high: shown.high,
    state,
    tranche: idx + 1,
    trancheCount: n,
    nextRange,
    allocShare: shares[idx],
    cumShare: clamp01(cumShare),
    allocKnown,
    gapPct: (parsed[0].high - price) / price,
  };
}

/** ป้ายสั้นสำหรับตาราง — ห้ามยาว (บทเรียนจากรอบก่อน) */
export function entryLabel(entry: EntryZone | null): string {
  if (!entry) return "–";
  const pct = `${Math.round(entry.cumShare * 100)}%`;
  switch (entry.state) {
    case "above":
      return `เหนือไม้ ${entry.tranche}`;
    case "in":
      return `ไม้ ${entry.tranche}/${entry.trancheCount} · ${pct}`;
    case "between":
      return `ไม้ ${entry.tranche}→${entry.tranche + 1} · ${pct}`;
    case "below":
      return `หลุดแผน · ${pct}`;
  }
}

/** สีตาม state — below/in ไม้เล็กใช้ warn เพราะเป็นสัญญาณ "ต้องเช็คเพิ่ม" ไม่ใช่ดี/ร้ายตรงไปตรงมา */
export function entryTone(entry: EntryZone | null): "up" | "dn" | "warn" | "" {
  if (!entry) return "";
  switch (entry.state) {
    case "above":
      return "dn";
    case "between":
      return "up";
    case "below":
      return "warn";
    case "in":
      return entry.cumShare < 0.34 ? "warn" : entry.cumShare >= 0.5 ? "up" : "";
  }
}

const avg = (nums: number[]) => nums.reduce((a, b) => a + b, 0) / nums.length;

// ---------- Ranking ----------

export function rankByPrice(
  snapshots: LatestSnapshot[],
  quotes?: Map<string, Quote>
): PriceRank[] {
  const ranked: PriceRank[] = [];

  for (const { stock, run, analysis, theories } of snapshots) {
    const runPrice = run.price_at_run;
    if (!runPrice || runPrice <= 0) continue;

    const quote = quotes?.get(stock.ticker);
    const price = quote?.price ?? runPrice;
    const moveSinceRunPct = quote ? price / runPrice - 1 : null;

    const evs: number[] = [];
    const bulls: number[] = [];
    const bases: number[] = [];
    const bears: number[] = [];
    for (const t of theories) {
      const sc = parseScenarios(t.scenarios);
      if (!sc?.bull?.target || !sc.base?.target || !sc.bear?.target) continue;
      const probSum =
        (sc.bull.probability ?? 0) + (sc.base.probability ?? 0) + (sc.bear.probability ?? 0);
      if (probSum <= 0) continue;
      evs.push(
        (sc.bull.probability * sc.bull.target +
          sc.base.probability * sc.base.target +
          sc.bear.probability * sc.bear.target) /
          probSum
      );
      bulls.push(sc.bull.target);
      bases.push(sc.base.target);
      bears.push(sc.bear.target);
    }
    if (evs.length === 0) continue; // ไม่มีเป้าราคา = จัดอันดับ "ราคาดี" ไม่ได้

    const evTarget = avg(evs);
    const bullTarget = avg(bulls);
    const baseTarget = avg(bases);
    const bearTarget = avg(bears);
    const upsidePct = evTarget / price - 1;
    const bullPct = bullTarget / price - 1;
    const bearPct = bearTarget / price - 1;
    const rewardRisk = bullPct / Math.max(0.01, -bearPct);

    const entry = parseEntryZone(run.entry_plan_json, price);
    const f = analysis?.fundamentals_score ?? null;
    const m = analysis?.momentum_score ?? null;

    const closes = quote?.closes ?? null;
    const ema50 = closes ? ema(closes, 50) : null;
    const ema100 = closes ? ema(closes, 100) : null;
    const ema200 = closes ? ema(closes, 200) : null;
    const trend = ema50 != null && ema100 != null && ema200 != null ? emaTrend(price, ema50, ema100, ema200) : null;

    const range = closes ? priceRange(closes, RANGE_LOOKBACK) : null;
    const rp = range ? rangePosition(price, range.high, range.low) : null;
    const zone: ZoneState | null =
      rp == null ? null : rp.pos < ZONE_BOUNDS.discount ? "discount" : rp.pos > ZONE_BOUNDS.premium ? "premium" : "equilibrium";

    const tech: Technical = {
      trend,
      ema50,
      ema100,
      ema200,
      zone,
      rangeLow: range?.low ?? null,
      rangeHigh: range?.high ?? null,
      rangeMid: rp?.mid ?? null,
      rangePos: rp?.pos ?? null,
      distFromMidPct: rp?.distFromMidPct ?? null,
    };

    const parts: ScoreParts = {
      value: clamp01((upsidePct + 0.05) / 0.25),
      rr: clamp01((rewardRisk - 0.5) / 1.5),
      quality: f == null && m == null ? 0.5 : (0.6 * (f ?? m ?? 5) + 0.4 * (m ?? f ?? 5)) / 10,
      trend: tech.trend ? TREND_SCORE[tech.trend] : 0.5,
      zone: tech.rangePos == null ? 0.5 : clamp01(1 - tech.rangePos),
      entry: !entry
        ? 0.35 // ไม่มีแผน — ต่ำกว่ากลาง (0.5) เดิม เพราะ 0.5 จะแพ้หุ้นที่มีแผนบอกว่าไม้แรกเล็กอย่างไม่เป็นธรรม
        : entry.state === "above"
        ? entry.allocShare * clamp01(1 + entry.gapPct / 0.08)
        : entry.state === "below"
        ? 1
        : entry.cumShare,
      risk: RISK_SCORE[analysis?.risk_level ?? ""] ?? 0.5,
      verdict: VERDICT_SCORE[analysis?.verdict ?? ""] ?? 0.5,
    };
    const score = WEIGHTS.reduce((sum, w) => sum + w.weight * parts[w.key], 0) * 100;

    const topTheory =
      [...theories].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0]?.title ?? null;

    ranked.push({
      ticker: stock.ticker,
      name: stock.name,
      sector: stock.sector,
      currency: stock.currency,
      runId: run.id,
      runDate: run.run_date,
      price,
      runPrice,
      priceSource: quote ? "live" : "run",
      priceAsOf: quote?.asOf ?? null,
      dayChangePct: quote?.changePct ?? null,
      moveSinceRunPct,
      stale: moveSinceRunPct != null && Math.abs(moveSinceRunPct) > STALE_MOVE_THRESHOLD,
      verdict: analysis?.verdict ?? null,
      fundamentals: f,
      momentum: m,
      riskLevel: analysis?.risk_level ?? null,
      evTarget,
      upsidePct,
      bullTarget,
      bullPct,
      baseTarget,
      basePct: baseTarget / price - 1,
      bearTarget,
      bearPct,
      rewardRisk,
      theoryCount: evs.length,
      topTheory,
      entry,
      score,
      parts,
      tech,
    });
  }

  ranked.sort((a, b) => b.score - a.score || b.upsidePct - a.upsidePct);
  return ranked;
}
