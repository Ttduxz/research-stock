/**
 * ดูความคืบหน้าของรอบทบทวนที่กำลังรันอยู่ — เรียกเมื่อไหร่ก็ได้ ไม่รบกวนงานที่รัน
 *
 * Usage: node scripts/review-progress.mjs [YYYY-MM-DD]   (ไม่ใส่ = วันนี้)
 *
 * อ่านสถานะจาก 2 ที่:
 *   1. โฟลเดอร์ pipeline/output/<TICKER>-review-<วันที่> → บอกว่าตัวนั้นถึงขั้นไหน
 *      (มีโฟลเดอร์ = เริ่มแล้ว, มี research.json = ค้นข่าวเสร็จ, มี review.json = ตัดสินเสร็จ)
 *   2. ตาราง reviews ใน DB → ตัวที่บันทึกเสร็จสมบูรณ์แล้ว
 * ต่างกันตรงที่ข้อ 1 เห็น "กำลังทำอะไรอยู่ตอนนี้" ส่วนข้อ 2 เห็นเฉพาะที่จบแล้ว
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { applySchema } from "./schema.mjs";
import { openDb } from "./db-client.mjs";

const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const OUT = "pipeline/output";

const db = openDb();
await applySchema(db);

try {
  const done = new Map(
    (
      await db.execute({
        sql: `SELECT ticker, stance, plan_status FROM reviews WHERE review_date = ? ORDER BY id`,
        args: [date],
      })
    ).rows.map((r) => [r.ticker, r])
  );

  const dirs = existsSync(OUT)
    ? readdirSync(OUT)
        .filter((d) => d.endsWith(`-review-${date}`))
        .map((d) => ({
          ticker: d.replace(`-review-${date}`, ""),
          path: join(OUT, d),
          mtime: statSync(join(OUT, d)).mtimeMs,
        }))
        .sort((a, b) => a.mtime - b.mtime)
    : [];

  const queue = (
    await db.execute(`
      SELECT r.ticker FROM research_runs r
      WHERE r.id = (SELECT id FROM research_runs WHERE ticker = r.ticker ORDER BY run_date DESC, id DESC LIMIT 1)
    `)
  ).rows.map((r) => r.ticker);

  console.log(`\nความคืบหน้ารอบทบทวน ${date}`);
  console.log(`เสร็จแล้ว ${done.size} ตัว · เริ่มแล้ว ${dirs.length} ตัว · หุ้นในระบบทั้งหมด ${queue.length} ตัว\n`);

  if (dirs.length === 0) {
    console.log("ยังไม่มี ticker ไหนเริ่มเลย — ถ้างานควรรันอยู่ แปลว่ามันยังไม่ได้เริ่มทำงานจริง");
  }

  for (const d of dirs) {
    const has = (f) => existsSync(join(d.path, f));
    let stage;
    if (done.has(d.ticker)) {
      const r = done.get(d.ticker);
      stage = `✓ เสร็จ — ${r.stance} · ${r.plan_status}`;
    } else if (has("review.json")) stage = "… ตัดสินเสร็จ รอบันทึกลง DB";
    else if (has("research.json")) stage = "… ค้นข่าวเสร็จ กำลังตัดสิน (reviewer)";
    else if (has("prev-context.json")) stage = "… กำลังค้นข่าว (researcher)";
    else stage = "… เพิ่งเริ่ม";
    const ago = Math.round((Date.now() - d.mtime) / 60000);
    console.log(`  ${d.ticker.padEnd(6)} ${stage}   (แตะล่าสุด ${ago} นาทีที่แล้ว)`);
  }

  // ตัวที่ยังไม่เริ่มเลย
  const started = new Set(dirs.map((d) => d.ticker));
  const notStarted = queue.filter((t) => !started.has(t) && !done.has(t));
  if (notStarted.length > 0) {
    console.log(`\nยังไม่ได้เริ่ม ${notStarted.length} ตัว: ${notStarted.join(", ")}`);
  }
} finally {
  db.close();
}
