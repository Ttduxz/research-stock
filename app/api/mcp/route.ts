import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { mcpAvailable, verifyToken, RATE_LIMIT_PER_MIN, type Scope } from "@/lib/mcp/store";
import { registerTools, SERVER_INSTRUCTIONS, type McpUser } from "@/lib/mcp/tools";
import { CORS, json, originOf, preflight } from "@/lib/mcp/http";

/**
 * MCP server (Streamable HTTP, stateless) — agent ของผู้ใช้มาเกาะเว็บนี้เป็น tools
 * ผู้ใช้เชื่อมต่อได้ 2 แบบ (ดูหน้า /connect):
 *   1. OAuth — Claude / ChatGPT / Cursor ฯลฯ ลงทะเบียนเอง พาผู้ใช้ login Google + กดยินยอม (lib/mcp/authorize.ts)
 *   2. API key ส่วนตัว (tsr_key_…) — สำหรับ agent/สคริปต์ที่เขียนเอง ส่งใน header Authorization: Bearer
 * middleware.ts ไม่ครอบ route นี้ (ไม่ใช่ cookie session) — ตัวตนมาจาก bearer token อย่างเดียว
 */
export const maxDuration = 60;

const userOf = (ctx: unknown): McpUser | null => {
  const auth = (ctx as { http?: { authInfo?: AuthInfo } })?.http?.authInfo;
  const extra = auth?.extra as { email?: string; label?: string; origin?: string } | undefined;
  if (!auth || !extra?.email) return null;
  return { email: extra.email, scopes: auth.scopes as Scope[], label: extra.label ?? "", origin: extra.origin ?? "" };
};

const mcp = createMcpHandler((server) => registerTools(server, userOf), {
  serverInfo: { name: "tee-stock-research", version: "1.0.0" },
  instructions: SERVER_INSTRUCTIONS,
});

const authed = withMcpAuth(
  async (req) => {
    // rate limit นับใน verifyToken แล้ว — ตอบ 429 ที่นี่แทน 401 ไม่งั้น client จะพาผู้ใช้ไป login ใหม่วนไป
    if ((req.auth?.extra as { rateLimited?: boolean } | undefined)?.rateLimited)
      return json({ error: "rate_limited", error_description: `เกิน ${RATE_LIMIT_PER_MIN} คำขอต่อนาที` }, 429, { "Retry-After": "60" });
    const res = await mcp(req);
    for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
    return res;
  },
  async (req, token) => {
    if (!token) return undefined;
    const v = await verifyToken(token);
    if (!v) return undefined;
    return {
      token,
      clientId: v.clientId,
      scopes: v.scopes,
      expiresAt: v.expiresAt ?? undefined,
      extra: { email: v.email, label: v.label, origin: originOf(req), rateLimited: v.rateLimited },
    };
  },
  { required: true }
);

async function handle(req: Request): Promise<Response> {
  if (!mcpAvailable) return json({ error: "unavailable", error_description: "MCP ใช้ไม่ได้ในโหมดข้อมูลปัจจุบัน" }, 503);
  const res = await authed(req);
  // 401 ต้องให้ browser-based client อ่าน WWW-Authenticate ได้ (ชี้ไป resource metadata)
  if (res.status === 401) {
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
    return new Response(res.body, { status: 401, headers });
  }
  return res;
}

export { handle as GET, handle as POST, handle as DELETE };
export const OPTIONS = preflight;
