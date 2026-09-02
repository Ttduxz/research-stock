import type { EntryPlan, LatestSnapshot } from "./db";
import type { Quote } from "./quote";

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

// ---------- Types ----------

export interface Scenario {
  target: number;
  probability: number;
  rationale?: string;
}

export type EntryState = "below" | "in" | "above";

export interface EntryZone {
  range: string; // ข้อความช่วงราคาไม้แรกตามที่ theorie team เขียน เช่น "$205-218"
  allocation?: string;
  low: number;
  high: number;
  state: EntryState;
  gapPct: number; // (ขอบบนไม้แรก - ราคา) / ราคา — บวก = ราคายังไม่หลุดโซน
}

export interface ScoreParts {
  value: number;
  rr: number;
  quality: number;
  entry: number;
  risk: number;
  verdict: number;
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
}

// ---------- Score model ----------

export const WEIGHTS: { key: keyof ScoreParts; weight: number; label: string; how: string }[] = [
  {
    key: "value",
    weight: 0.35,
    label: "ส่วนต่างถึงเป้า",
    how: "เป้าถ่วงน้ำหนักความน่าจะเป็น (bull/base/bear ของทุกทฤษฎี) เทียบราคาตลาดล่าสุด — เต็มที่ +20% ขึ้นไป, ศูนย์ที่ −5%",
  },
  {
    key: "rr",
    weight: 0.2,
    label: "reward / risk",
    how: "upside ฝั่ง bull หารด้วย downside ฝั่ง bear — เต็มที่ 2.0 เท่าขึ้นไป, ศูนย์ที่ 0.5 เท่า",
  },
  {
    key: "quality",
    weight: 0.2,
    label: "คุณภาพกิจการ",
    how: "คะแนนพื้นฐาน (น้ำหนัก 60%) + momentum (40%) จากทีม analyze",
  },
  {
    key: "entry",
    weight: 0.1,
    label: "อยู่ในโซนเข้าไหม",
    how: "ราคาตลาดล่าสุดเทียบช่วงไม้แรกใน entry plan — เต็มที่เมื่ออยู่ในโซนหรือต่ำกว่า, ศูนย์เมื่อสูงกว่าขอบบน 8%+",
  },
  {
    key: "risk",
    weight: 0.1,
    label: "ระดับความเสี่ยง",
    how: "risk_level จากทีม analyze — low 1.00 / medium 0.70 / high 0.35",
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

/** อ่านช่วงราคาไม้แรกจาก entry plan เช่น "$1,080-1,160" → { low: 1080, high: 1160 } */
function parseEntryZone(raw: string | null, price: number): EntryZone | null {
  if (!raw) return null;
  let plan: EntryPlan;
  try {
    plan = JSON.parse(raw) as EntryPlan;
  } catch {
    return null;
  }
  const t1 = plan.tranches?.find((t) => t.level === 1) ?? plan.tranches?.[0];
  if (!t1?.price_range) return null;
  const nums = (t1.price_range.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => Number(n.replace(/,/g, "")));
  if (nums.length === 0) return null;
  const low = Math.min(...nums);
  const high = Math.max(...nums);
  const state: EntryState = price < low ? "below" : price <= high ? "in" : "above";
  return {
    range: t1.price_range,
    allocation: t1.allocation,
    low,
    high,
    state,
    gapPct: (high - price) / price,
  };
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

    const parts: ScoreParts = {
      value: clamp01((upsidePct + 0.05) / 0.25),
      rr: clamp01((rewardRisk - 0.5) / 1.5),
      quality: f == null && m == null ? 0.5 : (0.6 * (f ?? m ?? 5) + 0.4 * (m ?? f ?? 5)) / 10,
      entry: entry ? clamp01(1 + entry.gapPct / 0.08) : 0.5,
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
    });
  }

  ranked.sort((a, b) => b.score - a.score || b.upsidePct - a.upsidePct);
  return ranked;
}
