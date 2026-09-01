/**
 * คัดลอกข้อมูลทั้งหมดจาก DB ไฟล์ local (data/stock.db) ขึ้น Turso (จาก env)
 * ใช้ครั้งเดียวตอนย้ายขึ้น cloud — ต้องตั้ง TURSO_DATABASE_URL + TURSO_AUTH_TOKEN ใน .env ก่อน
 * Usage: node scripts/migrate-to-turso.mjs
 */
import { createClient } from "@libsql/client";
import { applySchema } from "./schema.mjs";
import { openDb } from "./db-client.mjs";

const remote = openDb(); // อ่าน .env — ต้องได้ Turso
const localDb = createClient({ url: "file:./data/stock.db" });

if (!process.env.TURSO_DATABASE_URL) {
  console.error("ยังไม่ได้ตั้ง TURSO_DATABASE_URL ใน .env — ยกเลิก");
  process.exit(1);
}

await applySchema(remote);

const TABLES = ["stocks", "research_runs", "research_items", "analyses", "theories"];
for (const table of TABLES) {
  const rs = await localDb.execute(`SELECT * FROM ${table}`);
  if (rs.rows.length === 0) {
    console.log(`- ${table}: ว่าง ข้าม`);
    continue;
  }
  const cols = rs.columns;
  const placeholders = cols.map(() => "?").join(", ");
  for (const row of rs.rows) {
    await remote.execute({
      sql: `INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`,
      args: cols.map((c) => row[c] ?? null),
    });
  }
  console.log(`✔ ${table}: คัดลอก ${rs.rows.length} แถว`);
}

console.log("✔ migrate เสร็จ — เว็บจะอ่านจาก Turso ทันทีที่ Vercel มี env เดียวกัน");
localDb.close();
remote.close();
