/**
 * Export ข้อมูลทั้งหมดจาก DB เป็น data/export.json (snapshot)
 * ใช้ในโหมดไม่มี Turso: snapshot จะถูกแนบไปกับ deployment ให้เว็บบน Vercel อ่าน
 */
import { writeFileSync } from "node:fs";
import { openDb } from "./db-client.mjs";

const db = openDb();
const tables = ["stocks", "research_runs", "research_items", "analyses", "theories", "hints", "reviews", "thesis_checks"];
const snapshot = { exported_at: new Date().toISOString() };

for (const t of tables) {
  const rs = await db.execute(`SELECT * FROM ${t}`);
  snapshot[t] = rs.rows.map((row) => ({ ...row }));
}

writeFileSync("data/export.json", JSON.stringify(snapshot));
console.log(
  `✔ exported snapshot: ` +
    tables.map((t) => `${snapshot[t].length} ${t}`).join(", ")
);
db.close();
