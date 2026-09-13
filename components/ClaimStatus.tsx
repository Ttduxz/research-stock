import type { ThesisCheck } from "@/lib/db";
import { InlineMarkdown } from "@/components/Markdown";

const STATUS: Record<string, { label: string; cls: string; icon: string }> = {
  confirmed: { label: "ยืนยันแล้ว", cls: "ck-confirmed", icon: "✓" },
  weakened: { label: "อ่อนลง", cls: "ck-weakened", icon: "!" },
  broken: { label: "พังแล้ว", cls: "ck-broken", icon: "✕" },
  // เดิมใช้ "ยังเร็วเกินไป" — คนอ่านถามกลับว่าเร็วเกินไปสำหรับอะไร จึงเปลี่ยนเป็นคำที่บอกตรงๆ ว่ายังตัดสินไม่ได้
  "too-early": { label: "ยังบอกไม่ได้", cls: "ck-early", icon: "○" },
};

/** เทียบข้อความแบบไม่สนช่องว่างส่วนเกิน — ตัว claim ถูกบังคับให้คัดลอกตรงตัวตั้งแต่ตอน ingest แล้ว */
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** ผลตัดสิน + วันที่ของรอบทบทวนที่ตัดสิน (ThesisCheck เก็บแค่ review_id) */
export type DatedCheck = ThesisCheck & { reviewed_on?: string };

/** จับข้อความในทฤษฎีเข้ากับผลตัดสินล่าสุดของมัน (checks เรียงรอบใหม่มาก่อน) */
export function checkIndex(
  checks: ThesisCheck[],
  reviewDates?: Map<number, string>
): Map<string, DatedCheck> {
  const map = new Map<string, DatedCheck>();
  for (const c of checks) {
    if (map.has(norm(c.claim))) continue;
    map.set(norm(c.claim), { ...c, reviewed_on: reviewDates?.get(c.review_id) });
  }
  return map;
}

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS["too-early"];
  return (
    <span className={`badge ck ${s.cls}`}>
      <span className="ck-icon">{s.icon}</span>
      {s.label}
    </span>
  );
}

/** สรุปจำนวนผลตัดสินแบบย่อ */
export function CheckTally({ checks }: { checks: ThesisCheck[] }) {
  const order = ["confirmed", "weakened", "broken", "too-early"];
  const counts = new Map<string, number>();
  for (const c of checks) counts.set(c.status, (counts.get(c.status) ?? 0) + 1);
  const shown = order.filter((s) => counts.has(s));
  if (shown.length === 0) return null;
  return (
    <span className="ck-tally">
      {shown.map((s) => (
        <span key={s} className={`ck-dot ${STATUS[s].cls}`}>
          {STATUS[s].icon} {STATUS[s].label} {counts.get(s)} ข้อ
        </span>
      ))}
    </span>
  );
}

/** คำอธิบายสถานะครบทั้ง 4 แบบ — ต้องเห็นครบเสมอ ไม่งั้นคนอ่านถอดรหัสสถานะเดี่ยวๆ ไม่ออก */
export function StatusLegend() {
  return (
    <div className="ck-legend">
      <span className="ck-legend-lead">ทุกรอบทบทวนจะตรวจข้อสมมุติทีละข้อว่า</span>
      {["confirmed", "weakened", "broken", "too-early"].map((s) => (
        <span key={s} className={`ck-dot ${STATUS[s].cls}`}>
          {STATUS[s].icon} {STATUS[s].label}
        </span>
      ))}
    </div>
  );
}

function Sources({ json }: { json: string | null }) {
  let sources: { title?: string; url?: string; published_at?: string }[] = [];
  try {
    sources = json ? JSON.parse(json) ?? [] : [];
  } catch {
    return null;
  }
  if (sources.length === 0) return null;
  return (
    <div className="cmp-src">
      {sources.map((s, i) =>
        s.url ? (
          <a key={i} href={s.url} target="_blank" rel="noopener noreferrer">
            {s.title || new URL(s.url).hostname}
            {s.published_at ? ` · ${s.published_at}` : ""} ↗
          </a>
        ) : null
      )}
    </div>
  );
}

/**
 * ข้อสมมุติหนึ่งข้อ + การเทียบ **รอบก่อน กับ รอบนี้**
 *
 * แกนของการเทียบคือ "รอบที่แล้วคิดยังไง → รอบนี้ยังคิดเหมือนเดิมไหม" ไม่ใช่ "รายงานเขียนอะไร → ตรวจแล้วได้อะไร"
 * เพราะตัวข้อความเป็นของรายงานเดิมอยู่แล้วทั้งสองรอบ (จึงยกขึ้นเป็นหัวข้อด้านบน ไม่ต้องซ้ำในคอลัมน์)
 * สิ่งที่ต่างกันจริงระหว่างสองรอบคือ *ความเห็น* ต่อข้อความนั้น
 */
export default function ClaimList({
  items,
  checks,
  prevChecks,
  prevDate,
  runDate,
  className,
}: {
  items: string[];
  checks: Map<string, DatedCheck>;
  /** ผลตัดสินของรอบทบทวนก่อนหน้า (ถ้ามี) */
  prevChecks?: Map<string, DatedCheck>;
  prevDate?: string;
  /** วันที่ของรายงานที่เขียนข้อความนี้ไว้ — ใช้เมื่อยังไม่เคยมีรอบทบทวนก่อนหน้า */
  runDate?: string;
  className: string;
}) {
  return (
    <ul className={className}>
      {items.map((text, i) => {
        const key = norm(text);
        const now = checks.get(key);
        if (!now) {
          return (
            <li key={i}>
              <InlineMarkdown text={text} />
            </li>
          );
        }
        const prev = prevChecks?.get(key);
        const changed = prev && prev.status !== now.status;
        return (
          <li key={i} className="claim-checked">
            <div className="cmp-subject">
              {runDate && <span className="cmp-origin">ข้อสมมุติจากรายงาน {runDate}</span>}
              <p>
                <InlineMarkdown text={text} />
              </p>
            </div>
            <div className={`cmp-grid ${prev ? "" : "cmp-one"}`}>
              {prev && (
                <div className="cmp-col cmp-prev">
                  <span className="cmp-label">รอบก่อน {prev.reviewed_on ?? prevDate ?? ""}</span>
                  <StatusBadge status={prev.status} />
                  {prev.evidence_md && (
                    <p className="cmp-evidence">
                      <InlineMarkdown text={prev.evidence_md} />
                    </p>
                  )}
                  <Sources json={prev.sources_json} />
                </div>
              )}
              <div className={`cmp-col cmp-now ${STATUS[now.status]?.cls ?? "ck-early"}`}>
                <span className="cmp-label">
                  <span className="cmp-new">รอบนี้</span> {now.reviewed_on ?? ""}
                  {changed ? (
                    <span className="cmp-chg">เปลี่ยนความเห็น</span>
                  ) : prev ? (
                    <span className="cmp-same">ยังคิดเหมือนเดิม</span>
                  ) : (
                    <span className="cmp-same">ยังไม่มีรอบก่อนให้เทียบ</span>
                  )}
                </span>
                <StatusBadge status={now.status} />
                {now.evidence_md && (
                  <p className="cmp-evidence">
                    <InlineMarkdown text={now.evidence_md} />
                  </p>
                )}
                <Sources json={now.sources_json} />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
