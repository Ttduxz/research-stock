import type { Metadata } from "next";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { listConnections, mcpAvailable, MAX_KEYS_PER_USER, RATE_LIMIT_PER_MIN } from "@/lib/mcp/store";
import { revokeConnection } from "@/app/connect/actions";
import CopyField from "@/components/CopyField";
import ConnectKeyForm from "@/components/ConnectKeyForm";
import "./connect.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "เชื่อมต่อ AI | Tee Stock Research",
  description: "ให้ AI ของคุณ (Claude, ChatGPT, Cursor หรือ agent ที่เขียนเอง) อ่านรายงานในระบบผ่าน MCP",
};

/** สิ่งที่ agent ทำได้ — ต้องตรงกับ lib/mcp/tools.ts (10 tools: list_insights/get_insight รวมเป็นแถวเดียว) */
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
 * ลำดับหน้า: นี่คืออะไร → 3 ขั้นเชื่อมต่อ (วิธีต่อแอปแต่ละตัวพับไว้) → การเชื่อมต่อของคุณ → รายละเอียดเชิงเทคนิค (พับไว้)
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
    <div className="cn2">
      <header className="cn2-head">
        <h1>เชื่อมต่อ AI</h1>
        <p className="cn2-lead">
          ให้ AI ที่คุณใช้อยู่ (Claude, ChatGPT ฯลฯ) อ่านรายงานในเว็บนี้ แล้วตอบคำถามเรื่องหุ้นให้คุณได้โดยตรง
        </p>
        <p className="cn2-scope">AI เห็นเฉพาะสิ่งที่เว็บนี้แสดงอยู่แล้ว + รายการติดตามของคุณเอง · ถอนสิทธิ์ได้ทุกเมื่อ</p>
      </header>

      {!mcpAvailable ? (
        <div className="cn2-none">การเชื่อมต่อ AI ยังใช้ไม่ได้ในตอนนี้</div>
      ) : (
        <>
          <ol className="cn2-steps">
            <li>
              <span className="cn2-step-n">1</span>
              <div className="cn2-step-body">
                <h2 className="cn2-step-title">คัดลอกที่อยู่นี้</h2>
                <CopyField value={url} label="MCP server URL" />
              </div>
            </li>
            <li>
              <span className="cn2-step-n">2</span>
              <div className="cn2-step-body">
                <h2 className="cn2-step-title">วางในแอป AI ที่คุณใช้</h2>
                <p className="cn2-step-d">เลือกแอปของคุณเพื่อดูว่ากดตรงไหน</p>
                <div className="cn2-apps">
                  <details open>
                    <summary>Claude (เว็บ / แอป / มือถือ)</summary>
                    <ol>
                      <li>Settings → Connectors → Add custom connector</li>
                      <li>วาง URL ด้านบน แล้วกด Connect</li>
                    </ol>
                  </details>
                  <details>
                    <summary>ChatGPT</summary>
                    <ol>
                      <li>Settings → Apps &amp; Connectors → Advanced → เปิด Developer mode</li>
                      <li>Create connector → วาง URL ด้านบน → Authentication: OAuth</li>
                    </ol>
                  </details>
                  <details>
                    <summary>Claude Code</summary>
                    <CopyField value={`claude mcp add --transport http tee-stock ${url}`} />
                    <p>แล้วพิมพ์ /mcp เพื่อ login</p>
                  </details>
                  <details>
                    <summary>Cursor / VS Code / แอปอื่นที่รองรับ MCP</summary>
                    <p>เพิ่ม server แบบ HTTP (Streamable HTTP) ด้วย URL ด้านบน แอปจะเปิดหน้า login ให้เอง</p>
                    <CopyField value={JSON.stringify({ mcpServers: { "tee-stock": { url } } })} />
                  </details>
                  <details>
                    <summary>Agent / สคริปต์ที่เขียนเอง</summary>
                    <p>
                      สร้าง API key ในหัวข้อ “API key ส่วนตัว” ด้านล่าง แล้วส่งทุก request ด้วย header{" "}
                      <code>Authorization: Bearer &lt;key&gt;</code> — key มีสิทธิ์เท่าบัญชีคุณ อย่าใส่ในโค้ดที่เผยแพร่
                    </p>
                  </details>
                </div>
              </div>
            </li>
            <li>
              <span className="cn2-step-n">3</span>
              <div className="cn2-step-body">
                <h2 className="cn2-step-title">Login แล้วกด “อนุญาต”</h2>
                <p className="cn2-step-d">
                  ใช้บัญชี Google เดียวกับเว็บนี้ เสร็จแล้วลองถาม AI เช่น “หุ้นที่ฉันติดตามมีอะไรต้องทำไหม”
                </p>
              </div>
            </li>
          </ol>

          <section className="cn2-sec">
            <div className="cn2-sec-head">
              <h2 className="cn2-h2">การเชื่อมต่อของคุณ</h2>
              <span className="cn2-sec-n">{connections.length}</span>
            </div>
            {connections.length === 0 ? (
              <p className="cn2-empty">ยังไม่มี AI ที่เชื่อมต่อ</p>
            ) : (
              <ul className="cn2-conns">
                {connections.map((c) => (
                  <li key={c.family}>
                    <div className="cn2-conn-id">
                      <span className="cn2-conn-name">{c.label || "AI agent"}</span>
                      <span className="cn2-conn-kind">{c.kind === "key" ? "API key" : "OAuth"}</span>
                    </div>
                    <span className="cn2-conn-time">
                      เชื่อมเมื่อ {thTime(c.created_at)} · ใช้ล่าสุด {thTime(c.last_used_at)}
                    </span>
                    <form action={revokeConnection} className="cn2-conn-act">
                      <input type="hidden" name="family" value={c.family} />
                      <button type="submit" className="cn2-revoke">
                        ถอนสิทธิ์
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="cn2-more" aria-label="รายละเอียดเพิ่มเติม">
            <details>
              <summary>
                AI ทำอะไรได้บ้าง <span className="cn2-sum-n">{TOOLS.length} รายการ</span>
              </summary>
              <ul className="cn2-tools">
                {TOOLS.map((t) => (
                  <li key={t.name}>
                    <span className="cn2-tool-desc">
                      {t.desc}
                      {t.account && <em>ข้อมูลของคุณ</em>}
                    </span>
                    <code>{t.name}</code>
                  </li>
                ))}
              </ul>
            </details>

            <details>
              <summary>
                API key ส่วนตัว{" "}
                <span className="cn2-sum-n">
                  {keyCount}/{MAX_KEYS_PER_USER}
                </span>
              </summary>
              <p className="cn2-more-d">
                สำหรับ agent หรือสคริปต์ที่ทำ OAuth ไม่ได้ · มีได้สูงสุด {MAX_KEYS_PER_USER} อัน (ตอนนี้ {keyCount}) · key
                แสดงครั้งเดียวหลังสร้าง
              </p>
              <ConnectKeyForm />
            </details>

            <details>
              <summary>ความปลอดภัยและข้อจำกัด</summary>
              <ul className="cn2-facts">
                <li>
                  เชื่อมผ่านมาตรฐาน MCP (Model Context Protocol) — login ด้วย OAuth บัญชี Google เดียวกับเว็บนี้ หรือ API key
                  ส่วนตัว
                </li>
                <li>AI อ่านได้เฉพาะรายงานที่เว็บแสดงอยู่แล้ว + รายการติดตามและคำขอของคุณเอง</li>
                <li>จำกัด {RATE_LIMIT_PER_MIN} คำขอ/นาทีต่อการเชื่อมต่อ</li>
                <li>ถอนสิทธิ์ได้ทุกเมื่อในหัวข้อ “การเชื่อมต่อของคุณ” ด้านบน</li>
              </ul>
            </details>
          </section>

          <p className="cn2-note">
            เนื้อหาเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน — AI ได้รับคำสั่งให้บอกวันที่ของรายงานและแนบลิงก์กลับมาที่เว็บนี้ทุกครั้ง
          </p>
        </>
      )}
    </div>
  );
}
