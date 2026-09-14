import { createClient, type Client } from "@libsql/client";

/**
 * คำขอให้วิเคราะห์หุ้นที่ยังไม่มีในระบบ (ตาราง stock_requests — นิยามใน scripts/schema.mjs)
 *
 * ผูกกับอีเมลเหมือน watchlist: ห้ามใส่ใน export-db.mjs และห้ามห่อด้วย lib/cached.ts
 * หน้า admin แสดงแค่ "จำนวนคนขอ" ไม่แสดงอีเมลว่าใครขอ — เจ้าของระบบต้องรู้แค่ว่าตัวไหนมีคนอยากได้
 * "วิเคราะห์แล้ว" ไม่มีคอลัมน์สถานะ: ดูจากว่า ticker อยู่ในตาราง stocks แล้วหรือยัง
 */

export const requestsAvailable = !!process.env.TURSO_DATABASE_URL || !process.env.VERCEL;

/** คำขอที่ยังไม่ถูกวิเคราะห์ต่อคน — กันกดส่งรัวจนคิวรก */
export const MAX_OPEN_REQUESTS_PER_USER = 10;

export interface RequestState {
  ok: boolean;
  message: string;
  ticker?: string;
  /** ticker นี้มีรายงานในระบบแล้ว (แสดงลิงก์ไปรายงานแทนการรับคำขอ) */
  inSystem?: boolean;
}

export interface RequestSummary {
  ticker: string;
  requesters: number;
  first_requested: string;
  last_requested: string;
  notes: string[];
  in_system: boolean;
}

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

export async function countOpenRequests(email: string): Promise<number> {
  if (!requestsAvailable) return 0;
  const rs = await getDb().execute({
    sql: `SELECT COUNT(*) AS n FROM stock_requests r
          WHERE r.email = ? AND NOT EXISTS (SELECT 1 FROM stocks s WHERE s.ticker = r.ticker)`,
    args: [norm(email)],
  });
  return Number(rs.rows[0]?.n ?? 0);
}

/** "added" = คำขอใหม่ | "duplicate" = คนนี้เคยขอ ticker นี้แล้ว */
export async function addRequest(email: string, ticker: string, note: string | null): Promise<"added" | "duplicate"> {
  if (!requestsAvailable) throw new Error("ระบบคำขอใช้ไม่ได้ในโหมดนี้");
  const rs = await getDb().execute({
    sql: "INSERT OR IGNORE INTO stock_requests (email, ticker, note) VALUES (?, ?, ?)",
    args: [norm(email), ticker.toUpperCase(), note],
  });
  return rs.rowsAffected > 0 ? "added" : "duplicate";
}

/** สรุปคำขอราย ticker (ไม่มีอีเมล) — ตัวที่ยังไม่ถูกวิเคราะห์และมีคนขอเยอะขึ้นก่อน */
export async function listRequestSummary(): Promise<RequestSummary[]> {
  if (!requestsAvailable) return [];
  const rs = await getDb().execute(`
    SELECT r.ticker,
           COUNT(*) AS requesters,
           MIN(r.created_at) AS first_requested,
           MAX(r.created_at) AS last_requested,
           GROUP_CONCAT(r.note, char(10)) AS notes,
           EXISTS (SELECT 1 FROM stocks s WHERE s.ticker = r.ticker) AS in_system
    FROM stock_requests r
    GROUP BY r.ticker
    ORDER BY in_system ASC, requesters DESC, last_requested DESC
  `);
  return rs.rows.map((r) => ({
    ticker: String(r.ticker),
    requesters: Number(r.requesters),
    first_requested: String(r.first_requested),
    last_requested: String(r.last_requested),
    notes: r.notes == null ? [] : String(r.notes).split("\n").filter(Boolean),
    in_system: Number(r.in_system) === 1,
  }));
}
