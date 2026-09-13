/**
 * ด่านคัดกรองรอบติดตาม — เทียบราคาจริงกับสิ่งที่รอบก่อนคิดไว้ **โดยไม่ใช้ agent เลย**
 *
 * Usage: node scripts/price-delta.mjs [TICKER...] [--json] [--due[=วัน]]
 *   ไม่ระบุ ticker = ดูหุ้นทุกตัวใน DB
 *   --due = เอาเฉพาะตัวที่ค้างเกิน 7 วัน (คิวของรอบสัปดาห์) — ใส่ --due=14 เพื่อเปลี่ยนเกณฑ์
 *
 * ตอบ 3 อย่างที่ตัดสินด้วยโค้ดได้แม่นกว่าให้ agent เดา:
 *   1. ราคาขยับเท่าไหร่จากรอบก่อน
 *   2. ตอนนี้อยู่ในโซนไม้ไหนของ entry_plan / หลุด bear target / ถึง bull target หรือยัง
 *   3. เข้าเกณฑ์แข็งที่ต้องยกธงทบทวนใหญ่ไหม (อีกทางคือ reviewer ยกเอง — ใครยกก็ถือว่ายก)
 *
 * เกณฑ์แข็ง: ราคาขยับ ≥7% | เข้าโซนไม้ | แตะ bull/bear target | ครบ 8 สัปดาห์ตั้งแต่ full run
 */
import { applySchema } from "./schema.mjs";
import { openDb } from "./db-client.mjs";
import { getQuotes, parseRange } from "./quotes.mjs";

const MOVE_PCT = 7;
const FULL_RUN_WEEKS = 8;

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const dueArg = args.find((a) => a === "--due" || a.startsWith("--due="));
const dueDays = dueArg ? Number(dueArg.split("=")[1] ?? 7) : null;
const wanted = args.filter((a) => !a.startsWith("--")).map((t) => t.toUpperCase());

const db = openDb();
await applySchema(db);
const parse = (v) => {
  try {
    return v == null ? null : JSON.parse(v);
  } catch {
    return null;
  }
};
const days = (from) => Math.floor((Date.now() - Date.parse(from)) / 86400000);

try {
  const runs = (await db.execute(`
    SELECT r.* FROM research_runs r
    WHERE r.id = (SELECT id FROM research_runs WHERE ticker = r.ticker ORDER BY run_date DESC, id DESC LIMIT 1)
  `)).rows.filter((r) => wanted.length === 0 || wanted.includes(r.ticker));

  const fullRuns = (await db.execute(
    `SELECT ticker, MAX(run_date) AS run_date FROM research_runs
     WHERE COALESCE(run_type, 'full') = 'full' GROUP BY ticker`
  )).rows;
  const lastFull = new Map(fullRuns.map((r) => [r.ticker, r.run_date]));

  const theoryRows = (await db.execute(`SELECT ticker, run_id, scenarios FROM theories`)).rows;

  // รอบทบทวนล่าสุดของแต่ละตัว — ใช้เป็น "กิจกรรมล่าสุด" และเป็นฐานเทียบราคา
  // (ถ้าเพิ่งทบทวนไปเมื่อวาน ไม่ควรถูกนับว่าค้างคิวอีก แม้ full run จะเก่าหลายสัปดาห์แล้วก็ตาม)
  const lastReview = new Map();
  for (const r of (await db.execute(`
    SELECT v.* FROM reviews v
    WHERE v.id = (SELECT id FROM reviews WHERE ticker = v.ticker ORDER BY review_date DESC, id DESC LIMIT 1)
  `)).rows) {
    lastReview.set(r.ticker, r);
  }

  const quotes = await getQuotes(runs.map((r) => r.ticker));
  const out = [];

  for (const run of runs) {
    const q = quotes.get(run.ticker) ?? null;
    const price = q?.price ?? null;
    const rev = lastReview.get(run.ticker) ?? null;
    const reviewIsNewer = rev && rev.review_date > run.run_date;
    // เทียบกับครั้งล่าสุดที่ "ดู" หุ้นตัวนี้จริง ไม่ใช่ full run เมื่อ 2 เดือนก่อน
    const base = (reviewIsNewer ? rev.price_at_review : null) ?? run.price_at_run ?? null;
    const baselineFrom = reviewIsNewer && rev.price_at_review != null ? `ทบทวน ${rev.review_date}` : `รอบ ${run.run_date}`;
    const movePct = price && base ? ((price - base) / base) * 100 : null;

    // โซนไม้จาก entry_plan ของรอบล่าสุดที่มีแผน
    // ไม้ 1 ถูกนิยามว่า "ราคาปัจจุบัน/ย่อเล็กน้อย" อยู่แล้ว → ไม่นับเป็นเหตุยกธง ไม่งั้นจะยกธงแทบทุกตัวทุกสัปดาห์
    // นับเฉพาะไม้ที่ลึกกว่า (2-3) และต้องเป็นการ *เพิ่งเข้า* โซน (รอบก่อนยังไม่อยู่ในโซนนั้น)
    const plan = parse(run.entry_plan_json);
    let trancheHit = null;
    let deepTrancheEntered = null;
    const inRange = (p, r) => r && p != null && p >= r.low && p <= r.high;
    for (const t of plan?.tranches ?? []) {
      const range = parseRange(t.price_range);
      if (!inRange(price, range)) continue;
      trancheHit = { level: t.level, price_range: t.price_range };
      if (Number(t.level) >= 2 && !inRange(base, range)) {
        deepTrancheEntered = trancheHit;
      }
      break;
    }

    // เป้า bull/bear รวมจากทุกทฤษฎีของรอบที่ตั้งทฤษฎีล่าสุด
    const mine = theoryRows.filter((t) => t.ticker === run.ticker);
    const latestTheoryRun = mine.length ? Math.max(...mine.map((t) => Number(t.run_id))) : null;
    const scens = mine
      .filter((t) => Number(t.run_id) === latestTheoryRun)
      .map((t) => parse(t.scenarios))
      .filter(Boolean);
    const bull = scens.map((s) => s?.bull?.target).filter((n) => typeof n === "number");
    const bear = scens.map((s) => s?.bear?.target).filter((n) => typeof n === "number");
    const bullTarget = bull.length ? Math.max(...bull) : null;
    const bearTarget = bear.length ? Math.min(...bear) : null;
    let targetHit = null;
    if (price && bullTarget && price >= bullTarget) targetHit = "bull";
    else if (price && bearTarget && price <= bearTarget) targetHit = "bear";

    const daysSinceRun = days(run.run_date);
    const lastActivityOn = reviewIsNewer ? rev.review_date : run.run_date;
    const daysSinceActivity = days(lastActivityOn);
    const fullDate = lastFull.get(run.ticker) ?? null;
    const weeksSinceFull = fullDate ? Math.floor(days(fullDate) / 7) : null;

    // ราคาที่เพี้ยนแรงมักแปลว่าดึงผิดตัว (ticker ซ้ำข้ามตลาด/คนละสกุลเงิน) ไม่ใช่หุ้นตกจริง
    // ต้องกันไว้ ไม่งั้นรอบทบทวนจะไปตัดสินทฤษฎีจากราคาที่ไม่ใช่ของบริษัทนี้
    const suspicious = movePct != null && Math.abs(movePct) > 60;
    const reasons = [];
    if (suspicious)
      reasons.push(
        `ราคาต่างจากฐานมากผิดปกติ (${movePct.toFixed(1)}%) — ตรวจว่า ticker/สกุลเงินถูกต้องก่อนใช้ตัดสินอะไร`
      );
    if (movePct != null && Math.abs(movePct) >= MOVE_PCT)
      reasons.push(`ราคาขยับ ${movePct > 0 ? "+" : ""}${movePct.toFixed(1)}% จาก${baselineFrom} (เกณฑ์ ${MOVE_PCT}%)`);
    if (deepTrancheEntered)
      reasons.push(`ราคาเพิ่งเข้าโซนไม้ ${deepTrancheEntered.level} (${deepTrancheEntered.price_range})`);
    if (targetHit === "bull") reasons.push(`ราคาแตะ bull target ($${bullTarget}) แล้ว`);
    if (targetHit === "bear") reasons.push(`ราคาหลุด bear target ($${bearTarget}) แล้ว`);
    if (weeksSinceFull != null && weeksSinceFull >= FULL_RUN_WEEKS)
      reasons.push(`ครบ ${weeksSinceFull} สัปดาห์ตั้งแต่ full run ล่าสุด (เกณฑ์ ${FULL_RUN_WEEKS})`);

    out.push({
      ticker: run.ticker,
      last_run_id: Number(run.id),
      last_run_date: run.run_date,
      last_run_type: run.run_type ?? "full",
      days_since_run: daysSinceRun,
      last_activity_on: lastActivityOn,
      days_since_activity: daysSinceActivity,
      last_review: rev ? { id: Number(rev.id), review_date: rev.review_date, stance: rev.stance } : null,
      baseline_from: baselineFrom,
      weeks_since_full_run: weeksSinceFull,
      price_at_run: run.price_at_run ?? null,
      baseline_price: base,
      price,
      price_as_of: q?.asOf ?? null,
      move_pct: movePct == null ? null : Number(movePct.toFixed(2)),
      tranche_hit: trancheHit,
      bull_target: bullTarget,
      bear_target: bearTarget,
      target_hit: targetHit,
      price_suspicious: suspicious,
      escalate: reasons.length > 0,
      escalate_reasons: reasons,
      suggested_run_type:
        weeksSinceFull != null && weeksSinceFull >= FULL_RUN_WEEKS ? "full" : reasons.length > 0 ? "update" : "review",
    });
  }

  const rows = dueDays == null ? out : out.filter((r) => r.days_since_activity >= dueDays);
  rows.sort((a, b) => b.days_since_activity - a.days_since_activity || a.ticker.localeCompare(b.ticker));

  if (asJson) {
    console.log(JSON.stringify(rows));
  } else {
    console.log(
      ["TICKER", "รอบล่าสุด", "วัน", "ราคา", "เปลี่ยน", "แนะนำ", "เหตุผลยกธง"].join("\t")
    );
    if (rows.length === 0) console.log("(ไม่มีตัวที่เข้าเกณฑ์)");
    for (const r of rows) {
      console.log(
        [
          r.ticker,
          r.last_review ? `${r.last_activity_on} (review)` : `${r.last_run_date} (${r.last_run_type})`,
          r.days_since_activity,
          r.price == null ? "-" : r.price.toFixed(2),
          r.move_pct == null ? "-" : `${r.move_pct > 0 ? "+" : ""}${r.move_pct}%`,
          r.suggested_run_type,
          r.escalate_reasons.join(" / ") || "-",
        ].join("\t")
      );
    }
  }
} finally {
  db.close();
}
