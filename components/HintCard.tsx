import Link from "next/link";
import HintBadge from "@/components/HintBadge";
import type { HintSummary } from "@/lib/db";
import { HINT_STATUS_LABEL, isActiveHint } from "@/lib/hint-status";

/** วันที่แบบไทยสั้น (17 ก.ย. 2569) — run_date เก็บเป็น YYYY-MM-DD */
export const fmtHintDate = (d: string) =>
  /^\d{4}-\d{2}-\d{2}/.test(d)
    ? new Date(d.slice(0, 10) + "T00:00:00Z").toLocaleDateString("th-TH", {
        timeZone: "UTC",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : d;

/** การ์ด insight ของหน้า /insights — ภาษาภาพเดียวกับการ์ด /watchlist (.wc: ขอบบนสี + ท้ายการ์ดคั่นเส้น)
 *  ลำดับสายตา: หัวข้อ → dek (ตัด 2 บรรทัด) → ป้ายทิศทาง/ขนาด → ท้ายการ์ด: สถานะ · วันที่ · หุ้นต้นทาง
 *  สถานะโชว์ทุกใบ (ไม่ใช่เฉพาะที่ปิดแล้ว) ให้สแกนได้ว่าเรื่องไหนยังมีผล — สีขอบบนตามทิศทาง (เขียว=โอกาส / แดง=เสี่ยง / ฟ้า=ผสม)
 */
export default function HintCard({ hint }: { hint: HintSummary }) {
  const active = isActiveHint(hint.status);
  const status = hint.status ?? "active";
  return (
    <Link
      href={`/insights/${hint.slug}`}
      data-dir={hint.direction ?? "mixed"}
      className={`in2-card${active ? "" : " is-closed"}`}
    >
      <span className="in2-title">{hint.title}</span>
      {hint.dek && <span className="in2-dek">{hint.dek}</span>}
      <span className="in2-tags">
        <HintBadge direction={hint.direction} magnitude={hint.magnitude} impactScore={hint.impact_score} />
      </span>
      <span className="in2-foot">
        <span className={`in2-status st-${status}`}>
          <i aria-hidden="true" />
          {HINT_STATUS_LABEL[status] ?? status}
        </span>
        <span className="in2-meta" title={hint.discovered_from ? `เจอระหว่างวิเคราะห์ ${hint.discovered_from}` : undefined}>
          {fmtHintDate(hint.run_date)}
          {hint.discovered_from && <> · จาก {hint.discovered_from.split(",").map((t) => t.trim()).join(", ")}</>}
        </span>
      </span>
    </Link>
  );
}
