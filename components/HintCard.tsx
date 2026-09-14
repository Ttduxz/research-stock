import Link from "next/link";
import HintBadge from "@/components/HintBadge";
import type { HintSummary } from "@/lib/db";
import { HINT_STATUS_LABEL, isActiveHint } from "@/lib/hint-status";

/** การ์ด hint — ใช้ทั้งในหน้าแรก (featured) และหน้า /insights (กริดเต็ม) ให้หน้าตาสอดคล้องกันทั้งเว็บ
 *  โครงสร้างคงที่เสมอ: หัวข้อ → dek → meta row (badge เดียว + แหล่งที่มา/วันที่) ท้ายสุด
 */
export default function HintCard({ hint, featured = false }: { hint: HintSummary; featured?: boolean }) {
  // เรื่องที่ทบทวนแล้วว่าจบ/ถูกหักล้าง ยังเปิดอ่านย้อนหลังได้ แต่ต้องดูออกทันทีว่าไม่ใช่ประเด็นที่ยังมีผล
  const inactive = !isActiveHint(hint.status);
  return (
    <Link
      href={`/insights/${hint.slug}`}
      // data-dir ให้ CSS ระบายสีเส้นคาดหัวการ์ดตามทิศทางของ hint (เขียว=โอกาส / แดง=เสี่ยง / ฟ้า=ผสม)
      data-dir={hint.direction ?? "mixed"}
      className={`stock-card hint-card${featured ? " featured" : ""}${inactive ? " inactive" : ""}`}
    >
      <div className="ticker">{hint.title}</div>
      {hint.dek && <div className="name">{hint.dek}</div>}
      <div className="meta">
        <span className="hint-badges">
          <HintBadge direction={hint.direction} magnitude={hint.magnitude} impactScore={hint.impact_score} />
          {inactive && (
            <span className={`badge hint-status st-${hint.status}`}>
              {HINT_STATUS_LABEL[hint.status ?? ""] ?? hint.status}
            </span>
          )}
        </span>
        <span>
          {hint.discovered_from && <>เจอระหว่าง {hint.discovered_from} · </>}
          {hint.run_date}
        </span>
      </div>
    </Link>
  );
}
