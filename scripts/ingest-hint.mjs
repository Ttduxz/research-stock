/**
 * Ingest รายงาน "hint" (ประเด็นที่กระทบกว้างกว่าตัวหุ้นที่สั่ง research) ลง DB
 *
 * Usage: node scripts/ingest-hint.mjs <path-to-hint.json>
 *
 * รูปแบบ hint.json:
 * {
 *   "slug": "kebab-case-unique",
 *   "title": "...",
 *   "dek": "หนึ่งบรรทัดอธิบายว่าเรื่องนี้คืออะไร",
 *   "direction": "positive|negative|mixed",
 *   "magnitude": "high|mid|low",
 *   "discovered_from": "NVDA,MSFT",
 *   "run_date": "YYYY-MM-DD",
 *   "stats": [{ "label": "...", "value": "...", "note": "..." }],
 *   "content_md": "...markdown เนื้อหาหลัก (## หัวข้อย่อยได้)...",
 *   "opinion_md": "...ความเห็นส่วนตัวปิดท้าย (ถ้ามี)...",
 *   "sources": [{ "group": "...", "title": "...", "url": "..." }]
 * }
 *
 * hint ไม่ใช่แค่ความเสี่ยง — direction=positive คือโอกาส/catalyst เชิงบวกที่กระทบกว้าง
 * เท่าๆ กับ direction=negative ที่เป็นความเสี่ยงเชิงระบบ
 *
 * slug ซ้ำ = update รายงานเดิม (กันกรณี hint เดียวกันถูกเจอซ้ำแล้วอยากอัปเดตข้อมูลใหม่)
 */
import { readFileSync } from "node:fs";
import { applySchema } from "./schema.mjs";
import { openDb } from "./db-client.mjs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/ingest-hint.mjs <path-to-hint.json>");
  process.exit(1);
}

const hint = JSON.parse(readFileSync(file, "utf8"));

if (!hint.slug || !hint.title || !hint.content_md) {
  console.error("hint.json ต้องมี slug, title, content_md");
  process.exit(1);
}
const validDirection = ["positive", "negative", "mixed"];
if (hint.direction && !validDirection.includes(hint.direction)) {
  console.error(`direction ต้องเป็นหนึ่งใน: ${validDirection.join(", ")}`);
  process.exit(1);
}
const validMagnitude = ["high", "mid", "low"];
if (hint.magnitude && !validMagnitude.includes(hint.magnitude)) {
  console.error(`magnitude ต้องเป็นหนึ่งใน: ${validMagnitude.join(", ")}`);
  process.exit(1);
}

const db = openDb();
await applySchema(db);

const j = (v) => (v == null ? null : JSON.stringify(v));

try {
  await db.execute({
    sql: `INSERT INTO hints (slug, title, dek, direction, magnitude, discovered_from, run_date, stats_json, content_md, opinion_md, sources_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(slug) DO UPDATE SET
            title = excluded.title,
            dek = excluded.dek,
            direction = excluded.direction,
            magnitude = excluded.magnitude,
            discovered_from = excluded.discovered_from,
            run_date = excluded.run_date,
            stats_json = excluded.stats_json,
            content_md = excluded.content_md,
            opinion_md = excluded.opinion_md,
            sources_json = excluded.sources_json`,
    args: [
      hint.slug,
      hint.title,
      hint.dek ?? null,
      hint.direction ?? null,
      hint.magnitude ?? null,
      hint.discovered_from ?? null,
      hint.run_date ?? new Date().toISOString().slice(0, 10),
      j(hint.stats),
      hint.content_md,
      hint.opinion_md ?? null,
      j(hint.sources),
    ],
  });
  console.log(`✔ ingested hint: ${hint.slug}`);
} finally {
  db.close();
}
