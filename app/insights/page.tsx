import type { Metadata } from "next";
import { listHints, listStockSectors } from "@/lib/cached";
import { segmentsOfHint } from "@/lib/segments";
import InsightsBrowser from "@/components/InsightsBrowser";
import "./insights.css";

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
    <div className="in2">
      <header className="in2-head">
        <h1>Insights</h1>
        <p className="in2-lead">
          ประเด็นระดับอุตสาหกรรมหรือเศรษฐกิจที่เจอระหว่างวิเคราะห์หุ้น และกระทบหุ้นมากกว่าหนึ่งตัว — ทั้งความเสี่ยงและโอกาส
        </p>
      </header>

      {items.length === 0 ? (
        <div className="in2-none">ยังไม่มี insight — จะขึ้นที่นี่เมื่อทีมเจอประเด็นที่สำคัญพอ</div>
      ) : (
        <InsightsBrowser hints={items} />
      )}
    </div>
  );
}
