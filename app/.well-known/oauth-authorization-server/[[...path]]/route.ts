import { authServerMetadata, json, originOf, preflight } from "@/lib/mcp/http";

/** RFC 8414 — MCP client อ่านที่นี่เพื่อรู้ว่าไป login/แลก token ที่ไหน (catch-all รองรับแบบต่อท้าย path ของ resource) */
export const GET = (req: Request) => json(authServerMetadata(originOf(req)), 200, { "Cache-Control": "public, max-age=3600" });
export const OPTIONS = preflight;
