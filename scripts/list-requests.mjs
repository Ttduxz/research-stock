/**
 * คิวคำขอให้วิเคราะห์หุ้นจากผู้ใช้เว็บ (ไม่แสดงอีเมล) — ไว้เลือกว่าจะรัน /research-stock ตัวไหนต่อ
 *
 * Usage: node scripts/list-requests.mjs [--all]
 *   ค่าเริ่มต้นแสดงเฉพาะ ticker ที่ยังไม่มีในระบบ เรียงคนขอมากสุดก่อน · --all รวมตัวที่วิเคราะห์แล้วด้วย
 */
import { applySchema } from "./schema.mjs";
import { openDb } from "./db-client.mjs";

const all = process.argv.includes("--all");
const db = openDb();
await applySchema(db);

try {
  const rs = await db.execute(`
    SELECT r.ticker,
           COUNT(*) AS requesters,
           MAX(r.created_at) AS last_requested,
           GROUP_CONCAT(r.note, ' | ') AS notes,
           EXISTS (SELECT 1 FROM stocks s WHERE s.ticker = r.ticker) AS in_system
    FROM stock_requests r
    GROUP BY r.ticker
    ${all ? "" : "HAVING in_system = 0"}
    ORDER BY in_system ASC, requesters DESC, last_requested DESC
  `);
  console.log(JSON.stringify(rs.rows, null, 2));
} finally {
  db.close();
}
