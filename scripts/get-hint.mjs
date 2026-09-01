/**
 * ดึงรายงาน hint เดียวแบบเต็ม (ไว้ให้ orchestrator อ่านเนื้อหาก่อนสรุปส่งให้ analyst/theorist
 * เวลาหุ้นที่กำลัง research เกี่ยวข้อง/อาจได้รับผลกระทบจาก hint ที่มีอยู่แล้ว)
 *
 * Usage: node scripts/get-hint.mjs <slug>
 * พิมพ์ JSON ของ hint เต็มออก stdout (หรือ null ถ้าไม่เจอ)
 */
import { applySchema } from "./schema.mjs";
import { openDb } from "./db-client.mjs";

const slug = process.argv[2];
if (!slug) {
  console.error("Usage: node scripts/get-hint.mjs <slug>");
  process.exit(1);
}

const db = openDb();
await applySchema(db);

try {
  const rs = await db.execute({
    sql: "SELECT * FROM hints WHERE slug = ?",
    args: [slug],
  });
  console.log(JSON.stringify(rs.rows[0] ?? null, null, 2));
} finally {
  db.close();
}
