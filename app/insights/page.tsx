import type { Metadata } from "next";
import { listHints, listStockSectors } from "@/lib/cached";
import { segmentsOfHint } from "@/lib/segments";
import InsightsBrowser from "@/components/InsightsBrowser";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Insights — ประเด็นเชิงระบบ | Tee Stock Research",
  description: "ประเด็นที่เจอระหว่างวิเคราะห์หุ้น แต่กระทบกว้างกว่าตัวหุ้นตัวเดียว — ทั้งความเสี่ยงและโอกาส",
};

export default async function InsightsPage() {
  const [hints, sectors] = await Promise.all([listHints(), listStockSectors()]);
  // แปะ segment ให้แต่ละ hint ตั้งแต่ฝั่ง server (อนุมานจาก sector ของหุ้นต้นทาง — ดู lib/segments.ts)
  // จะได้ไม่ต้องส่งตาราง sector ของหุ้นทุกตัวไปให้ client
  const items = hints.map((h) => ({
    ...h,
    segments: segmentsOfHint(h.discovered_from, (t) => sectors[t]),
  }));

  return (
    <>
      <h1>Insights</h1>
      <p className="subtitle">
        ประเด็นที่ทีม research เจอระหว่างวิเคราะห์หุ้น แต่กระทบกว้างกว่าตัวหุ้นตัวเดียว — เชิงระบบ/อุตสาหกรรม/มหภาค
        ทั้งด้านความเสี่ยงและด้านโอกาส กรองตามมุมมอง/กลุ่มอุตสาหกรรม และเลือกลำดับการเรียงได้
      </p>

      {items.length === 0 ? (
        <div className="empty-state">
          ยังไม่มี insight ในระบบ — จะปรากฏที่นี่อัตโนมัติเมื่อเจอประเด็นที่สำคัญพอระหว่างรัน{" "}
          <code>/research-stock</code>
        </div>
      ) : (
        <InsightsBrowser hints={items} />
      )}
    </>
  );
}
