/**
 * List hint ใน DB
 *
 * Usage: node scripts/list-hints.mjs [days=30] [--active] [--due=N]
 *   days      = ย้อนหลังตาม run_date กี่วัน — ขั้น 2.5 ใช้ 30 เพื่อกัน dedup (นับ **ทุกสถานะ**
 *               กันสร้างรายงานเรื่องที่เคยถูกหักล้างไปแล้วซ้ำ)
 *   --active  = เฉพาะ hint ที่ยังมีผล — ขั้น 2.6 ใช้หา exposure: เรื่องที่เกิดขึ้นครบแล้ว/ถูกหักล้างแล้ว
 *               ห้ามถูกเอาไปปรับการวิเคราะห์หุ้นตัวอื่นอีก
 *   --due=N   = hint ที่ยังมีผลและไม่ได้ตรวจเกิน N วัน (นับจาก last_checked_on หรือ run_date) — คิวของ /review-hints
 *
 * พิมพ์ JSON array ของ { slug, title, dek, direction, magnitude, run_date, discovered_from, status, last_checked_on }
 * direction: positive (โอกาส) | negative (ความเสี่ยง) | mixed — hint ไม่ใช่แค่คำเตือนเสมอไป
 */
import { applySchema } from "./schema.mjs";
import { openDb } from "./db-client.mjs";

const args = process.argv.slice(2);
const activeOnly = args.includes("--active");
const dueArg = args.find((a) => a.startsWith("--due"));
// ห้ามใช้ `|| 14` — --due=0 (ทุก hint ที่ยังมีผล) จะกลายเป็น 14
const dueVal = Number(dueArg?.split("=")[1]);
const dueDays = dueArg ? (dueArg.includes("=") && Number.isFinite(dueVal) && dueVal >= 0 ? dueVal : 14) : null;
const positional = args.find((a) => !a.startsWith("--"));
// --due ดูทุก hint ที่ยังมีผลไม่ว่าจะเก่าแค่ไหน ถ้าไม่ได้ระบุ days เอง
const days = Number(positional ?? (dueDays != null ? 3650 : 30));
const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

const where = ["run_date >= ?"];
const sqlArgs = [since];
if (activeOnly || dueDays != null) where.push("COALESCE(status, 'active') = 'active'");
if (dueDays != null) {
  where.push("julianday('now') - julianday(COALESCE(last_checked_on, run_date)) >= ?");
  sqlArgs.push(dueDays);
}

const db = openDb();
await applySchema(db);

try {
  const rs = await db.execute({
    sql: `SELECT slug, title, dek, direction, magnitude, run_date, discovered_from,
                 COALESCE(status, 'active') AS status, last_checked_on
          FROM hints WHERE ${where.join(" AND ")}
          ORDER BY ${dueDays != null ? "COALESCE(last_checked_on, run_date) ASC" : "run_date DESC"}, id DESC`,
    args: sqlArgs,
  });
  console.log(JSON.stringify(rs.rows, null, 2));
} finally {
  db.close();
}
