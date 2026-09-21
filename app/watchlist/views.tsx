import Link from "next/link";
import type { BriefEntry } from "@/lib/watch-brief";
import type { HintSummary, Review, StockOverview } from "@/lib/db";
import VerdictBadge from "@/components/VerdictBadge";
import HintBadge from "@/components/HintBadge";
import WatchButton from "@/components/WatchButton";
import PlanZone, { type Tranche, type ZoneInfo } from "@/components/PlanZone";
import WatchCard from "@/components/WatchCard";

/**
 * การ์ดของหน้า /watchlist — เคยทำไว้ 4 แบบให้เทียบ (การ์ด/ตาราง/เรียงตามระยะห่าง/กระดาน) ผู้ใช้เลือกการ์ด
 * ลำดับสายตาในการ์ด: ticker (+ ★ ขวาบน) → ราคา → ไม้ของแผน (ข้อความ + แถบกำกับ) → ป้ายว่าอะไรใหม่ → สถานะแผน (ท้ายการ์ด + สีขอบบน)
 * ข้อความยาวทั้งหมด (action_md, insight) อยู่ในหน้าต่างรายละเอียดที่เปิดตอนกดการ์ด (components/WatchCard.tsx)
 * ทุกข้อความคัดจากรอบทบทวน/รายงาน/insight ที่มีอยู่ ไม่มีความเห็นใหม่
 */

export interface Tag {
  label: string;
  cls: string;
}

export interface WatchRow {
  stock: StockOverview;
  review: Review | null;
  plan: string;
  price: number | null;
  move: number | null;
  tranches: Tranche[];
  zone: ZoneInfo | null;
  change: BriefEntry | null;
  tags: Tag[];
  insights: HintSummary[];
}

/** คำเดียวของสถานะแผน — คำเต็มอยู่ใน lib/plan-status.ts (หน้าหุ้นใช้คำเต็ม) */
export const PLAN_SHORT: Record<string, string> = {
  "plan-broken": "แผนพัง",
  "plan-live": "เข้าโซนซื้อ",
  watch: "รอดู",
  "no-action": "ยังไม่ต้องทำอะไร",
  none: "ยังไม่ทบทวน",
};
export const PLAN_ORDER = ["plan-broken", "plan-live", "watch", "no-action", "none"];

const CHECKS: { key: string; label: string; cls: string }[] = [
  { key: "broken", label: "พังแล้ว", cls: "ck-broken" },
  { key: "weakened", label: "อ่อนลง", cls: "ck-weakened" },
  { key: "confirmed", label: "ยืนยันแล้ว", cls: "ck-confirmed" },
  { key: "too-early", label: "ยังบอกไม่ได้", cls: "ck-early" },
];
const CLOSED: Record<string, string> = { "played-out": "เกิดขึ้นครบแล้ว", invalidated: "ถูกหักล้างแล้ว" };

const fmtDate = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("th-TH", { timeZone: "UTC", day: "numeric", month: "short" });

/**
 * ป้ายว่าอะไรใหม่: ป้ายแรกบอกว่าเกิดอะไร (ทบทวน/รายงานใหม่ + วันที่) ตามด้วยเรื่องหนักไม่เกิน 2 ป้าย
 * รอบทบทวนที่ไม่มีอะไรเปลี่ยนจึงเหลือแค่ "ทบทวน 21 ก.ย." — เดิมมีป้าย "ทบทวนแล้ว · เหมือนเดิม" ที่ไม่ได้บอกอะไรเพิ่ม
 */
export function changeTags(c: BriefEntry): Tag[] {
  const heavy: Tag[] = [];
  const r = c.review;
  if (r?.stance === "escalate") heavy.push({ label: "ต้องทบทวนใหญ่", cls: "bad" });
  if (r?.checks.broken) heavy.push({ label: `ทฤษฎีพัง ${r.checks.broken}`, cls: "bad" });
  if (c.run?.verdict_from && c.run.verdict_from !== c.run.verdict_to) heavy.push({ label: "มุมมองเปลี่ยน", cls: "warn" });
  if (r && !r.new_plan && r.plan_from !== r.plan_to) heavy.push({ label: "แผนเปลี่ยน", cls: "warn" });
  if (c.insights_closed.length) heavy.push({ label: "insight ถูกปิด", cls: "warn" });
  if (r?.stance === "shifted") heavy.push({ label: "น้ำหนักเปลี่ยน", cls: "warn" });
  if (r?.checks.weakened) heavy.push({ label: `ทฤษฎีอ่อนลง ${r.checks.weakened}`, cls: "warn" });
  if (c.insights_new.length) heavy.push({ label: "insight ใหม่", cls: "warn" });
  const what: Tag = c.run
    ? { label: `รายงานใหม่ ${fmtDate(c.run.date)}`, cls: "new" }
    : r
      ? { label: `ทบทวน ${fmtDate(r.date)}`, cls: "new" }
      : { label: "insight", cls: "new" };
  return [what, ...heavy.slice(0, 2)];
}

/** เนื้อหาในหน้าต่างรายละเอียด — ข้อความยาวทั้งหมดอยู่ที่นี่ที่เดียว */
function Detail({ row }: { row: WatchRow }) {
  const { stock, review, change, insights } = row;
  const r = change?.review ?? null;
  // รายงานถูกทำใหม่หลังรอบทบทวน — action_md เป็นของรอบก่อนหน้านั้น
  const runAfterReview = !!review && !!stock.latest_run_date && stock.latest_run_date > review.review_date;
  return (
    <div className="wc-body">
      {runAfterReview && (
        <p className="wc-note warn">รายงานทำใหม่ {stock.latest_run_date} หลังรอบทบทวน — ข้อความด้านล่างเป็นของรอบก่อนหน้า</p>
      )}
      {review?.action_md ? (
        <div className="wc-quote">
          <span className="wc-k">รอบทบทวน {review.review_date} บอกว่า</span>
          <p className="wc-action">{review.action_md}</p>
        </div>
      ) : (
        <p className="wc-note">ยังไม่มีรอบทบทวน</p>
      )}
      <div className="wc-facts">
        {r && Object.keys(r.checks).length > 0 && (
          <div className="wc-row">
            <span className="wc-k">ทฤษฎีเดิม</span>
            {CHECKS.filter((c) => r.checks[c.key]).map((c) => (
              <span key={c.key} className={`badge ${c.cls}`}>
                {c.label} {r.checks[c.key]}
              </span>
            ))}
          </div>
        )}
        {change?.run?.verdict_from && change.run.verdict_from !== change.run.verdict_to ? (
          <div className="wc-row">
            <span className="wc-k">มุมมอง</span>
            <VerdictBadge verdict={change.run.verdict_from} /> <span className="wc-k">→</span>{" "}
            <VerdictBadge verdict={change.run.verdict_to} />
          </div>
        ) : (
          stock.latest_verdict && (
            <div className="wc-row">
              <span className="wc-k">มุมมอง</span>
              <VerdictBadge verdict={stock.latest_verdict} />
            </div>
          )
        )}
      </div>
      {change?.insights_closed.map((h) => (
        <p key={h.slug} className="wc-note warn">
          <Link href={`/insights/${h.slug}`}>{h.title}</Link> ถูกปิดแล้ว ({CLOSED[h.status] ?? h.status}) —
          รายงานนี้เคยใช้เรื่องนี้
        </p>
      ))}
      {insights.length > 0 && (
        <ul className="wc-insights">
          {insights.map((h) => (
            <li key={h.slug}>
              <HintBadge direction={h.direction} magnitude={h.magnitude} />
              <Link href={`/insights/${h.slug}`}>{h.title}</Link>
            </li>
          ))}
        </ul>
      )}
      <Link href={`/stock/${stock.ticker}`} className="wc-link">
        อ่านรายงานเต็ม {stock.ticker} →
      </Link>
    </div>
  );
}

function Status({ plan }: { plan: string }) {
  return (
    <span className="wc-status">
      <i className="wc-dot" aria-hidden="true" />
      {PLAN_SHORT[plan] ?? plan}
    </span>
  );
}

function PriceRow({ price, move }: { price: number | null; move: number | null }) {
  if (price == null) return null;
  return (
    <div className="wc-pricerow">
      <span className="wc-price">{price.toLocaleString()}</span>
      {move != null && (
        <span className={`wc-move ${move >= 0 ? "up" : "dn"}`} title="เทียบราคาวันที่ทำรายงาน">
          {move > 0 ? "▲" : move < 0 ? "▼" : ""} {Math.abs(move).toFixed(1)}%
        </span>
      )}
    </div>
  );
}

export function Card({ row }: { row: WatchRow }) {
  const { stock, plan, price, move, change } = row;
  const face = (
    <>
      <div className="wc-head">
        <div className="wc-idcol">
          <span className="wc-ticker">{stock.ticker}</span>
          <span className="wc-name">{stock.name}</span>
        </div>
        {/* ดาวอยู่ขวาบนที่เดียว (ผู้ใช้กำหนด) */}
        <WatchButton ticker={stock.ticker} watching compact />
      </div>
      <PriceRow price={price} move={move} />
      <PlanZone tranches={row.tranches} info={row.zone} price={price} />
      {change && (
        <div className="wc-tags">
          {row.tags.map((t) => (
            <span key={t.label} className={`wc-tag ${t.cls}`}>
              {t.label}
            </span>
          ))}
        </div>
      )}
      <div className="wc-foot">
        <Status plan={plan} />
        <span className="wc-more" aria-hidden="true">
          รายละเอียด ›
        </span>
      </div>
    </>
  );
  // หัวหน้าต่างรายละเอียด: สถานะ + ราคา + ไม้ของแผน ซ้ำจากหน้าการ์ด (ย่อ) ให้อ่านรายละเอียดโดยไม่ต้องจำหน้าการ์ด
  const detail = (
    <>
      <div className={`wc-dlg-sum ps-${plan}`}>
        <Status plan={plan} />
        <PriceRow price={price} move={move} />
      </div>
      <PlanZone tranches={row.tranches} info={row.zone} price={price} />
      <Detail row={row} />
    </>
  );
  return (
    <WatchCard
      className={`wc ps-${plan}${change ? " is-new" : ""}`}
      plan={plan}
      ticker={stock.ticker}
      name={stock.name}
      face={face}
      detail={detail}
    />
  );
}
