import { revokeByToken } from "@/lib/mcp/store";
import { preflight, readParams, CORS } from "@/lib/mcp/http";

/** RFC 7009 — ตอบ 200 เสมอ (ไม่บอกว่า token มีอยู่จริงไหม) */
export async function POST(req: Request) {
  const token = (await readParams(req)).get("token");
  if (token) await revokeByToken(token).catch((err) => console.error("[oauth/revoke]", err));
  return new Response(null, { status: 200, headers: CORS });
}
export const OPTIONS = preflight;
