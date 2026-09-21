import { getClient, parseScope, type McpClient, type Scope } from "@/lib/mcp/store";
import { mcpResource } from "@/lib/mcp/http";

export interface AuthorizeRequest {
  client: McpClient;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  scope: Scope[];
  resource: string | null;
}

/**
 * ตรวจคำขอ /oauth/authorize — ใช้ทั้งตอนแสดงหน้ายินยอมและตอนรับคำตอบ (ตรวจซ้ำ ไม่เชื่อค่าจากฟอร์ม)
 * fatal = client/redirect_uri ไม่น่าเชื่อ → แสดง error ในหน้าเรา ห้าม redirect กลับ (กัน open redirect)
 * redirect = ผิดเรื่องอื่น → ส่ง error กลับไปที่ client ตาม spec
 */
export type AuthorizeCheck =
  | { ok: true; req: AuthorizeRequest }
  | { ok: false; fatal: string }
  | { ok: false; redirect: string };

export async function checkAuthorize(p: URLSearchParams, origin: string): Promise<AuthorizeCheck> {
  const clientId = p.get("client_id") ?? "";
  const redirectUri = p.get("redirect_uri") ?? "";
  const client = clientId ? await getClient(clientId) : null;
  if (!client) return { ok: false, fatal: "ไม่รู้จักแอปนี้ (client_id ไม่ถูกต้อง) — ลองเชื่อมต่อใหม่จากแอปของคุณ" };
  if (!client.redirect_uris.includes(redirectUri))
    return { ok: false, fatal: "redirect_uri ไม่ตรงกับที่แอปลงทะเบียนไว้ — ยกเลิกเพื่อความปลอดภัย" };

  const state = p.get("state");
  const back = (error: string, description: string) => {
    const u = new URL(redirectUri);
    u.searchParams.set("error", error);
    u.searchParams.set("error_description", description);
    if (state) u.searchParams.set("state", state);
    u.searchParams.set("iss", origin);
    return { ok: false as const, redirect: u.toString() };
  };

  if (p.get("response_type") !== "code") return back("unsupported_response_type", "รองรับเฉพาะ response_type=code");
  const challenge = p.get("code_challenge") ?? "";
  if (p.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9\-_]{43}$/.test(challenge))
    return back("invalid_request", "ต้องใช้ PKCE แบบ S256");
  const resource = p.get("resource")?.replace(/\/$/, "") ?? null;
  if (resource && resource !== mcpResource(origin) && resource !== origin)
    return back("invalid_target", `resource ต้องเป็น ${mcpResource(origin)}`);
  const scope = parseScope(p.get("scope"));
  if (scope.length === 0) return back("invalid_scope", "scope ที่รองรับ: research account");

  return { ok: true, req: { client, redirectUri, state, codeChallenge: challenge, scope, resource } };
}

/** ส่วนของคำขอที่ลายเซ็นในฟอร์มยินยอมครอบไว้ */
export const consentParts = (email: string, r: AuthorizeRequest) => [
  email.toLowerCase(),
  r.client.client_id,
  r.redirectUri,
  r.codeChallenge,
  r.scope.join(" "),
  r.resource ?? "",
  r.state ?? "",
];
