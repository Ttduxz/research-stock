/**
 * Ingest ผลลัพธ์จาก pipeline (research → analyze → theorie) ลง DB
 *
 * Usage: node scripts/ingest.mjs <path-to-bundle.json>
 *
 * รูปแบบ bundle.json:
 * {
 *   "stock":  { "ticker", "name", "exchange", "sector", "currency" },
 *   "run":    { "run_date", "summary_md", "price_at_run",
 *               "run_type": "full|update"  // update = รอบที่เกิดจาก reviewer ยกธง (ดู scripts/ingest-review.mjs)
 *               "review_id": 12,           // review ที่ยกธงให้เกิดรอบนี้ (ถ้ามี)
 *               "delta": { ... } },        // สรุปว่าต่างจากรอบก่อนยังไง
 *   "research_items": [{ "category", "title", "url", "source", "published_at", "content_md", "importance" }],
 *   "analysis": { "verdict", "fundamentals_score", "momentum_score", "risk_level", "key_points": [], "content_md" },
 *   "theories": [{ "title", "thesis_md", "assumptions": [], "catalysts": [], "risks": [],
 *                  "scenarios": {"bull":{},"base":{},"bear":{}}, "confidence", "horizon" }]
 * }
 */
import { readFileSync } from "node:fs";
import { applySchema } from "./schema.mjs";
import { openDb } from "./db-client.mjs";
import { upsertItem } from "./items.mjs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/ingest.mjs <path-to-bundle.json>");
  process.exit(1);
}

const bundle = JSON.parse(readFileSync(file, "utf8"));
const { stock, run, research_items = [], analysis, theories = [] } = bundle;

if (!stock?.ticker || !stock?.name) {
  console.error("bundle.stock ต้องมี ticker และ name");
  process.exit(1);
}
const ticker = stock.ticker.toUpperCase();
const validVerdicts = ["bullish", "neutral", "bearish"];
if (analysis && !validVerdicts.includes(analysis.verdict)) {
  console.error(`analysis.verdict ต้องเป็นหนึ่งใน: ${validVerdicts.join(", ")}`);
  process.exit(1);
}

const db = openDb();
await applySchema(db);

const j = (v) => (v == null ? null : JSON.stringify(v));

// รอบก่อนหน้าของหุ้นตัวนี้ — ผูกไว้เพื่อไล่สายความเห็นย้อนหลังได้ว่าเปลี่ยนใจตอนไหนเพราะอะไร
const prevRun = (
  await db.execute({
    sql: `SELECT id FROM research_runs WHERE ticker = ? ORDER BY run_date DESC, id DESC LIMIT 1`,
    args: [ticker],
  })
).rows[0];
const prevRunId = prevRun ? Number(prevRun.id) : null;
const runDate = run?.run_date ?? new Date().toISOString().slice(0, 10);

const tx = await db.transaction("write");
try {
  await tx.execute({
    sql: `INSERT INTO stocks (ticker, name, exchange, sector, currency)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(ticker) DO UPDATE SET
            name = excluded.name,
            exchange = COALESCE(excluded.exchange, stocks.exchange),
            sector = COALESCE(excluded.sector, stocks.sector),
            currency = excluded.currency`,
    args: [ticker, stock.name, stock.exchange ?? null, stock.sector ?? null, stock.currency ?? "USD"],
  });

  const runRs = await tx.execute({
    sql: `INSERT INTO research_runs
            (ticker, run_date, status, summary_md, price_at_run, details_json, entry_plan_json,
             run_type, prev_run_id, delta_json)
          VALUES (?, ?, 'complete', ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    args: [
      ticker,
      runDate,
      run?.summary_md ?? null,
      run?.price_at_run ?? null,
      j(run?.details),
      j(run?.entry_plan),
      run?.run_type ?? "full",
      prevRunId,
      j(run?.delta),
    ],
  });
  const runId = Number(runRs.rows[0].id);

  // item เป็นของ ticker ไม่ใช่ของ run — ที่เคยเจอแล้วจะถูกประทับว่ายังเจออยู่ ไม่บันทึกซ้ำ
  let newItems = 0;
  for (const item of research_items) {
    const { created } = await upsertItem(tx, { ticker, runId, onDate: runDate }, item);
    if (created) newItems++;
  }

  if (analysis) {
    await tx.execute({
      sql: `INSERT INTO analyses (run_id, ticker, verdict, fundamentals_score, momentum_score, risk_level, key_points, content_md)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        runId,
        ticker,
        analysis.verdict,
        analysis.fundamentals_score ?? null,
        analysis.momentum_score ?? null,
        analysis.risk_level ?? null,
        j(analysis.key_points),
        analysis.content_md ?? "",
      ],
    });
  }

  for (const t of theories) {
    await tx.execute({
      sql: `INSERT INTO theories (run_id, ticker, title, thesis_md, assumptions, catalysts, risks, scenarios, confidence, horizon)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        runId,
        ticker,
        t.title,
        t.thesis_md ?? "",
        j(t.assumptions),
        j(t.catalysts),
        j(t.risks),
        j(t.scenarios),
        t.confidence ?? null,
        t.horizon ?? null,
      ],
    });
  }

  // ผูกกลับไปที่ review ที่ยกธงให้เกิดรอบนี้ (ถ้ามี) — ให้ timeline เชื่อมกันได้ว่าใครสั่งให้ทบทวน
  if (run?.review_id) {
    await tx.execute({
      sql: `UPDATE reviews SET resulting_run_id = ? WHERE id = ?`,
      args: [runId, Number(run.review_id)],
    });
  }

  await tx.commit();
  console.log(
    `✔ ingested ${ticker}: run #${runId} (${run?.run_type ?? "full"}), ` +
      `${newItems} ข่าวใหม่ / ${research_items.length} ที่ส่งมา, ` +
      `${analysis ? 1 : 0} analysis, ${theories.length} theories`
  );
} catch (err) {
  await tx.rollback();
  throw err;
} finally {
  db.close();
}
