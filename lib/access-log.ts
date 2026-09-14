import { createClient, type Client } from "@libsql/client";

/**
 * บันทึกการเข้าใช้เว็บ (ตาราง access_logs — นิยามใน scripts/schema.mjs)
 * เขียนได้เฉพาะโหมด Turso หรือ local file; โหมด snapshot บน Vercel ไม่มี DB ที่เขียนได้ → ข้ามเงียบๆ
 * การ log ห้ามทำให้หน้าเว็บพัง — error ทุกอย่างกลืนแล้ว console.error
 * ไม่เก็บ IP ของผู้ใช้ (privacy) — เดิมมีคอลัมน์ ip แต่ลบทิ้งแล้วทั้งคอลัมน์และข้อมูลเก่า อย่าเพิ่มกลับ
 */

export type AccessEvent = "login" | "logout" | "view";

export interface AccessLog {
  id: number;
  email: string;
  name: string | null;
  event: AccessEvent;
  path: string | null;
  user_agent: string | null;
  created_at: string; // UTC 'YYYY-MM-DD HH:MM:SS'
}

export interface AccessSummary {
  email: string;
  name: string | null;
  first_seen: string;
  last_seen: string;
  logins: number;
  views: number;
}

const writable = !!process.env.TURSO_DATABASE_URL || !process.env.VERCEL;

let _db: Client | null = null;
function getDb(): Client {
  if (_db) return _db;
  _db = createClient({
    url: process.env.TURSO_DATABASE_URL?.trim() ?? "file:./data/stock.db",
    authToken: process.env.TURSO_AUTH_TOKEN?.trim(),
  });
  return _db;
}

/** อีเมลที่ไม่ต้องเก็บ log (เช่น เจ้าของระบบเอง) — env LOG_EXCLUDE_EMAILS คั่นด้วย comma */
function isExcluded(email: string): boolean {
  return (process.env.LOG_EXCLUDE_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

export async function logAccess(entry: {
  email: string;
  name?: string | null;
  event: AccessEvent;
  path?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  if (!writable || isExcluded(entry.email)) return;
  try {
    await getDb().execute({
      sql: `INSERT INTO access_logs (email, name, event, path, user_agent) VALUES (?, ?, ?, ?, ?)`,
      args: [
        entry.email.toLowerCase(),
        entry.name ?? null,
        entry.event,
        entry.path ?? null,
        entry.userAgent?.slice(0, 300) ?? null,
      ],
    });
  } catch (err) {
    console.error("[access-log] write failed:", err);
  }
}

export async function listAccessSummary(): Promise<AccessSummary[]> {
  if (!writable) return [];
  const rs = await getDb().execute(
    `SELECT email,
            MAX(name) AS name,
            MIN(created_at) AS first_seen,
            MAX(created_at) AS last_seen,
            SUM(event = 'login') AS logins,
            SUM(event = 'view') AS views
       FROM access_logs
      GROUP BY email
      ORDER BY last_seen DESC`
  );
  return rs.rows.map((r) => ({
    email: String(r.email),
    name: r.name == null ? null : String(r.name),
    first_seen: String(r.first_seen),
    last_seen: String(r.last_seen),
    logins: Number(r.logins),
    views: Number(r.views),
  }));
}

export async function listRecentAccess(limit = 300, email?: string): Promise<AccessLog[]> {
  if (!writable) return [];
  const rs = await getDb().execute({
    sql: `SELECT * FROM access_logs ${email ? "WHERE email = ?" : ""} ORDER BY id DESC LIMIT ?`,
    args: email ? [email, limit] : [limit],
  });
  return rs.rows as unknown as AccessLog[];
}
