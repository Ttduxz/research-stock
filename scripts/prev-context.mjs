/**
 * "ความจำ" ของหุ้นตัวหนึ่งสำหรับรอบติดตาม — ป้อนให้ agent reviewer/researcher
 *
 * Usage: node scripts/prev-context.mjs <TICKER>
 * พิมพ์ JSON ออก stdout: รอบล่าสุด, ทฤษฎีที่ยังถืออยู่ + ข้อความที่ต้องตัดสิน, entry_plan,
 * ผลตัดสินครั้งก่อนของแต่ละข้อความ, และหัวข้อข่าวที่มีในคลังแล้ว (กันค้นซ้ำ)
 *
 * ตั้งใจให้ *เล็ก*: ไม่รวม details_json (งบ/ตาราง) และไม่รวม content_md ของข่าว
 * เพราะ reviewer ต้องตัดสินทฤษฎีกับหลักฐานใหม่ ไม่ใช่อ่าน research ทั้งก้อนซ้ำ
 */
import { applySchema } from "./schema.mjs";
import { openDb } from "./db-client.mjs";

const args = process.argv.slice(2);
// ค่าปกติตัด summary_md/key_points ออก (ยาวและซ้ำกับ thesis_md) — reviewer ต้องการ "ข้อความที่ต้องตัดสิน" ไม่ใช่รายงานทั้งฉบับ
// --full ไว้ใช้ตอนส่งให้ analyst/theorist ทำรอบ update/full ที่ต้องเห็นบริบทเต็ม
const full = args.includes("--full");
const ticker = (args.find((a) => !a.startsWith("--")) ?? "").toUpperCase();
if (!ticker) {
  console.error("Usage: node scripts/prev-context.mjs <TICKER>");
  process.exit(1);
}

const db = openDb();
await applySchema(db);
const one = async (sql, args = []) => (await db.execute({ sql, args })).rows[0] ?? null;
const all = async (sql, args = []) => (await db.execute({ sql, args })).rows;
const parse = (v) => {
  if (v == null) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

try {
  const stock = await one(`SELECT ticker, name, sector, exchange, currency FROM stocks WHERE ticker = ?`, [ticker]);
  if (!stock) {
    console.error(`ไม่พบ ${ticker} ใน DB — ตัวนี้ยังไม่เคย research ต้องรัน /research-stock ก่อน`);
    process.exit(2);
  }

  const runs = await all(
    `SELECT id, run_date, run_type, price_at_run, summary_md FROM research_runs
     WHERE ticker = ? ORDER BY run_date DESC, id DESC`,
    [ticker]
  );
  const lastRun = runs[0] ?? null;
  const lastFull = runs.find((r) => (r.run_type ?? "full") === "full") ?? null;

  // ทฤษฎี/ผลวิเคราะห์/แผนเข้าซื้อ อาจไม่ได้อยู่ในรอบล่าสุด (รอบติดตามที่ยืนยันเดิมจะไม่สร้างใหม่)
  // → ใช้ของรอบล่าสุดที่ *มี* จริง เพราะนั่นคือความเห็นที่ยังถืออยู่
  const theoryRow = await one(
    `SELECT run_id FROM theories WHERE ticker = ? ORDER BY run_id DESC LIMIT 1`, [ticker]
  );
  const theoryRunId = theoryRow ? Number(theoryRow.run_id) : null;
  const theories = theoryRunId
    ? (await all(
        `SELECT id, title, thesis_md, assumptions, catalysts, risks, scenarios, confidence, horizon
         FROM theories WHERE run_id = ? ORDER BY id ASC`, [theoryRunId]
      )).map((t) => ({
        ...t,
        assumptions: parse(t.assumptions),
        catalysts: parse(t.catalysts),
        risks: parse(t.risks),
        scenarios: parse(t.scenarios),
      }))
    : [];

  const analysis = await one(
    `SELECT a.run_id, a.verdict, a.fundamentals_score, a.momentum_score, a.risk_level, a.key_points
     FROM analyses a JOIN research_runs r ON r.id = a.run_id
     WHERE a.ticker = ? ORDER BY r.run_date DESC, a.run_id DESC LIMIT 1`, [ticker]
  );
  const planRow = await one(
    `SELECT id, run_date, entry_plan_json FROM research_runs
     WHERE ticker = ? AND entry_plan_json IS NOT NULL ORDER BY run_date DESC, id DESC LIMIT 1`, [ticker]
  );

  // ผลตัดสินล่าสุดของแต่ละข้อความ (claim เดียวกันถูกตัดสินซ้ำได้ทุกสัปดาห์ — เอาครั้งล่าสุด)
  const checkRows = await all(
    `SELECT c.claim, c.claim_type, c.theory_title, c.status, v.review_date
     FROM thesis_checks c LEFT JOIN reviews v ON v.id = c.review_id
     WHERE c.ticker = ? ORDER BY c.review_id DESC, c.id DESC`, [ticker]
  );
  const seen = new Set();
  const lastChecks = [];
  for (const row of checkRows) {
    if (seen.has(row.claim)) continue;
    seen.add(row.claim);
    lastChecks.push({
      claim: row.claim, claim_type: row.claim_type, theory_title: row.theory_title,
      status: row.status, checked_on: row.review_date,
    });
  }

  // ประวัติการทบทวนรายสัปดาห์ — ทำให้ reviewer เห็นว่ายืนยันเดิมติดกันมากี่รอบแล้ว
  // (ถ้าตอบ "เหมือนเดิม" มา 6 สัปดาห์ติดโดยไม่มีอะไรเปลี่ยนเลย นั่นเป็นสัญญาณให้ตรวจให้หนักขึ้น ไม่ใช่ผ่านไปเฉยๆ)
  const reviews = await all(
    `SELECT id, review_date, stance, price_at_review, price_move_pct, escalate_reason, review_md
     FROM reviews WHERE ticker = ? ORDER BY review_date DESC, id DESC LIMIT 6`, [ticker]
  );
  const reviewHistory = reviews.map((r, idx) => ({
    ...r,
    // เก็บข้อความเต็มเฉพาะ 2 รอบล่าสุด ที่เก่ากว่านั้นเอาแค่จุดยืนพอ (คุมขนาด context)
    review_md: idx < 2 ? r.review_md : undefined,
  }));

  const items = await all(
    `SELECT title, url, source, published_at, category, importance, status
     FROM research_items WHERE ticker = ? AND COALESCE(status, 'active') = 'active'
     ORDER BY published_at DESC NULLS LAST, id DESC LIMIT 25`, [ticker]
  );

  console.log(JSON.stringify({
    stock,
    last_run: lastRun && {
      ...lastRun,
      summary_md: full ? lastRun.summary_md : undefined,
      verdict: analysis?.verdict ?? null,
      fundamentals_score: analysis?.fundamentals_score ?? null,
      momentum_score: analysis?.momentum_score ?? null,
      risk_level: analysis?.risk_level ?? null,
      key_points: full ? parse(analysis?.key_points) : undefined,
    },
    last_full_run: lastFull && { id: lastFull.id, run_date: lastFull.run_date },
    weeks_since_full_run: lastFull
      ? Math.floor((Date.now() - Date.parse(lastFull.run_date)) / (7 * 86400000))
      : null,
    run_count: runs.length,
    reviews: reviewHistory,
    same_stance_streak: (() => {
      let n = 0;
      for (const r of reviews) {
        if (r.stance === "same") n++;
        else break;
      }
      return n;
    })(),
    last_activity_on: [runs[0]?.run_date, reviews[0]?.review_date].filter(Boolean).sort().pop() ?? null,
    theories_from_run: theoryRunId,
    theories,
    entry_plan: planRow ? { set_on: planRow.run_date, ...parse(planRow.entry_plan_json) } : null,
    last_checks: lastChecks,
    known_items: items,
  }));
} finally {
  db.close();
}
