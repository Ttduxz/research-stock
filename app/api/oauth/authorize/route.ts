import { auth } from "@/auth";
import { createAuthCode } from "@/lib/mcp/store";
import { checkAuthorize, consentParts } from "@/lib/mcp/authorize";
import { consentSigValid, originOf } from "@/lib/mcp/http";

/**
 * ผู้ใช้กด "อนุญาต" / "ไม่อนุญาต" ในหน้า /oauth/authorize — เป็น HTML form post ธรรมดา (ไม่ใช่ server action)
 * เพื่อให้ 302 ไปได้ทุก redirect_uri รวมถึง scheme ของแอป (cursor://, vscode://) ที่ router ของ Next ไปไม่ได้
 * อีเมลเอาจาก session เท่านั้น + ตรวจลายเซ็นของฟอร์ม + ตรวจคำขอซ้ำทั้งหมด
 */
export async function POST(req: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return new Response("ต้อง login ก่อน", { status: 401 });

  const origin = originOf(req);
  const form = new URLSearchParams(await req.text());
  const check = await checkAuthorize(form, origin);
  if (!check.ok) {
    if ("redirect" in check) return Response.redirect(check.redirect, 302);
    return new Response(check.fatal, { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const r = check.req;
  if (!consentSigValid(consentParts(email, r), form.get("sig") ?? ""))
    return new Response("ฟอร์มไม่ถูกต้อง — กลับไปเริ่มเชื่อมต่อจากแอปใหม่", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });

  const target = new URL(r.redirectUri);
  if (r.state) target.searchParams.set("state", r.state);
  target.searchParams.set("iss", origin);
  if (form.get("decision") !== "allow") {
    target.searchParams.set("error", "access_denied");
    target.searchParams.set("error_description", "ผู้ใช้ไม่อนุญาต");
    return Response.redirect(target.toString(), 302);
  }
  const code = await createAuthCode({
    clientId: r.client.client_id,
    email,
    redirectUri: r.redirectUri,
    codeChallenge: r.codeChallenge,
    scope: r.scope,
    resource: r.resource,
  });
  target.searchParams.set("code", code);
  return Response.redirect(target.toString(), 302);
}
