import { mcpAvailable, registerClient } from "@/lib/mcp/store";
import { json, oauthError, preflight } from "@/lib/mcp/http";

/**
 * RFC 7591 Dynamic Client Registration — Claude/ChatGPT/Cursor ลงทะเบียนตัวเองก่อนพาผู้ใช้มาหน้ายินยอม
 * เปิดโดยไม่ต้อง login ตาม spec: การลงทะเบียนเฉยๆ ไม่ได้สิทธิ์อะไร ผู้ใช้ต้องกดอนุญาตเองอีกขั้น
 */
export async function POST(req: Request) {
  if (!mcpAvailable) return oauthError("temporarily_unavailable", "MCP ใช้ไม่ได้ในโหมดข้อมูลปัจจุบัน", 503);
  const raw = await req.text();
  if (raw.length > 10_000) return oauthError("invalid_client_metadata", "body ใหญ่เกินไป");
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return oauthError("invalid_client_metadata", "body ต้องเป็น JSON");
  }
  if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== "none") {
    // รองรับเฉพาะ public client + PKCE — client ที่ขอ secret ส่วนใหญ่ถอยมาใช้ none ได้เอง
    body.token_endpoint_auth_method = "none";
  }
  try {
    const c = await registerClient(body);
    return json(
      {
        client_id: c.client_id,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_name: c.client_name ?? undefined,
        redirect_uris: c.redirect_uris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
      201
    );
  } catch {
    return oauthError("invalid_redirect_uri", "redirect_uris ต้องเป็น https, http://localhost หรือ scheme ของแอป (1-10 รายการ)");
  }
}
export const OPTIONS = preflight;
