import { createClient } from "@libsql/client";
import { existsSync, mkdirSync, readFileSync } from "node:fs";

/** โหลด .env แบบเบาๆ (ไม่พึ่ง dotenv) — ไม่ทับตัวแปรที่ตั้งไว้แล้ว */
function loadEnv() {
  for (const file of [".env", ".env.local"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, key, raw] = m;
      if (process.env[key] !== undefined) continue;
      process.env[key] = raw.replace(/^["']|["']$/g, "");
    }
  }
}

export function openDb() {
  loadEnv();
  const url = process.env.TURSO_DATABASE_URL ?? "file:./data/stock.db";
  if (url.startsWith("file:")) mkdirSync("./data", { recursive: true });
  return createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
}
