import Link from "next/link";
import HintBadge from "@/components/HintBadge";
import type { HintSummary } from "@/lib/db";

/** การ์ด hint — ใช้ทั้งในหน้าแรก (featured) และหน้า /insights (กริดเต็ม) ให้หน้าตาสอดคล้องกันทั้งเว็บ
 *  โครงสร้างคงที่เสมอ: หัวข้อ → dek → meta row (badge เดียว + แหล่งที่มา/วันที่) ท้ายสุด
 */
export default function HintCard({ hint, featured = false }: { hint: HintSummary; featured?: boolean }) {
  return (
    <Link
      href={`/insights/${hint.slug}`}
      // data-dir ให้ CSS ระบายสีเส้นคาดหัวการ์ดตามทิศทางของ hint (เขียว=โอกาส / แดง=เสี่ยง / ฟ้า=ผสม)
      data-dir={hint.direction ?? "mixed"}
      className={featured ? "stock-card hint-card featured" : "stock-card hint-card"}
    >
      <div className="ticker">{hint.title}</div>
      {hint.dek && <div className="name">{hint.dek}</div>}
      <div className="meta">
        <HintBadge direction={hint.direction} magnitude={hint.magnitude} impactScore={hint.impact_score} />
        <span>
          {hint.discovered_from && <>เจอระหว่าง {hint.discovered_from} · </>}
          {hint.run_date}
        </span>
      </div>
    </Link>
  );
}
