import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createClient, type Client } from "@libsql/client";

/**
 * ที่เก็บของ OAuth / API key สำหรับ MCP (ตาราง mcp_clients / mcp_auth_codes / mcp_tokens — นิยามใน scripts/schema.mjs)
 *
 * หลัก:
 * - ตัวตนของผู้ใช้ = อีเมลจาก Google login เดิมของเว็บ (Auth.js) — OAuth ชุดนี้แค่ "ออกบัตร" ให้ agent ถือแทนคนนั้น
 * - เก็บแค่ sha256 ของ code/token ทุกตัว token จริงเห็นครั้งเดียวตอนออก
 * - ข้อมูลผูกอีเมล: ไม่อยู่ใน export-db.mjs ไม่ผ่าน lib/cached.ts (เหมือน watchlist)
 * - โหมด snapshot บน Vercel ไม่มี DB ที่เขียนได้ → ปิด MCP ทั้งระบบ (mcpAvailable = false)
 */

export const mcpAvailable = !!process.env.TURSO_DATABASE_URL || !process.env.VERCEL;

/** research = อ่านรายงาน/insight/อันดับ | account = watchlist + คำขอวิเคราะห์ของตัวเอง */
export const SCOPES = ["research", "account"] as const;
export type Scope = (typeof SCOPES)[number];
export const SCOPE_LABEL: Record<Scope, string> = {
  research: "อ่านรายงานหุ้น, insights, อันดับราคา และ track record",
  account: "ดู/แก้หุ้นที่คุณติดตาม และส่งคำขอวิเคราะห์หุ้นในชื่อคุณ",
};

export const ACCESS_TTL = 60 * 60; // 1 ชม.
export const REFRESH_TTL = 30 * 24 * 60 * 60; // 30 วัน
const CODE_TTL = 5 * 60;
/** คำขอต่อ token ต่อนาที — กัน agent วนลูปยิงไม่หยุด (1 tool call ของ client ส่วนใหญ่ = 1-2 request) */
export const RATE_LIMIT_PER_MIN = 120;
export const PERSONAL_KEY_CLIENT = "personal-key";
export const MAX_KEYS_PER_USER = 5;

let _db: Client | null = null;
function getDb(): Client {
  if (_db) return _db;
  _db = createClient({
    url: process.env.TURSO_DATABASE_URL?.trim() ?? "file:./data/stock.db",
    authToken: process.env.TURSO_AUTH_TOKEN?.trim(),
  });
  return _db;
}

const now = () => Math.floor(Date.now() / 1000);
const norm = (email: string) => email.trim().toLowerCase();
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const secret = (prefix: string) => `${prefix}_${randomBytes(32).toString("base64url")}`;

export function parseScope(raw: string | null | undefined): Scope[] {
  const asked = (raw ?? "").split(/\s+/).filter(Boolean);
  // client ส่วนใหญ่ไม่ขอ scope มาเลย → ให้ครบตามที่ผู้ใช้เห็นในหน้ายินยอม
  if (asked.length === 0) return [...SCOPES];
  return SCOPES.filter((s) => asked.includes(s));
}

// ---------- clients (RFC 7591) ----------

export interface McpClient {
  client_id: string;
  client_name: string | null;
  redirect_uris: string[];
}

/**
 * redirect_uri ที่ยอมรับ: https ทุกโดเมน, http เฉพาะ loopback (CLI/desktop app),
 * และ private-use scheme ของแอป (เช่น cursor://) — ห้าม javascript:/data:/file:
 */
export function isAllowedRedirect(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash) return false;
  if (u.protocol === "https:") return true;
  if (u.protocol === "http:") return ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  return !["javascript:", "data:", "file:", "vbscript:", "blob:", "about:"].includes(u.protocol);
}

export async function registerClient(input: { client_name?: unknown; redirect_uris?: unknown }): Promise<McpClient> {
  const uris = Array.isArray(input.redirect_uris) ? input.redirect_uris.map(String) : [];
  if (uris.length === 0 || uris.length > 10 || !uris.every(isAllowedRedirect)) {
    throw new Error("invalid_redirect_uri");
  }
  const name = typeof input.client_name === "string" ? input.client_name.trim().slice(0, 80) || null : null;
  const client: McpClient = { client_id: `mcp_${randomBytes(16).toString("hex")}`, client_name: name, redirect_uris: uris };
  await getDb().execute({
    sql: "INSERT INTO mcp_clients (client_id, client_name, redirect_uris) VALUES (?, ?, ?)",
    args: [client.client_id, client.client_name, JSON.stringify(uris)],
  });
  return client;
}

export async function getClient(clientId: string): Promise<McpClient | null> {
  const rs = await getDb().execute({ sql: "SELECT * FROM mcp_clients WHERE client_id = ?", args: [clientId] });
  const row = rs.rows[0];
  if (!row) return null;
  return {
    client_id: String(row.client_id),
    client_name: row.client_name == null ? null : String(row.client_name),
    redirect_uris: JSON.parse(String(row.redirect_uris)),
  };
}

// ---------- authorization code + PKCE ----------

export async function createAuthCode(input: {
  clientId: string;
  email: string;
  redirectUri: string;
  codeChallenge: string;
  scope: Scope[];
  resource: string | null;
}): Promise<string> {
  const code = secret("tsr_code");
  await getDb().execute({
    sql: `INSERT INTO mcp_auth_codes (code_hash, client_id, email, redirect_uri, code_challenge, scope, resource, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      sha256(code),
      input.clientId,
      norm(input.email),
      input.redirectUri,
      input.codeChallenge,
      input.scope.join(" "),
      input.resource,
      now() + CODE_TTL,
    ],
  });
  return code;
}

export interface TokenSet {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

async function issueTokens(family: string, email: string, clientId: string, scope: string): Promise<TokenSet> {
  const access = secret("tsr_at");
  const refresh = secret("tsr_rt");
  const client = await getClient(clientId);
  const label = client?.client_name ?? "AI agent";
  await getDb().batch(
    [
      {
        sql: `INSERT INTO mcp_tokens (token_hash, kind, family, email, client_id, label, scope, expires_at)
              VALUES (?, 'access', ?, ?, ?, ?, ?, ?)`,
        args: [sha256(access), family, email, clientId, label, scope, now() + ACCESS_TTL],
      },
      {
        sql: `INSERT INTO mcp_tokens (token_hash, kind, family, email, client_id, label, scope, expires_at)
              VALUES (?, 'refresh', ?, ?, ?, ?, ?, ?)`,
        args: [sha256(refresh), family, email, clientId, label, scope, now() + REFRESH_TTL],
      },
    ],
    "write"
  );
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL, refresh_token: refresh, scope };
}

function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const a = Buffer.from(createHash("sha256").update(verifier).digest("base64url"));
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class OAuthFailure extends Error {
  constructor(public code: string, public description: string) {
    super(description);
  }
}

/** แลก code เป็น token — code ใช้ได้ครั้งเดียว (ลบทิ้งก่อนตรวจ ถึงตรวจไม่ผ่านก็ใช้ซ้ำไม่ได้) */
export async function exchangeCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<TokenSet> {
  const rs = await getDb().execute({
    sql: "DELETE FROM mcp_auth_codes WHERE code_hash = ? RETURNING *",
    args: [sha256(input.code)],
  });
  const row = rs.rows[0];
  if (!row) throw new OAuthFailure("invalid_grant", "code ไม่ถูกต้องหรือถูกใช้ไปแล้ว");
  if (Number(row.expires_at) < now()) throw new OAuthFailure("invalid_grant", "code หมดอายุ");
  if (String(row.client_id) !== input.clientId) throw new OAuthFailure("invalid_grant", "client_id ไม่ตรง");
  if (String(row.redirect_uri) !== input.redirectUri) throw new OAuthFailure("invalid_grant", "redirect_uri ไม่ตรง");
  if (!pkceMatches(input.codeVerifier, String(row.code_challenge)))
    throw new OAuthFailure("invalid_grant", "code_verifier ไม่ผ่าน PKCE");
  return issueTokens(randomBytes(12).toString("hex"), String(row.email), input.clientId, String(row.scope));
}

/**
 * หมุน refresh token — ตัวเก่าถูกเพิกถอนทันที ถ้ามีคนเอา refresh ที่ถูกเพิกถอนแล้วมาใช้อีก
 * แปลว่า token รั่ว → เพิกถอนทั้ง family (ทั้งเจ้าของจริงและคนที่ขโมยต้อง login ใหม่)
 */
export async function refreshTokens(input: { refreshToken: string; clientId: string }): Promise<TokenSet> {
  const db = getDb();
  const rs = await db.execute({
    sql: "SELECT * FROM mcp_tokens WHERE token_hash = ? AND kind = 'refresh'",
    args: [sha256(input.refreshToken)],
  });
  const row = rs.rows[0];
  if (!row) throw new OAuthFailure("invalid_grant", "refresh token ไม่ถูกต้อง");
  const family = String(row.family);
  if (row.revoked_at != null) {
    await revokeFamilyRaw(family);
    throw new OAuthFailure("invalid_grant", "refresh token ถูกใช้ไปแล้ว — เพิกถอนการเชื่อมต่อนี้ทั้งหมด");
  }
  if (Number(row.expires_at) < now()) throw new OAuthFailure("invalid_grant", "refresh token หมดอายุ");
  if (String(row.client_id) !== input.clientId) throw new OAuthFailure("invalid_grant", "client_id ไม่ตรง");
  await db.execute({
    sql: "UPDATE mcp_tokens SET revoked_at = datetime('now') WHERE id = ?",
    args: [row.id],
  });
  return issueTokens(family, String(row.email), input.clientId, String(row.scope));
}

// ---------- verify (ทุก request ของ /api/mcp) ----------

export interface VerifiedToken {
  email: string;
  scopes: Scope[];
  clientId: string;
  label: string;
  expiresAt: number | null;
  rateLimited: boolean;
}

/**
 * ตรวจ + นับ rate limit + อัปเดต last_used ในคำสั่งเดียว (Vercel → Turso ข้ามทวีป ทุก round trip มีราคา)
 */
export async function verifyToken(token: string): Promise<VerifiedToken | null> {
  if (!/^tsr_(at|key)_/.test(token)) return null;
  const t = now();
  const minute = Math.floor(t / 60);
  const rs = await getDb().execute({
    sql: `UPDATE mcp_tokens
          SET window_count = CASE WHEN window_start = ? THEN window_count + 1 ELSE 1 END,
              window_start = ?,
              last_used_at = datetime('now')
          WHERE token_hash = ? AND kind IN ('access', 'key') AND revoked_at IS NULL
            AND (expires_at IS NULL OR expires_at > ?)
          RETURNING email, scope, client_id, label, expires_at, window_count`,
    args: [minute, minute, sha256(token), t],
  });
  const row = rs.rows[0];
  if (!row) return null;
  return {
    email: String(row.email),
    scopes: parseScope(String(row.scope)),
    clientId: String(row.client_id),
    label: String(row.label ?? ""),
    expiresAt: row.expires_at == null ? null : Number(row.expires_at),
    rateLimited: Number(row.window_count) > RATE_LIMIT_PER_MIN,
  };
}

// ---------- personal API key + หน้า /connect ----------

export async function createPersonalKey(email: string, label: string): Promise<string> {
  const e = norm(email);
  const rs = await getDb().execute({
    sql: "SELECT COUNT(*) AS n FROM mcp_tokens WHERE email = ? AND kind = 'key' AND revoked_at IS NULL",
    args: [e],
  });
  if (Number(rs.rows[0]?.n ?? 0) >= MAX_KEYS_PER_USER) throw new Error(`มี key ได้สูงสุด ${MAX_KEYS_PER_USER} อัน`);
  const key = secret("tsr_key");
  await getDb().execute({
    sql: `INSERT INTO mcp_tokens (token_hash, kind, family, email, client_id, label, scope)
          VALUES (?, 'key', ?, ?, ?, ?, ?)`,
    args: [sha256(key), randomBytes(12).toString("hex"), e, PERSONAL_KEY_CLIENT, label.slice(0, 60), SCOPES.join(" ")],
  });
  return key;
}

export interface Connection {
  family: string;
  kind: "oauth" | "key";
  label: string;
  scope: string;
  created_at: string;
  last_used_at: string | null;
}

/** การเชื่อมต่อที่ยังใช้งานได้ของคนนี้ — OAuth 1 แถวต่อการอนุญาต 1 ครั้ง (รวม access+refresh ทุกรุ่นใน family เดียว) */
export async function listConnections(email: string): Promise<Connection[]> {
  const rs = await getDb().execute({
    sql: `SELECT family,
                 MAX(CASE WHEN kind = 'key' THEN 1 ELSE 0 END) AS is_key,
                 MAX(label) AS label, MAX(scope) AS scope,
                 MIN(created_at) AS created_at, MAX(last_used_at) AS last_used_at
          FROM mcp_tokens
          WHERE email = ?
          GROUP BY family
          HAVING SUM(CASE WHEN revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?) AND kind IN ('refresh', 'key')
                          THEN 1 ELSE 0 END) > 0
          ORDER BY MIN(created_at) DESC`,
    args: [norm(email), now()],
  });
  return rs.rows.map((r) => ({
    family: String(r.family),
    kind: Number(r.is_key) === 1 ? "key" : "oauth",
    label: String(r.label ?? ""),
    scope: String(r.scope ?? ""),
    created_at: String(r.created_at),
    last_used_at: r.last_used_at == null ? null : String(r.last_used_at),
  }));
}

async function revokeFamilyRaw(family: string): Promise<void> {
  await getDb().execute({
    sql: "UPDATE mcp_tokens SET revoked_at = datetime('now') WHERE family = ? AND revoked_at IS NULL",
    args: [family],
  });
}

/** เพิกถอนจากหน้า /connect — ต้องเป็นของอีเมลนี้เท่านั้น */
export async function revokeFamily(email: string, family: string): Promise<void> {
  await getDb().execute({
    sql: "UPDATE mcp_tokens SET revoked_at = datetime('now') WHERE family = ? AND email = ? AND revoked_at IS NULL",
    args: [family, norm(email)],
  });
}

/** RFC 7009 — เพิกถอนด้วยตัว token เอง (client เรียกตอนผู้ใช้กด disconnect) */
export async function revokeByToken(token: string): Promise<void> {
  const rs = await getDb().execute({ sql: "SELECT family FROM mcp_tokens WHERE token_hash = ?", args: [sha256(token)] });
  const family = rs.rows[0]?.family;
  if (family != null) await revokeFamilyRaw(String(family));
}
