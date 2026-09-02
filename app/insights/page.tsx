import Link from "next/link";
import type { Metadata } from "next";
import { listHints } from "@/lib/db";
import HintBadge from "@/components/HintBadge";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Insights — ประเด็นเชิงระบบ | Tee Stock Research",
  description: "ประเด็นที่ research team เจอระหว่างวิเคราะห์หุ้น แต่กระทบกว้างกว่าตัวหุ้นตัวเดียว — ทั้งความเสี่ยงและโอกาส",
};

export default async function InsightsPage() {
  const hints = await listHints();

  return (
    <>
      <h1>Insights</h1>
      <p className="subtitle">
        ประเด็นที่ทีม research เจอระหว่างวิเคราะห์หุ้น แต่กระทบกว้างกว่าตัวหุ้นตัวเดียว — เชิงระบบ/อุตสาหกรรม/มหภาค
        ทั้งด้านความเสี่ยงและด้านโอกาส
      </p>

      {hints.length === 0 ? (
        <div className="empty-state">
          ยังไม่มี insight ในระบบ — จะปรากฏที่นี่อัตโนมัติเมื่อ research team เจอประเด็นที่สำคัญพอระหว่างรัน{" "}
          <code>/research-stock</code>
        </div>
      ) : (
        <div className="stock-grid">
          {hints.map((h) => (
            <Link key={h.slug} href={`/insights/${h.slug}`} className="stock-card">
              <div className="ticker" style={{ fontSize: 16, lineHeight: 1.4 }}>{h.title}</div>
              {h.dek && <div className="name" style={{ whiteSpace: "normal" }}>{h.dek}</div>}
              <div className="meta">
                <HintBadge direction={h.direction} magnitude={h.magnitude} />
                <span>
                  {h.discovered_from && <>เจอระหว่าง {h.discovered_from} · </>}
                  {h.run_date}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
