import { generateProtectedResourceMetadata } from "mcp-handler";
import { SCOPES } from "@/lib/mcp/store";
import { json, mcpResource, originOf, preflight } from "@/lib/mcp/http";

/**
 * RFC 9728 — /api/mcp ตอบ 401 พร้อมชี้มาที่นี่ แล้ว client รู้ว่า authorization server คือเว็บนี้เอง
 * catch-all: spec ให้ลองทั้ง /.well-known/oauth-protected-resource และ /.well-known/oauth-protected-resource/api/mcp
 */
export function GET(req: Request) {
  const origin = originOf(req);
  return json(
    generateProtectedResourceMetadata({
      authServerUrls: [origin],
      resourceUrl: mcpResource(origin),
      additionalMetadata: { scopes_supported: [...SCOPES], resource_name: "Tee Stock Research", resource_documentation: `${origin}/connect` },
    }),
    200,
    { "Cache-Control": "public, max-age=3600" }
  );
}
export const OPTIONS = preflight;
