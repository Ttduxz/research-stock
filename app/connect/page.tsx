import type { Metadata } from "next";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { listConnections, mcpAvailable, MAX_KEYS_PER_USER, RATE_LIMIT_PER_MIN } from "@/lib/mcp/store";
import { revokeConnection } from "@/app/connect/actions";
import CopyField from "@/components/CopyField";
import ConnectKeyForm from "@/components/ConnectKeyForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "เชื่อมต่อ AI | Tee Stock Research",
  description: "ให้ AI ของคุณ (Claude, ChatGPT, Cursor หรือ agent ที่เขียนเอง) อ่านรายงานในระบบผ่าน MCP",
};

/** สิ่งที่ agent ทำได้ — ต้องตรงกับ lib/mcp/tools.ts */
const TOOLS: { name: string; desc: string; account?: boolean }[] = [
  { name: "search_stocks", desc: "หาหุ้นที่มีรายงาน + มุมมอง/คะแนน/สถานะแผนล่าสุด" },
  { name: "get_stock_report", desc: "รายงานรายตัว เลือกส่วนได้: สรุป, บทวิเคราะห์, ทฤษฎี + ผลตรวจ, แผนแบ่งไม้, งบ, ข่าว, ประวัติทบทวน" },
  { name: "rank_by_price", desc: "จัดอันดับราคาน่าสนใจด้วยราคาสด (สูตรเดียวกับหน้าราคาน่าสนใจ)" },
  { name: "list_insights / get_insight", desc: "ประเด็นระดับอุตสาหกรรม/มหภาค + หุ้นที่ได้รับผลกระทบ" },
  { name: "get_track_record", desc: "ทฤษฎีของระบบแม่นแค่ไหน ทั้งระบบหรือรายตัว" },
  { name: "get_my_watchlist", desc: "สรุปหุ้นที่คุณติดตาม: ต้องทำอะไรไหม / ราคาเทียบแผน", account: true },
  { name: "update_watchlist", desc: "เพิ่ม/เอาออกจากหุ้นที่ติดตาม", account: true },
  { name: "request_stock_analysis", desc: "ขอให้วิเคราะห์หุ้นที่ยังไม่มี / ดูคำขอของตัวเอง", account: true },
];

const thTime = (utc: string | null) =>
  utc
    ? new Date(utc.replace(" ", "T") + "Z").toLocaleString("th-TH", {
        timeZone: "Asia/Bangkok",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "ยังไม่เคยใช้";

/**
 * เมนู "เชื่อมต่อ AI" — มองเว็บนี้เป็น tools ให้ AI ของผู้ใช้ย่อยข้อมูลมาให้ (MCP ที่ /api/mcp)
 * รายการการเชื่อมต่อเป็นของแต่ละคน อ่านสดจาก lib/mcp/store.ts (ไม่ผ่าน cache)
 */
export default async function ConnectPage() {
  const email = (await auth())?.user?.email ?? null;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto")?.split(",")[0] ?? (host.startsWith("localhost") ? "http" : "https");
  const url = `${proto}://${host}/api/mcp`;
  const connections = email && mcpAvailable ? await listConnections(email) : [];
  const keyCount = connections.filter((c) => c.kind === "key").length;

  return (
    <>
      <h1>เชื่อมต่อ AI</h1>
      <p className="subtitle">
        ให้ AI ที่คุณใช้อยู่ (Claude, ChatGPT, Cursor หรือ agent ที่เขียนเอง) อ่านรายงานในระบบนี้แล้วย่อยมาตอบคุณ — ผ่านมาตรฐาน MCP
        (Model Context Protocol) AI เห็นเฉพาะสิ่งที่เว็บนี้แสดงอยู่แล้ว + รายการติดตามของคุณเอง
      </p>

      {!mcpAvailable ? (
        <div className="empty-state">การเชื่อมต่อ AI ยังใช้ไม่ได้ในโหมดข้อมูลปัจจุบัน</div>
      ) : (
        <>
          <h2 className="sector-heading">1. ที่อยู่ MCP server</h2>
          <CopyField value={url} label="MCP server URL" />

          <h2 className="sector-heading">2. เพิ่มในแอปที่ใช้</h2>
          <div className="connect-howto">
            <details open>
              <summary>Claude (เว็บ / แอป / มือถือ)</summary>
              <ol>
                <li>Settings → Connectors → Add custom connector</li>
                <li>วาง URL ด้านบน แล้วกด Connect</li>
                <li>login Google บัญชีเดียวกับเว็บนี้ แล้วกด “อนุญาต”</li>
              </ol>
            </details>
            <details>
              <summary>Claude Code</summary>
              <CopyField value={`claude mcp add --transport http tee-stock ${url}`} />
              <p>แล้วพิมพ์ /mcp เพื่อ login</p>
            </details>
            <details>
              <summary>ChatGPT</summary>
              <ol>
                <li>Settings → Apps &amp; Connectors → Advanced → เปิด Developer mode</li>
                <li>Create connector → วาง URL ด้านบน → Authentication: OAuth</li>
              </ol>
            </details>
            <details>
              <summary>Cursor / VS Code / แอปอื่นที่รองรับ MCP</summary>
              <p>เพิ่ม server แบบ HTTP (Streamable HTTP) ด้วย URL ด้านบน แอปจะเปิดหน้า login ให้เอง</p>
              <CopyField value={JSON.stringify({ mcpServers: { "tee-stock": { url } } })} />
            </details>
            <details>
              <summary>Agent / สคริปต์ที่เขียนเอง</summary>
              <p>
                สร้าง API key ด้านล่าง แล้วส่งทุก request ด้วย header <code>Authorization: Bearer &lt;key&gt;</code> — key มีสิทธิ์เท่าบัญชีคุณ
                อย่าใส่ในโค้ดที่เผยแพร่
              </p>
            </details>
          </div>

          <h2 className="sector-heading">AI ทำอะไรได้บ้าง</h2>
          <ul className="connect-tools">
            {TOOLS.map((t) => (
              <li key={t.name}>
                <code>{t.name}</code>
                <span>{t.desc}</span>
                {t.account && <em>ข้อมูลของคุณ</em>}
              </li>
            ))}
          </ul>
          <p className="consent-note">
            เนื้อหาเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน — AI ได้รับคำสั่งให้บอกวันที่ของรายงานและแนบลิงก์กลับมาที่เว็บนี้ทุกครั้ง · จำกัด{" "}
            {RATE_LIMIT_PER_MIN} คำขอ/นาทีต่อการเชื่อมต่อ
          </p>

          <h2 className="sector-heading">
            การเชื่อมต่อของคุณ <span className="sector-count">({connections.length})</span>
          </h2>
          {connections.length === 0 ? (
            <p className="req-empty">ยังไม่มี AI ที่เชื่อมต่อ</p>
          ) : (
            <ul className="req-mine connect-list">
              {connections.map((c) => (
                <li key={c.family} className="done">
                  <span className="req-ticker">{c.label || "AI agent"}</span>
                  <span className="req-state done">{c.kind === "key" ? "API key" : "OAuth"}</span>
                  <span className="req-date">
                    เชื่อมเมื่อ {thTime(c.created_at)} · ใช้ล่าสุด {thTime(c.last_used_at)}
                  </span>
                  <form action={revokeConnection}>
                    <input type="hidden" name="family" value={c.family} />
                    <button type="submit" className="connect-revoke">
                      ถอนสิทธิ์
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <h2 className="sector-heading">API key ส่วนตัว</h2>
          <p className="req-empty">สำหรับ agent ที่ทำ OAuth ไม่ได้ · มีได้สูงสุด {MAX_KEYS_PER_USER} อัน (ตอนนี้ {keyCount})</p>
          <ConnectKeyForm />
        </>
      )}
    </>
  );
}
