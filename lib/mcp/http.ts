import { createHmac, timingSafeEqual } from "node:crypto";
import { getPublicOrigin } from "mcp-handler";
import { SCOPES } from "@/lib/mcp/store";

/** origin จริงของเว็บ (หลัง proxy ของ Vercel) — ใช้เป็น issuer ของ OAuth และ resource ของ MCP */
export const originOf = (req: Request) => getPublicOrigin(req);
export const mcpResource = (origin: string) => `${origin}/api/mcp`;

/** MCP client บางตัว (เช่น MCP Inspector / client บนเว็บ) ยิงจาก browser — endpoint ของ OAuth ต้องเปิด CORS */
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, WWW-Authenticate",
  "Access-Control-Max-Age": "86400",
};
export const preflight = () => new Response(null, { status: 204, headers: CORS });

export function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store", ...extra } });
}
export const oauthError = (error: string, description: string, status = 400) =>
  json({ error, error_description: description }, status);

/** RFC 8414 */
export function authServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    revocation_endpoint: `${origin}/api/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [...SCOPES],
    service_documentation: `${origin}/connect`,
  };
}

/** body ของ token/revoke endpoint มาได้ทั้ง form-urlencoded (ตาม spec) และ JSON (client บางตัว) */
export async function readParams(req: Request): Promise<URLSearchParams> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)]));
  }
  return new URLSearchParams(await req.text());
}

/**
 * CSRF ของหน้ายินยอม: ฟอร์มพก HMAC ของ (อีเมล + ค่าที่ขออนุญาต) ด้วย AUTH_SECRET
 * เว็บอื่นปลอมฟอร์มส่งมาแทนผู้ใช้ไม่ได้ เพราะไม่รู้ secret (เสริมจาก cookie SameSite=Lax อีกชั้น)
 */
export function consentSig(parts: string[]): string {
  const key = process.env.AUTH_SECRET;
  if (!key) throw new Error("AUTH_SECRET is not set");
  return createHmac("sha256", key).update(parts.join("\n")).digest("base64url");
}
export function consentSigValid(parts: string[], sig: string): boolean {
  const a = Buffer.from(consentSig(parts));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}
