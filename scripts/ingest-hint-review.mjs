/**
 * บันทึกผลทบทวน hint (ทีม hint-reviewer) ลง DB
 *
 * Usage: node scripts/ingest-hint-review.mjs <hint-review.json>
 * {
 *   "slug": "...", "checked_on": "YYYY-MM-DD",
 *   "status": "active | played-out | invalidated",
 *   "status_md": "1-3 ประโยค ภาษาคน",
 *   "sources": [{ "title", "url", "published_at" }]
 * }
 *
 * กติกาที่สคริปต์บังคับ (ไม่มี --force):
 *   1. slug ต้องมีอยู่จริง
 *   2. สถานะที่ไม่ใช่ active หรือสถานะที่ต่างจากครั้งก่อน ต้องมีหลักฐานที่มี url อย่างน้อย 1 ชิ้น
 *      — hint ที่ถูกปิดจะหายจากการใช้ปรับหุ้นตัวอื่นทันที ต้องปิดด้วยหลักฐาน ไม่ใช่ความรู้สึก
 *   3. แก้ได้เฉพาะคอลัมน์สถานะ ไม่แตะเนื้อรายงานเดิม
 */
import { readFileSync } from "node:fs";
import { applySchema } from "./schema.mjs";
import { openDb } from "./db-client.mjs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/ingest-hint-review.mjs <hint-review.json>");
  process.exit(1);
}

const STATUSES = ["active", "played-out", "invalidated"];
const review = JSON.parse(readFileSync(file, "utf8"));
const fail = (msg) => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};

if (!review.slug) fail("ไม่มี slug");
if (!STATUSES.includes(review.status)) fail(`status ต้องเป็นหนึ่งใน: ${STATUSES.join(", ")}`);
const statusMd = String(review.status_md ?? "").trim();
if (!statusMd) fail("status_md ว่าง — ต้องบอกว่าตอนนี้เป็นอย่างไรเพราะอะไร");
if (statusMd.length > 900) fail(`status_md ยาว ${statusMd.length} ตัวอักษร (ควร ≤400) — ย่อให้เป็น 1-3 ประโยค`);
const sources = (review.sources ?? []).filter((s) => s?.url);
const checkedOn = review.checked_on ?? new Date().toISOString().slice(0, 10);

const db = openDb();
await applySchema(db);

try {
  const rs = await db.execute({ sql: "SELECT COALESCE(status, 'active') AS status FROM hints WHERE slug = ?", args: [review.slug] });
  if (rs.rows.length === 0) fail(`ไม่พบ hint slug "${review.slug}"`);
  const prev = String(rs.rows[0].status);

  if ((review.status !== "active" || review.status !== prev) && sources.length === 0)
    fail(`เปลี่ยนเป็น "${review.status}" (เดิม "${prev}") ต้องมีหลักฐานที่มี url อย่างน้อย 1 ชิ้น`);

  await db.execute({
    sql: `UPDATE hints SET status = ?, status_md = ?, status_sources_json = ?, last_checked_on = ? WHERE slug = ?`,
    args: [review.status, statusMd, sources.length ? JSON.stringify(sources) : null, checkedOn, review.slug],
  });
  console.log(`✔ ${review.slug}: ${prev} → ${review.status} (ตรวจ ${checkedOn})`);
  if (review.status !== "active" && prev === "active")
    console.log(`⚑ hint นี้จะไม่ถูกใช้ในขั้น 2.6 อีก — ดูหุ้นที่เคยอ้างถึงด้วย node scripts/hint-exposure.mjs ${review.slug}`);
} finally {
  db.close();
}
