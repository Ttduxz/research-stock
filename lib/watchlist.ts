import { createClient, type Client } from "@libsql/client";

/**
 * หุ้นที่แต่ละคนกด ☆ ติดตาม (ตาราง watchlist — นิยามใน scripts/schema.mjs)
 *
 * ข้อมูลส่วนตัวผูกกับอีเมล: ห้ามใส่ใน export-db.mjs (กันหลุดไปกับ data/export.json ที่ commit)
 * และห้ามห่อด้วย lib/cached.ts — รายการต่างกันรายคน cache รวมจะปนกัน และกดแล้วต้องเห็นผลทันที
 * โหมด snapshot บน Vercel ไม่มี DB ที่เขียนได้ → ปิดฟีเจอร์เงียบๆ (watchlistAvailable = false)
 */

export const watchlistAvailable = !!process.env.TURSO_DATABASE_URL || !process.env.VERCEL;

let _db: Client | null = null;
function getDb(): Client {
  if (_db) return _db;
  _db = createClient({
    url: process.env.TURSO_DATABASE_URL?.trim() ?? "file:./data/stock.db",
    authToken: process.env.TURSO_AUTH_TOKEN?.trim(),
  });
  return _db;
}

const norm = (email: string) => email.trim().toLowerCase();

/** ticker ที่คนนี้ติดตาม เรียงตัวที่เพิ่งกดล่าสุดก่อน */
export async function listWatchTickers(email: string): Promise<string[]> {
  if (!watchlistAvailable) return [];
  const rs = await getDb().execute({
    sql: "SELECT ticker FROM watchlist WHERE email = ? ORDER BY created_at DESC, ticker ASC",
    args: [norm(email)],
  });
  return rs.rows.map((r) => String(r.ticker));
}

export async function isWatching(email: string, ticker: string): Promise<boolean> {
  if (!watchlistAvailable) return false;
  const rs = await getDb().execute({
    sql: "SELECT 1 FROM watchlist WHERE email = ? AND ticker = ? LIMIT 1",
    args: [norm(email), ticker.toUpperCase()],
  });
  return rs.rows.length > 0;
}

/** on = true เพิ่ม / false เอาออก — กดซ้ำไม่พัง (INSERT OR IGNORE / DELETE ที่ไม่มีแถวก็ผ่าน) */
export async function setWatch(email: string, ticker: string, on: boolean): Promise<void> {
  if (!watchlistAvailable) throw new Error("ระบบติดตามหุ้นใช้ไม่ได้ในโหมดนี้");
  const args = [norm(email), ticker.toUpperCase()];
  await getDb().execute(
    on
      ? { sql: "INSERT OR IGNORE INTO watchlist (email, ticker) VALUES (?, ?)", args }
      : { sql: "DELETE FROM watchlist WHERE email = ? AND ticker = ?", args }
  );
}
