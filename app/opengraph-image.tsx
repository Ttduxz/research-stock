import { ImageResponse } from "next/og";

/**
 * ภาพพรีวิวตอนแชร์ลิงก์ (LINE / Facebook / X) — ใช้ร่วมทั้งเว็บ
 * ลิงก์หน้าไหนก็ตามที่ crawler เปิดจะถูก redirect ไป /login (ต้อง login) จึงเห็นภาพนี้ภาพเดียว — ตั้งใจ ไม่เปิดเนื้อหารายงาน
 * middleware.ts ยกเว้น path นี้ให้ crawler ดึงได้โดยไม่ต้อง login
 *
 * ฟอนต์ตั้งต้นของ ImageResponse ไม่มีตัวไทย → ดึง Sarabun (ฟอนต์เดียวกับเว็บ) จาก Google Fonts เฉพาะตัวอักษรที่ใช้
 * ถ้าดึงไม่ได้ (เน็ตล่ม/โดนบล็อก) ตกไปใช้ข้อความอังกฤษล้วนกับฟอนต์ตั้งต้น — ภาพต้องออกเสมอ ห้ามพังเป็นกล่องสี่เหลี่ยม
 */

export const alt = "Tee Stock Research — ทีมวิจัยหุ้นด้วย AI ที่ตรวจคำทำนายของตัวเองทุกสัปดาห์";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TITLE = "Tee Stock Research";
// เลี่ยงสระบน+วรรณยุกต์ซ้อนกัน (เช่น "ที่") — satori ไม่จัดตำแหน่ง mark ซ้อน วรรณยุกต์หายไปทั้งตัว
const TH_LINE = "ทีมวิจัยหุ้นด้วย AI ตรวจคำทำนายของตัวเองทุกสัปดาห์";
const TH_SUB = "รายงานภาษาไทย · ทบทวนด้วยหลักฐานพร้อมลิงก์ · เปิดสถิติทายถูก-ผิด";
const TH_NOTE = "เพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน";
const EN_LINE = "AI stock research that grades itself every week";
const EN_SUB = "Thai-language reports · evidence-linked weekly reviews · public track record";

async function loadSarabun(text: string): Promise<ArrayBuffer | null> {
  try {
    const url = `https://fonts.googleapis.com/css2?family=Sarabun:wght@700&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(url, { signal: AbortSignal.timeout(4000) })).text();
    // ไม่ส่ง User-Agent → Google คืน truetype (satori อ่าน woff2 ไม่ได้)
    const src = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    if (!src) return null;
    const res = await fetch(src, { signal: AbortSignal.timeout(4000) });
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const font = await loadSarabun(TITLE + TH_LINE + TH_SUB + TH_NOTE);
  const thai = font != null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#10141a",
          color: "#e4e7ea",
          fontFamily: thai ? "Sarabun" : undefined,
        }}
      >
        {/* โลโก้แท่ง 3 สีแบบเดียวกับ .logo-mark ในเว็บ */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <div style={{ width: 14, height: 28, background: "#5f9df0" }} />
            <div style={{ width: 14, height: 46, background: "#4cc06f" }} />
            <div style={{ width: 14, height: 60, background: "#dba43c" }} />
          </div>
          <div style={{ fontSize: 44, fontWeight: 700, marginLeft: 10 }}>{TITLE}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: thai ? 60 : 64, fontWeight: 700, lineHeight: 1.3 }}>{thai ? TH_LINE : EN_LINE}</div>
          <div style={{ fontSize: 30, color: "#98a2ae", lineHeight: 1.4 }}>{thai ? TH_SUB : EN_SUB}</div>
        </div>

        <div style={{ display: "flex", borderTop: "2px solid #2a313d", paddingTop: 22, fontSize: 24, color: "#6c7581" }}>
          {thai ? TH_NOTE : "For education only — not investment advice"}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: thai ? [{ name: "Sarabun", data: font, weight: 700, style: "normal" }] : undefined,
    }
  );
}
