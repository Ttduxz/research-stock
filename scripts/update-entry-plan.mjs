/**
 * อัปเดตแผนจุดเข้าสะสม (entry_plan) ของ run ล่าสุดของหุ้น โดยไม่สร้าง run ใหม่
 * Usage: node scripts/update-entry-plan.mjs <TICKER> <path-to-entry_plan.json>
 */
import { readFileSync } from "node:fs";
import { applySchema } from "./schema.mjs";
import { openDb } from "./db-client.mjs";

const [ticker, file] = process.argv.slice(2);
if (!ticker || !file) {
  console.error("Usage: node scripts/update-entry-plan.mjs <TICKER> <entry_plan.json>");
  process.exit(1);
}

const plan = JSON.parse(readFileSync(file, "utf8"));
const db = openDb();
await applySchema(db);
const rs = await db.execute({
  sql: `UPDATE research_runs SET entry_plan_json = ?
        WHERE id = (SELECT id FROM research_runs WHERE ticker = ? ORDER BY run_date DESC, id DESC LIMIT 1)`,
  args: [JSON.stringify(plan), ticker.toUpperCase()],
});
console.log(`✔ entry_plan updated for ${ticker.toUpperCase()} (rows: ${rs.rowsAffected})`);
db.close();
