import Link from "next/link";
import HintBadge from "@/components/HintBadge";
import type { HintSummary } from "@/lib/db";

/**
 * แถบ insight หน้าแรกแบบย่อ — แถวละเรื่อง (ป้ายทิศทาง + หัวข้อ) ไม่มี dek
 * เดิมเป็นการ์ดใหญ่ 3 ใบบนสุดของหน้า คนที่เพิ่งเข้ามาเจอเรื่องการเงินเชิงระบบก่อนรู้ว่าเว็บนี้คืออะไร
 * ตอนนี้อยู่ท้ายหน้า เนื้อหาเต็มอยู่ที่ /insights/<slug>
 */
export default function HomeInsights({ hints, total }: { hints: HintSummary[]; total: number }) {
  if (hints.length === 0) return null;
  return (
    <section className="hm-ins" aria-labelledby="hm-ins-title">
      <div className="hm-sec-head">
        <h2 id="hm-ins-title" className="hm-sec-title">
          Insights — ประเด็นที่กระทบทั้งอุตสาหกรรม
        </h2>
        <Link href="/insights" className="hm-sec-link">
          ดูทั้งหมด {total} เรื่อง →
        </Link>
      </div>
      <ul className="hm-ins-list">
        {hints.map((h) => (
          <li key={h.slug}>
            <Link href={`/insights/${h.slug}`} className="hm-ins-row" data-dir={h.direction ?? "mixed"}>
              <span className="hm-ins-title">{h.title}</span>
              <span className="hm-ins-meta">
                <HintBadge direction={h.direction} magnitude={h.magnitude} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
