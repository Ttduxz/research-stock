/**
 * เก็บข่าวเก่าที่ไม่สำคัญพอเข้าคลัง (status = archived) — ไม่ลบทิ้ง
 *
 * Usage: node scripts/archive-items.mjs [TICKER...] [--days=75] [--apply]
 *   ไม่ใส่ --apply = dry run
 *
 * เกณฑ์ (ต้องเข้าครบทุกข้อ):
 *   - หมวดที่เน่าตามเวลา: news / sentiment / industry / other
 *     (financials / filing ไม่ได้ "เก่า" แต่ "ถูกแทนที่" เมื่องบใหม่ออก → ใช้ superseded ไม่ใช่ archived)
 *   - importance ≤ 3 (ข่าวที่ทีม research ให้ 4-5 ถือว่าสำคัญ ปล่อยไว้)
 *   - เก่ากว่า --days วัน นับจาก published_at (ถ้าไม่มีก็ใช้ first_seen_on)
 *   - ไม่ถูกอ้างอิงในทฤษฎีหรือสรุปของรอบล่าสุด (ข่าวเก่าที่ยังเป็นเสาหลักของ thesis ต้องอยู่ต่อ)
 */
import { applySchema } from "./schema.mjs";
import { openDb } from "./db-client.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const daysArg = args.find((a) => a.startsWith("--days="));
const maxAgeDays = daysArg ? Number(daysArg.split("=")[1]) : 75;
const wanted = args.filter((a) => !a.startsWith("--")).map((t) => t.toUpperCase());

const DECAYING = new Set(["news", "sentiment", "industry", "other"]);
const cutoff = new Date(Date.now() - maxAgeDays * 86400000).toISOString().slice(0, 10);

const db = openDb();
await applySchema(db);

try {
  // ข้อความทั้งหมดที่ "ยังถืออยู่" — ใช้เช็คว่าข่าวชิ้นไหนถูกอ้างเป็นหลักฐานของทฤษฎีปัจจุบัน
  const refRows = (
    await db.execute(`
      SELECT t.ticker, COALESCE(t.thesis_md,'') || COALESCE(t.risks,'') || COALESCE(t.catalysts,'') AS txt
      FROM theories t
      WHERE t.run_id = (SELECT id FROM research_runs WHERE ticker = t.ticker ORDER BY run_date DESC, id DESC LIMIT 1)
      UNION ALL
      SELECT r.ticker, COALESCE(r.summary_md,'') AS txt FROM research_runs r
      WHERE r.id = (SELECT id FROM research_runs WHERE ticker = r.ticker ORDER BY run_date DESC, id DESC LIMIT 1)
    `)
  ).rows;
  const refText = new Map();
  for (const row of refRows) refText.set(row.ticker, (refText.get(row.ticker) ?? "") + row.txt);

  const items = (
    await db.execute({
      sql: `SELECT id, ticker, category, title, url, published_at, first_seen_on, importance
            FROM research_items
            WHERE COALESCE(status, 'active') = 'active' AND COALESCE(importance, 3) <= 3
              AND COALESCE(published_at, first_seen_on, '9999') < ?`,
      args: [cutoff],
    })
  ).rows.filter(
    (i) =>
      DECAYING.has(i.category) &&
      (wanted.length === 0 || wanted.includes(i.ticker)) &&
      !(i.url && (refText.get(i.ticker) ?? "").includes(i.url))
  );

  const byTicker = {};
  for (const i of items) byTicker[i.ticker] = (byTicker[i.ticker] ?? 0) + 1;

  console.log(`เข้าเกณฑ์ archive ${items.length} ข่าว (เก่ากว่า ${maxAgeDays} วัน = ก่อน ${cutoff}, importance ≤ 3)`);
  for (const [t, n] of Object.entries(byTicker).sort((a, b) => b[1] - a[1])) console.log(`  ${t}: ${n}`);

  if (!apply) {
    console.log("\n(dry run — ใส่ --apply เพื่อเขียนจริง)");
  } else if (items.length > 0) {
    const tx = await db.transaction("write");
    try {
      for (const i of items) {
        await tx.execute({ sql: `UPDATE research_items SET status = 'archived' WHERE id = ?`, args: [i.id] });
      }
      await tx.commit();
      console.log(`\n✔ archived ${items.length} ข่าว (ยังดูย้อนหลังได้ ไม่ได้ลบ)`);
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }
} finally {
  db.close();
}
