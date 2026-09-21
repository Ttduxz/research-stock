// คัดลอกข้อมูลสาธารณะจาก Turso ลง data/dev-copy.db (อ่านอย่างเดียวจาก Turso) — ใช้กับ preview "dev-copydb" port 3200
// Usage: node scripts/dev-copy-db.mjs <email ของตัวเอง>  (คัด watchlist มาเฉพาะของอีเมลนี้ ตารางผูกอีเมลอื่นไม่ถูกคัดลอก)
import { createClient } from "@libsql/client";
import { rmSync, existsSync } from "node:fs";
import { openDb } from "./db-client.mjs";
import { applySchema } from "./schema.mjs";
const src = openDb();
const OUT = "./data/dev-copy.db";
if (existsSync(OUT)) rmSync(OUT);
const dst = createClient({ url: "file:" + OUT });
await applySchema(dst);
const PRIVATE = new Set(["access_logs", "watchlist", "stock_requests", "watchlist_seen"]);
const tables = (await src.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")).rows
  .map((r) => String(r.name)).filter((t) => !PRIVATE.has(t) && !t.startsWith("mcp_"));
const dstCols = async (t) => (await dst.execute(`PRAGMA table_info(${t})`)).rows.map((r) => String(r.name));
for (const t of tables) {
  const cols = await dstCols(t);
  if (!cols.length) { console.log("skip (no local table)", t); continue; }
  const rows = (await src.execute(`SELECT * FROM ${t}`)).rows;
  const stmts = rows.map((r) => {
    const c = cols.filter((k) => k in r);
    return { sql: `INSERT INTO ${t} (${c.join(",")}) VALUES (${c.map(() => "?").join(",")})`, args: c.map((k) => r[k]) };
  });
  for (let i = 0; i < stmts.length; i += 200) await dst.batch(stmts.slice(i, i + 200), "write");
  console.log(t, rows.length);
}
const me = process.argv[2];
const w = (await src.execute({ sql: "SELECT email, ticker, created_at FROM watchlist WHERE email = ?", args: [me] })).rows;
for (const r of w) await dst.execute({ sql: "INSERT INTO watchlist (email,ticker,created_at) VALUES (?,?,?)", args: [r.email, r.ticker, r.created_at] });
console.log("own watchlist rows", w.length);
