/**
 * List hint ล่าสุดใน DB (ไว้ให้ orchestrator เช็ค dedup ก่อนสั่ง hint-analyst วิเคราะห์ซ้ำ)
 *
 * Usage: node scripts/list-hints.mjs [days=30]
 * พิมพ์ JSON array ของ { slug, title, dek, direction, magnitude, run_date, discovered_from } ออก stdout
 * direction: positive (โอกาส) | negative (ความเสี่ยง) | mixed — hint ไม่ใช่แค่คำเตือนเสมอไป
 */
import { applySchema } from "./schema.mjs";
import { openDb } from "./db-client.mjs";

const days = Number(process.argv[2] ?? 30);
const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

const db = openDb();
await applySchema(db);

try {
  const rs = await db.execute({
    sql: `SELECT slug, title, dek, direction, magnitude, run_date, discovered_from FROM hints
          WHERE run_date >= ? ORDER BY run_date DESC, id DESC`,
    args: [since],
  });
  console.log(JSON.stringify(rs.rows, null, 2));
} finally {
  db.close();
}
