/**
 * หุ้นที่รายงานฉบับล่าสุดอ้างถึง hint นี้ (ลิงก์ /insights/<slug>)
 * ใช้ตอน hint ถูกทบทวนว่าเกิดขึ้นครบแล้ว/ถูกหักล้างแล้ว — รายงานหุ้นพวกนี้เคย factor เรื่องนี้เข้าไป
 * จึงควรถูกทบทวนรอบหน้า (ไม่รัน pipeline ใหม่อัตโนมัติ — ให้ orchestrator/user ตัดสิน)
 *
 * Usage: node scripts/hint-exposure.mjs <slug>
 */
import { applySchema } from "./schema.mjs";
import { openDb } from "./db-client.mjs";

const slug = process.argv[2];
if (!slug) {
  console.error("Usage: node scripts/hint-exposure.mjs <slug>");
  process.exit(1);
}

const db = openDb();
await applySchema(db);

try {
  const pattern = `%/insights/${slug}%`;
  const rs = await db.execute({
    sql: `SELECT DISTINCT r.ticker, r.run_date
          FROM research_runs r
          LEFT JOIN analyses a ON a.run_id = r.id
          LEFT JOIN theories t ON t.run_id = r.id
          WHERE r.id = (SELECT id FROM research_runs WHERE ticker = r.ticker ORDER BY run_date DESC, id DESC LIMIT 1)
            AND (r.summary_md LIKE ? OR r.entry_plan_json LIKE ? OR a.content_md LIKE ? OR a.key_points LIKE ?
                 OR t.thesis_md LIKE ? OR t.assumptions LIKE ? OR t.catalysts LIKE ? OR t.risks LIKE ? OR t.scenarios LIKE ?)
          ORDER BY r.ticker`,
    args: Array(9).fill(pattern),
  });
  console.log(JSON.stringify(rs.rows, null, 2));
} finally {
  db.close();
}
