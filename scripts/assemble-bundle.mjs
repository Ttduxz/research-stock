/**
 * ประกอบผลจาก 3 ทีม (research.json + analysis.json + theories.json) เป็น bundle.json
 * Usage: node scripts/assemble-bundle.mjs <run-dir> [run_date] [--review=<review_id>|--review=latest]
 *   --review=<id>      รอบนี้เกิดจาก reviewer ยกธง → run_type "update" + review_id (ดู ingest.mjs)
 *   --review=latest    หยิบ id ของรอบทบทวนล่าสุดของ ticker จาก DB ให้เอง (ต้อง stance=escalate)
 * ปฏิเสธ research.json ที่ coverage.status ยังไม่ complete — งานค้นครึ่งเดียวห้ามกลายเป็นรายงาน
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const reviewArg = args.find((a) => a.startsWith("--review="));
const positional = args.filter((a) => !a.startsWith("--"));
const dir = positional[0];
if (!dir) {
  console.error("Usage: node scripts/assemble-bundle.mjs <run-dir> [run_date] [--review=<review_id>]");
  process.exit(1);
}
const runDate = positional[1] ?? new Date().toISOString().slice(0, 10);
const reviewRaw = reviewArg ? reviewArg.slice("--review=".length) : null;
let reviewId = reviewRaw && reviewRaw !== "latest" ? Number(reviewRaw) : null;
if (reviewRaw && reviewRaw !== "latest" && !(Number.isInteger(reviewId) && reviewId > 0)) {
  console.error(`✖ --review ต้องเป็นเลข id ของรอบทบทวน หรือ "latest" (ได้ "${reviewArg}")`);
  process.exit(1);
}

const read = (f) => JSON.parse(readFileSync(join(dir, f), "utf8"));
const readOptional = (f) => {
  try {
    return read(f);
  } catch {
    return null;
  }
};
const research = read("research.json");
if (research.coverage?.status && research.coverage.status !== "complete") {
  console.error(`✖ research.json ยัง ${research.coverage.status} (${research.coverage.reason ?? "-"}) — ประกอบ bundle ไม่ได้ เปิด session ใหม่แล้วรัน /research-stock ${research.stock?.ticker ?? "<TICKER>"} --resume`);
  process.exit(2);
}
// --review=latest: หยิบรอบทบทวนล่าสุดของ ticker นี้จาก DB ให้เอง (ไม่ต้องจำเลข id) — ต้องเป็นรอบที่ยกธง escalate จริง
if (reviewRaw === "latest") {
  const { openDb } = await import("./db-client.mjs");
  const db = openDb();
  const ticker = research.stock?.ticker;
  const rs = await db.execute({
    sql: `SELECT id, review_date, stance FROM reviews WHERE ticker = ? ORDER BY review_date DESC, id DESC LIMIT 1`,
    args: [ticker],
  });
  const rev = rs.rows[0];
  if (!rev) {
    console.error(`✖ ${ticker} ยังไม่เคยมีรอบทบทวนใน DB — ตัด --review ออกแล้วรันเป็น full run ปกติ`);
    process.exit(1);
  }
  if (rev.stance !== "escalate") {
    console.error(`✖ รอบทบทวนล่าสุดของ ${ticker} (#${rev.id} ${rev.review_date}) stance=${rev.stance} ไม่ใช่ escalate — ถ้าตั้งใจผูกจริงให้ระบุเลข id ตรงๆ`);
    process.exit(1);
  }
  reviewId = Number(rev.id);
  console.log(`review: ผูกกับรอบทบทวน #${reviewId} (${rev.review_date}, escalate)`);
}
const analysis = read("analysis.json");
const theoriesFile = read("theories.json");
// แผนแบ่งไม้จาก theorie team — ไฟล์แยก (optional)
const entryPlan = readOptional("entry_plan.json") ?? theoriesFile.entry_plan ?? null;

const bundle = {
  stock: research.stock,
  run: {
    run_date: runDate,
    price_at_run: research.price_at_run ?? null,
    summary_md: theoriesFile.summary_md ?? null,
    details: research.details ?? null,
    entry_plan: entryPlan,
    ...(reviewId ? { run_type: "update", review_id: reviewId } : {}),
  },
  research_items: research.research_items ?? [],
  analysis,
  theories: theoriesFile.theories ?? [],
};

const out = join(dir, "bundle.json");
writeFileSync(out, JSON.stringify(bundle, null, 2));
console.log(
  `✔ assembled ${out}: ${bundle.research_items.length} items, ` +
    `${bundle.theories.length} theories, details=${bundle.run.details ? "yes" : "no"}`
);
