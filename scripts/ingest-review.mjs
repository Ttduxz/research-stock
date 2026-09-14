/**
 * บันทึกผลรอบติดตามรายสัปดาห์ (ทีม reviewer) ลง DB
 *
 * Usage: node scripts/ingest-review.mjs <review.json> [research.json] [--force]
 *   research.json (ถ้ามี) = ข่าวใหม่ที่ researcher เจอสัปดาห์นี้ ใช้ field `research_items`
 *   --force = ข้ามการตรวจความซื่อสัตย์ของ claim/หลักฐาน (ใช้เมื่อรู้ว่ากำลังทำอะไรอยู่เท่านั้น)
 *
 * รูปแบบ review.json:
 * {
 *   "ticker": "NVDA", "review_date": "2026-09-10",
 *   "stance": "same | shifted | escalate",
 *   "review_md": "สรุปสั้นๆ ว่าสัปดาห์นี้เกิดอะไรและยังคิดเหมือนเดิมไหม",
 *   "escalate_reason": "...", "escalated_by": ["rule", "reviewer"],
 *   "plan_status": "no-action | watch | plan-live | plan-broken",
 *   "action_md": "1-2 ประโยค: แล้วต้องทำอะไรไหม (อิงแผนเดิมในรายงาน ไม่ใช่คำแนะนำใหม่)",
 *   "checks": [{ "claim": "<ข้อความเดิมแบบคัดลอกตรงตัว>",
 *                "claim_type": "assumption|catalyst|risk|invalidation|target",
 *                "theory_title": "...", "status": "confirmed|weakened|broken|too-early",
 *                "evidence_md": "...", "sources": [{ "title", "url", "published_at" }],
 *                "if_md": "...", "then_md": "...", "because_md": "...", "so_md": "... | null ถ้า too-early" }],
 *   "supersedes": [{ "old": { "url": "..." }, "new_url": "..." }]
 * }
 *
 * กติกาที่สคริปต์บังคับ (หัวใจของระบบ — ห้ามให้ agent แก้คำทำนายย้อนหลัง):
 *   1. claim ประเภท assumption/catalyst/risk ต้องตรงกับข้อความในทฤษฎีเดิมเป๊ะ ไม่ใช่เรียบเรียงใหม่
 *   2. status ที่ไม่ใช่ too-early ต้องมีหลักฐานอย่างน้อย 1 ชิ้นที่มี url
 *   3. ต้องมี action_md + plan_status เสมอ — รอบทบทวนที่บอกไม่ได้ว่า "แล้วยังไงต่อ" คือรอบที่ไม่มีประโยชน์
 */
import { readFileSync } from "node:fs";
import { applySchema } from "./schema.mjs";
import { openDb } from "./db-client.mjs";
import { upsertItem, markSuperseded } from "./items.mjs";
import { getQuotes } from "./quotes.mjs";

const argv = process.argv.slice(2);
const force = argv.includes("--force");
const [reviewPath, researchPath] = argv.filter((a) => !a.startsWith("--"));
if (!reviewPath) {
  console.error("Usage: node scripts/ingest-review.mjs <review.json> [research.json] [--force]");
  process.exit(1);
}

const review = JSON.parse(readFileSync(reviewPath, "utf8"));
const newItems = researchPath ? JSON.parse(readFileSync(researchPath, "utf8")).research_items ?? [] : [];

const ticker = String(review.ticker ?? "").toUpperCase();
const reviewDate = review.review_date ?? new Date().toISOString().slice(0, 10);
const STANCES = ["same", "shifted", "escalate"];
const STATUSES = ["confirmed", "weakened", "broken", "too-early"];
// สถานะของแผนเดิมหลังทบทวน — ไม่ใช่คำแนะนำใหม่ แต่บอกว่าแผนที่เขียนไว้แล้วยังใช้ได้ไหมและถึงจังหวะของมันหรือยัง
const PLAN_STATUSES = ["no-action", "watch", "plan-live", "plan-broken"];
const fail = (msg) => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};

if (!ticker) fail("review.ticker หายไป");
if (!STANCES.includes(review.stance)) fail(`review.stance ต้องเป็นหนึ่งใน: ${STANCES.join(", ")}`);
if (!review.review_md?.trim()) fail("review.review_md ว่าง");
if (!review.action_md?.trim())
  fail("review.action_md หายไป — ต้องบอกให้ได้ว่าอ่านจบแล้วต้องทำอะไรไหม (ถ้าไม่ต้องทำอะไรก็เขียนว่าไม่ต้อง พร้อมเหตุผล)");
if (review.action_md && review.action_md.length > 900)
  fail(`review.action_md ยาว ${review.action_md.length} ตัวอักษร — เกิน 900 แล้วไม่ใช่พาดหัวอีกต่อไป ย้ายรายละเอียดไป review_md`);
else if (review.action_md && review.action_md.length > 400)
  console.error(`⚠ action_md ยาว ${review.action_md.length} ตัวอักษร (ควร ≤400) — คนอ่านต้องได้คำตอบใน 1-3 ประโยค`);
if (!PLAN_STATUSES.includes(review.plan_status))
  fail(`review.plan_status ต้องเป็นหนึ่งใน: ${PLAN_STATUSES.join(", ")}`);
if (review.stance === "escalate" && !review.escalate_reason?.trim())
  fail("stance = escalate ต้องมี escalate_reason ว่าทำไมถึงต้องให้ analyst/theorist ทำใหม่");

const checks = review.checks ?? [];
for (const c of checks) {
  if (!c.claim?.trim()) fail("มี check ที่ไม่มี claim");
  if (!STATUSES.includes(c.status)) fail(`check "${c.claim.slice(0, 40)}" status ต้องเป็น: ${STATUSES.join(", ")}`);
  // คำอธิบาย 4 ช่องสำหรับหน้า /track-record — ไม่มีแล้วคนอ่านต้องไปเปิดทฤษฎี/ข่าวเองเพื่อเข้าใจว่าข้อนี้หมายถึงอะไร
  const missing = ["if_md", "then_md", "because_md", ...(c.status === "too-early" ? [] : ["so_md"])].filter(
    (f) => !String(c[f] ?? "").trim()
  );
  if (missing.length > 0)
    fail(`check "${c.claim.slice(0, 40)}" ขาด ${missing.join(", ")} — ดูหัวข้อ "อธิบายแต่ละข้อเป็น 4 ช่อง" ใน stock-reviewer.md`);
  // สีการ์ด risk เดาจาก status ไม่ได้ (บาง risk คือความเสี่ยงที่ทฤษฎีจะผิด เกิดจริงแล้วดีต่อหุ้น) จึงต้องระบุตรงๆ
  if (c.status !== "too-early" && !["good", "bad", "mixed"].includes(c.impact))
    fail(`check "${c.claim.slice(0, 40)}" ต้องมี impact = good | bad | mixed (ผลตรวจนี้ดีหรือร้ายต่อหุ้น)`);
}

const db = openDb();
await applySchema(db);
const j = (v) => (v == null ? null : JSON.stringify(v));

try {
  const runRs = await db.execute({
    sql: `SELECT id, run_date, price_at_run FROM research_runs
          WHERE ticker = ? ORDER BY run_date DESC, id DESC LIMIT 1`,
    args: [ticker],
  });
  if (runRs.rows.length === 0) fail(`${ticker} ยังไม่เคยมีรอบ research — ต้องรัน /research-stock ก่อน`);
  const baseRun = runRs.rows[0];
  const baseRunId = Number(review.base_run_id ?? baseRun.id);

  // ---- ตรวจว่า claim เป็นข้อความเดิมจริง ไม่ใช่เรียบเรียงใหม่ให้ตรงกับผลที่ออกมาแล้ว ----
  const theoryRow = (
    await db.execute({
      sql: `SELECT run_id FROM theories WHERE ticker = ? ORDER BY run_id DESC LIMIT 1`,
      args: [ticker],
    })
  ).rows[0];
  const originRunId = theoryRow ? Number(theoryRow.run_id) : null;
  const theories = originRunId
    ? (
        await db.execute({
          sql: `SELECT title, assumptions, catalysts, risks FROM theories WHERE run_id = ?`,
          args: [originRunId],
        })
      ).rows
    : [];
  const norm = (t) => String(t).replace(/\s+/g, " ").trim();
  const known = new Set();
  for (const t of theories) {
    for (const field of ["assumptions", "catalysts", "risks"]) {
      try {
        for (const c of JSON.parse(t[field] ?? "[]") ?? []) known.add(norm(c));
      } catch {
        // ทฤษฎีที่ JSON เสีย — ข้ามไป ไม่ควรทำให้ทั้งรอบล้ม
      }
    }
  }
  const strict = ["assumption", "catalyst", "risk"];
  const problems = [];
  for (const c of checks) {
    if (strict.includes(c.claim_type) && !known.has(norm(c.claim)))
      problems.push(`claim ไม่ตรงกับข้อความเดิมในทฤษฎี: "${c.claim.slice(0, 70)}"`);
    const hasUrl = (c.sources ?? []).some((s) => s?.url);
    if (c.status !== "too-early" && !hasUrl)
      problems.push(`status "${c.status}" ต้องมีหลักฐานที่มี url: "${c.claim.slice(0, 50)}"`);
  }
  if (problems.length > 0) {
    for (const p of problems) console.error(`✖ ${p}`);
    if (!force) {
      console.error(
        "\nclaim ต้องคัดลอกข้อความเดิมมาตรงตัว (ไม่งั้นคำทำนายจะถูกแก้ให้ตรงผลย้อนหลัง จน track record ไร้ความหมาย)" +
          "\nถ้าตั้งใจจริงให้ใส่ --force"
      );
      process.exit(1);
    }
    console.error("(--force: ข้ามการตรวจ)\n");
  }

  // ---- ราคา ณ วันที่ทบทวน ----
  let price = review.price_at_review ?? null;
  if (price == null) {
    const q = await getQuotes([ticker]);
    price = q.get(ticker)?.price ?? null;
  }
  const base = baseRun.price_at_run ?? null;
  const movePct = price && base ? Number((((price - base) / base) * 100).toFixed(2)) : null;

  const tx = await db.transaction("write");
  try {
    const rs = await tx.execute({
      sql: `INSERT INTO reviews
              (ticker, review_date, base_run_id, stance, review_md, price_at_review, price_move_pct,
               escalated_by, escalate_reason, action_md, plan_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      args: [
        ticker,
        reviewDate,
        baseRunId,
        review.stance,
        review.review_md,
        price,
        movePct,
        j(review.escalated_by ?? null),
        review.escalate_reason ?? null,
        review.action_md,
        review.plan_status,
      ],
    });
    const reviewId = Number(rs.rows[0].id);

    for (const c of checks) {
      await tx.execute({
        sql: `INSERT INTO thesis_checks
                (ticker, review_id, origin_run_id, theory_title, claim_type, claim, status, evidence_md, sources_json,
                 if_md, then_md, because_md, so_md, impact)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          ticker,
          reviewId,
          originRunId,
          c.theory_title ?? null,
          c.claim_type ?? "assumption",
          c.claim,
          c.status,
          c.evidence_md ?? null,
          j(c.sources ?? null),
          c.if_md.trim(),
          c.then_md.trim(),
          c.because_md.trim(),
          c.so_md?.trim() || null,
          c.status === "too-early" ? null : c.impact,
        ],
      });
    }

    let added = 0;
    const idByUrl = new Map();
    for (const item of newItems) {
      const { id, created } = await upsertItem(tx, { ticker, runId: baseRunId, onDate: reviewDate }, item);
      if (created) added++;
      if (item.url) idByUrl.set(item.url, id);
      if (item.supersedes) await markSuperseded(tx, ticker, item.supersedes, id);
    }
    let superseded = 0;
    for (const s of review.supersedes ?? []) {
      const ok = await markSuperseded(tx, ticker, s.old ?? s, s.new_url ? idByUrl.get(s.new_url) ?? null : null);
      if (ok) superseded++;
    }

    await tx.commit();
    const counts = {};
    for (const c of checks) counts[c.status] = (counts[c.status] ?? 0) + 1;
    console.log(`  → ${review.plan_status}: ${review.action_md}`);
    console.log(
      `✔ ingested review ${ticker} #${reviewId} (${reviewDate}): stance=${review.stance}, ` +
        `${checks.length} checks ${JSON.stringify(counts)}, ข่าวใหม่ ${added} (จาก ${newItems.length}), ` +
        `แทนที่ของเก่า ${superseded}, ราคา ${price ?? "-"} (${movePct == null ? "-" : movePct + "%"} จากรอบก่อน)`
    );
    if (review.stance === "escalate")
      console.log(`⚑ ยกธงทบทวนใหญ่: ${review.escalate_reason} → ต้องรัน analyst/theorist ต่อ`);
  } catch (err) {
    await tx.rollback();
    throw err;
  }
} finally {
  db.close();
}
