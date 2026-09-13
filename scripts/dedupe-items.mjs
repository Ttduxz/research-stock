/**
 * รวม research_items ที่ซ้ำกันจากยุคที่ item ผูกกับ run (ก่อนมีคลังระดับ ticker)
 *
 * Usage: node scripts/dedupe-items.mjs [--apply]
 *   ไม่ใส่ --apply = dry run (แค่บอกว่าจะรวมกี่แถว ไม่แตะ DB)
 *
 * เก็บแถวที่เจอครั้งแรกไว้ (id น้อยสุด = หลักฐานตอนนั้น) ตั้ง last_seen_run_id เป็นรอบล่าสุดที่ยังเจอ
 * แล้วลบแถวซ้ำที่เหลือ — หน้ารอบเก่าใน UI จะเห็น item น้อยลง เพราะข่าวย้ายไปอยู่คลังของ ticker แทน
 */
import { applySchema } from "./schema.mjs";
import { openDb } from "./db-client.mjs";
import { itemKey } from "./items.mjs";

const apply = process.argv.includes("--apply");
const db = openDb();
await applySchema(db);

try {
  const rs = await db.execute(
    `SELECT i.id, i.ticker, i.url, i.title, i.run_id, r.run_date
     FROM research_items i LEFT JOIN research_runs r ON r.id = i.run_id ORDER BY i.id ASC`
  );
  const groups = new Map();
  for (const row of rs.rows) {
    const k = `${row.ticker}|${itemKey(row)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(row);
  }

  const dupes = [...groups.values()].filter((g) => g.length > 1);
  const removing = dupes.reduce((n, g) => n + g.length - 1, 0);
  const byTicker = {};
  for (const g of dupes) byTicker[g[0].ticker] = (byTicker[g[0].ticker] ?? 0) + g.length - 1;

  console.log(
    `${rs.rows.length} items → เหลือ ${rs.rows.length - removing} (รวมซ้ำ ${removing} แถวจาก ${dupes.length} กลุ่ม)`
  );
  for (const [t, n] of Object.entries(byTicker).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${t}: -${n}`);
  }

  if (!apply) {
    console.log("\n(dry run — ใส่ --apply เพื่อเขียนจริง)");
  } else if (removing > 0) {
    const tx = await db.transaction("write");
    try {
      for (const g of dupes) {
        const keep = g[0];
        const lastSeenRun = Math.max(...g.map((r) => Number(r.run_id)));
        const lastSeenOn = g.map((r) => r.run_date).filter(Boolean).sort().pop() ?? null;
        await tx.execute({
          sql: `UPDATE research_items
                SET last_seen_run_id = ?, last_seen_on = COALESCE(?, last_seen_on), status = COALESCE(status, 'active')
                WHERE id = ?`,
          args: [lastSeenRun, lastSeenOn, keep.id],
        });
        for (const row of g.slice(1)) {
          await tx.execute({ sql: `DELETE FROM research_items WHERE id = ?`, args: [row.id] });
        }
      }
      await tx.commit();
      console.log(`\n✔ รวมซ้ำแล้ว ${removing} แถว`);
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }
} finally {
  db.close();
}
