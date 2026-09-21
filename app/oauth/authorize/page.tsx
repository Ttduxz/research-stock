import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SCOPE_LABEL, mcpAvailable } from "@/lib/mcp/store";
import { checkAuthorize, consentParts } from "@/lib/mcp/authorize";
import { consentSig } from "@/lib/mcp/http";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "อนุญาตให้ AI เข้าถึง | Tee Stock Research", robots: { index: false } };

/** origin ฝั่ง server component (ไม่มี Request ให้ใช้ getPublicOrigin) — ต้องตรงกับที่ route /api/oauth/authorize คำนวณ */
async function pageOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto")?.split(",")[0] ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * หน้ายินยอม OAuth — middleware บังคับ login Google ก่อนถึงหน้านี้ (callbackUrl พาพารามิเตอร์กลับมาครบ)
 * ชื่อแอปมาจากแอปเองตอนลงทะเบียน (เชื่อไม่ได้) จึงโชว์ปลายทาง redirect ให้เห็นชัดคู่กันเสมอ
 */
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect("/login");
  if (!mcpAvailable) return <div className="empty-state">การเชื่อมต่อ AI ยังใช้ไม่ได้ในโหมดข้อมูลปัจจุบัน</div>;

  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") params.set(k, v);

  const check = await checkAuthorize(params, await pageOrigin());
  if (!check.ok) {
    if ("redirect" in check) redirect(check.redirect);
    return (
      <>
        <h1>เชื่อมต่อไม่สำเร็จ</h1>
        <div className="empty-state">{check.fatal}</div>
      </>
    );
  }
  const r = check.req;
  const dest = new URL(r.redirectUri);
  const destLabel = dest.protocol === "https:" || dest.protocol === "http:" ? dest.host : `${dest.protocol}//`;
  const hidden: Record<string, string> = {
    response_type: "code",
    client_id: r.client.client_id,
    redirect_uri: r.redirectUri,
    code_challenge: r.codeChallenge,
    code_challenge_method: "S256",
    scope: r.scope.join(" "),
    sig: consentSig(consentParts(email, r)),
  };
  if (r.state) hidden.state = r.state;
  if (r.resource) hidden.resource = r.resource;

  return (
    <div className="consent">
      <h1>อนุญาตให้ AI เข้าถึงข้อมูล?</h1>
      <p className="subtitle">
        <strong>{r.client.client_name ?? "แอปที่ไม่ระบุชื่อ"}</strong> ขอใช้ Tee Stock Research ในชื่อ <strong>{email}</strong>
      </p>
      <p className="consent-dest">
        หลังอนุญาตจะส่งกลับไปที่ <code>{destLabel}</code> — ชื่อแอปด้านบนแอปตั้งเอง ถ้าปลายทางนี้ไม่ใช่แอปที่คุณเพิ่งกดเชื่อมต่อ
        ให้กดไม่อนุญาต
      </p>
      <h2 className="sector-heading">แอปนี้จะทำได้</h2>
      <ul className="consent-scopes">
        {r.scope.map((s) => (
          <li key={s}>{SCOPE_LABEL[s]}</li>
        ))}
      </ul>
      <p className="consent-note">
        แอปทำได้แค่ที่ระบุข้างบน ไม่เห็นข้อมูลของผู้ใช้คนอื่น และถอนสิทธิ์ได้ทุกเมื่อที่หน้า <a href="/connect">เชื่อมต่อ AI</a>
      </p>
      <form method="post" action="/api/oauth/authorize" className="consent-actions">
        {Object.entries(hidden).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <button type="submit" name="decision" value="allow" className="btn-primary">
          อนุญาต
        </button>
        <button type="submit" name="decision" value="deny" className="btn-ghost">
          ไม่อนุญาต
        </button>
      </form>
    </div>
  );
}
