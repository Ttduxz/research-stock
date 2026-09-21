import { exchangeCode, mcpAvailable, OAuthFailure, refreshTokens } from "@/lib/mcp/store";
import { json, oauthError, preflight, readParams } from "@/lib/mcp/http";

/** แลก authorization code (+PKCE) หรือ refresh token เป็น access token — public client ไม่มี secret */
export async function POST(req: Request) {
  if (!mcpAvailable) return oauthError("temporarily_unavailable", "MCP ใช้ไม่ได้ในโหมดข้อมูลปัจจุบัน", 503);
  const p = await readParams(req);
  const clientId = p.get("client_id") ?? "";
  if (!clientId) return oauthError("invalid_client", "ต้องมี client_id", 401);
  try {
    switch (p.get("grant_type")) {
      case "authorization_code": {
        const code = p.get("code");
        const redirectUri = p.get("redirect_uri");
        const verifier = p.get("code_verifier");
        if (!code || !redirectUri || !verifier) return oauthError("invalid_request", "ต้องมี code, redirect_uri, code_verifier");
        return json(await exchangeCode({ code, clientId, redirectUri, codeVerifier: verifier }));
      }
      case "refresh_token": {
        const rt = p.get("refresh_token");
        if (!rt) return oauthError("invalid_request", "ต้องมี refresh_token");
        return json(await refreshTokens({ refreshToken: rt, clientId }));
      }
      default:
        return oauthError("unsupported_grant_type", "รองรับ authorization_code และ refresh_token");
    }
  } catch (err) {
    if (err instanceof OAuthFailure) return oauthError(err.code, err.description);
    console.error("[oauth/token]", err);
    return oauthError("server_error", "เกิดข้อผิดพลาดฝั่งเซิร์ฟเวอร์", 500);
  }
}
export const OPTIONS = preflight;
