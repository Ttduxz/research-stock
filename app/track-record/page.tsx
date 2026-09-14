import Link from "next/link";
import type { Metadata } from "next";
import type { TrackRecordRow } from "@/lib/db";
import { listTrackRecordRows } from "@/lib/cached";
import {
  tally,
  byConfidence,
  groupBy,
  isThesisClaim,
  outOf10,
  calibrationVerdict,
  bestAndWorst,
  MIN_RESOLVED,
  STATUS_ORDER,
  type Group,
  type Tally,
  type Tone,
} from "@/lib/track-record";
import { segmentOf, segmentLabel } from "@/lib/segments";
import { InlineMarkdown } from "@/components/Markdown";
import ClaimFeed, { type FeedTab } from "@/components/ClaimFeed";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Track Record | Tee Stock Research",
  description: "ทฤษฎีที่ทีม theorie ตั้งไว้ แม่นแค่ไหนเมื่อเจอหลักฐานจริง — สถิติจากรอบทบทวนรายสัปดาห์",
};

const STATUS_CLS: Record<string, string> = {
  confirmed: "ck-confirmed",
  weakened: "ck-weakened",
  broken: "ck-broken",
  "too-early": "ck-early",
};

const VERDICT_LABEL: Record<string, string> = { bullish: "Bullish", neutral: "Neutral", bearish: "Bearish" };

const CLAIM_TYPE_LABEL: Record<string, string> = {
  assumption: "ข้อสมมุติ (assumption)",
  catalyst: "ปัจจัยกระตุ้น (catalyst)",
  risk: "ความเสี่ยง (risk)",
};

const TONE_ICON: Record<Tone, string> = { good: "✓", warn: "!", bad: "✕", unknown: "?" };

const pct = (n: number | null) => (n == null ? "–" : `${Math.round(n * 100)}%`);

// ---------- กลุ่มของรายการ "เคยพูดว่า → ผล" ----------

/**
 * แปลงสถานะของ reviewer เป็นความหมายสำหรับคนอ่าน — ต้องแยกฝั่ง risk เพราะความหมายกลับกัน:
 * ทฤษฎีที่ "ยืนยัน" = เราถูก (ข่าวดี) แต่ความเสี่ยงที่ "ยืนยัน" = เรื่องร้ายเกิดจริง
 */
type FeedGroup = "wrong" | "risk-hit" | "weak" | "right" | "risk-miss" | "wait";

const FEED_TABS: (FeedTab & { key: FeedGroup })[] = [
  { key: "wrong", label: "🔴 ทายผิด" },
  { key: "risk-hit", label: "⚠️ ความเสี่ยงที่กระทบหุ้น" },
  { key: "weak", label: "🟡 เริ่มไม่ใช่" },
  { key: "right", label: "🟢 ทายถูก" },
  { key: "risk-miss", label: "ความเสี่ยงที่ไม่กระทบ" },
  { key: "wait", label: "⏳ ยังไม่รู้ผล" },
];

function feedGroup(r: TrackRecordRow): FeedGroup {
  if (r.status === "too-early") return "wait";
  if (r.claim_type === "risk") {
    // ใช้ impact ที่ reviewer ระบุก่อน — risk บางข้อคือ "ความเสี่ยงที่ทฤษฎีจะผิด" ซึ่งเกิดจริงแล้วกลับดีต่อหุ้น
    if (r.impact) return r.impact === "good" ? "risk-miss" : "risk-hit";
    return r.status === "confirmed" ? "risk-hit" : "risk-miss";
  }
  if (r.status === "broken") return "wrong";
  if (r.status === "weakened") return "weak";
  return "right";
}

/** ผล + สีของการ์ด — คำเดียวกับชื่อแท็บ คนอ่านจะได้ไม่ต้องแปลสองรอบ */
function baseOutcome(r: TrackRecordRow): { text: string; tone: Tone } {
  const risk = r.claim_type === "risk";
  switch (r.status) {
    case "confirmed":
      return risk ? { text: "เกิดจริง", tone: "bad" } : { text: "ทายถูก", tone: "good" };
    case "weakened":
      return risk ? { text: "โอกาสเกิดลดลง", tone: "good" } : { text: "เริ่มไม่ใช่", tone: "warn" };
    case "broken":
      return risk ? { text: "ไม่เกิด", tone: "good" } : { text: "ทายผิด", tone: "bad" };
    default:
      return { text: "ยังไม่รู้ผล", tone: "unknown" };
  }
}

const TONE_DOT: Record<Tone, string> = { good: "🟢", warn: "🟡", bad: "🔴", unknown: "⏳" };

const IMPACT_TONE: Record<string, Tone> = { good: "good", bad: "bad", mixed: "warn" };
const IMPACT_LABEL: Record<string, string> = { good: "ดี", bad: "ร้าย", mixed: "ปนกัน" };

/**
 * ข้อสมมุติ/ตัวกระตุ้น: สีบอกว่า "เราทายถูกไหม" (วัดความแม่น)
 * ความเสี่ยง: สีบอกว่า "ดีหรือร้ายต่อหุ้น" ตาม impact — เดาจาก status ไม่ได้ ดูเหตุผลที่ feedGroup()
 */
function outcome(r: TrackRecordRow): { text: string; tone: Tone } {
  const base = baseOutcome(r);
  if (r.claim_type === "risk" && r.impact) return { ...base, tone: IMPACT_TONE[r.impact] ?? base.tone };
  return base;
}

function sourcesOf(json: string | null): { title?: string; url?: string; published_at?: string }[] {
  try {
    return json ? (JSON.parse(json) ?? []).filter((s: { url?: string }) => s?.url) : [];
  } catch {
    return [];
  }
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/**
 * การ์ดเดียวจบ: "เคยบอกว่าถ้า X → จะส่งผล Y / ตอนนี้ [ผล] เพราะ Z → ส่งผลให้ U" แล้วตามด้วยข่าวต้นทาง
 * แถวเก่าที่ยังไม่ได้เติมคำอธิบาย 4 ช่อง fallback ไปแสดงข้อความเดิม + เหตุผลของ reviewer ตรงๆ
 */
function ClaimItem({ r, hidden }: { r: TrackRecordRow; hidden: boolean }) {
  const o = outcome(r);
  const sources = sourcesOf(r.sources_json);
  const explained = !!(r.if_md && r.then_md && r.because_md);
  const waiting = r.status === "too-early";
  return (
    <article className={`trk-item trk-${o.tone}`} data-group={feedGroup(r)} data-ticker={r.ticker} hidden={hidden}>
      {/* ไม่ต้องมีชื่อหุ้นซ้ำ — การ์ดอยู่ในกลุ่มของหุ้นตัวนั้นอยู่แล้ว (ดู trk-stock ใน TrackRecordPage) */}
      <header className="trk-item-head">
        <span className="trk-result">
          {TONE_DOT[o.tone]} {o.text}
        </span>
        <span className="trk-meta">
          {r.claim_type === "risk" ? "เตือนความเสี่ยง" : r.claim_type === "catalyst" ? "ทายว่าจะมีตัวกระตุ้น" : "ข้อสมมุติ"}
        </span>
        {r.impact && (
          <span className={`trk-impact trk-${IMPACT_TONE[r.impact] ?? "unknown"}`}>
            ผลต่อหุ้น: {IMPACT_LABEL[r.impact] ?? r.impact}
          </span>
        )}
      </header>

      <div className="trk-said">
        <span className="trk-step">
          💬 เคยบอกว่า{explained ? " ถ้า" : ""}{" "}
          <span className="trk-date">
            ({r.origin_run_date ?? "?"}
            {r.confidence != null && <> · มั่นใจ {r.confidence}</>})
          </span>
        </span>
        <p>
          <InlineMarkdown text={explained ? r.if_md : r.claim} />
        </p>
        {explained && (
          <>
            <span className="trk-step trk-arrow">➡️ จะส่งผล</span>
            <p>
              <InlineMarkdown text={r.then_md} />
            </p>
          </>
        )}
      </div>

      <div className="trk-why">
        <span className="trk-step">
          {TONE_DOT[o.tone]} ตอนนี้: <b className="trk-outcome">{o.text}</b>
          {waiting ? "" : " เพราะ"} <span className="trk-date">(ตรวจ {r.review_date})</span>
        </span>
        {explained ? (
          <p>
            <InlineMarkdown text={r.because_md} />
          </p>
        ) : r.evidence_md ? (
          <p>
            <InlineMarkdown text={r.evidence_md} />
          </p>
        ) : (
          <p className="trk-thin">reviewer ไม่ได้เขียนเหตุผลไว้</p>
        )}
        {explained && r.so_md && (
          <>
            <span className="trk-step trk-arrow">➡️ ส่งผลให้</span>
            <p>
              <InlineMarkdown text={r.so_md} />
            </p>
          </>
        )}
        {sources.length > 0 && (
          <div className="trk-sources">
            ข่าวต้นทาง:{" "}
            {sources.map((s, i) => (
              <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" title={s.title}>
                {s.title ? (s.title.length > 60 ? `${s.title.slice(0, 60)}…` : s.title) : hostOf(s.url!)}
                {s.published_at ? ` (${s.published_at})` : ""} ↗
              </a>
            ))}
          </div>
        )}
      </div>

      {explained && (
        <details className="trk-orig">
          <summary>ข้อความเดิมตรงตัว + เหตุผลฉบับเต็ม</summary>
          <p className="trk-orig-claim">
            <InlineMarkdown text={r.claim} />
          </p>
          {r.evidence_md && (
            <p>
              <InlineMarkdown text={r.evidence_md} />
            </p>
          )}
        </details>
      )}

      <footer className="trk-item-foot">
        {r.theory_title && <>จากทฤษฎี &ldquo;{r.theory_title}&rdquo; — </>}
        <Link href={`/stock/${r.ticker}`}>อ่านรายงาน {r.ticker} ฉบับเต็ม →</Link>
      </footer>
    </article>
  );
}

// ---------- ส่วนสรุป ----------

function Dots({ filled }: { filled: number }) {
  return (
    <span className="trk-dots" aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={i < filled ? "on" : ""} />
      ))}
    </span>
  );
}

function AnswerCard({
  question,
  tone,
  answer,
  children,
}: {
  question: string;
  tone: Tone;
  answer: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className={`trk-answer trk-${tone}`}>
      <div className="trk-q">{question}</div>
      <div className="trk-a">
        <span className="trk-icon">{TONE_ICON[tone]}</span>
        <span>{answer}</span>
      </div>
      {children && <div className="trk-a-detail">{children}</div>}
    </div>
  );
}

// ---------- ส่วนละเอียด (พับไว้) ----------

function StackBar({ t }: { t: Tally }) {
  if (t.total === 0) return null;
  return (
    <div className="trk-bar" role="img" aria-label={STATUS_ORDER.map((s) => `${s} ${t.counts[s]}`).join(", ")}>
      {STATUS_ORDER.map((s) =>
        t.counts[s] > 0 ? (
          <span
            key={s}
            className={`trk-seg ${STATUS_CLS[s]}`}
            style={{ width: `${(t.counts[s] / t.total) * 100}%` }}
            title={`${s}: ${t.counts[s]}`}
          />
        ) : null
      )}
    </div>
  );
}

function GroupTable({ groups, firstCol, showExpected = false }: { groups: Group[]; firstCol: string; showExpected?: boolean }) {
  return (
    <div className="tbl-scroll">
      <table className="fin-tbl trk-tbl">
        <thead>
          <tr>
            <th>{firstCol}</th>
            <th>ทั้งหมด</th>
            <th>รู้ผลแล้ว</th>
            <th>สัดส่วนผล</th>
            {showExpected && <th>มั่นใจเฉลี่ย</th>}
            <th>ถูก</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const thin = g.tally.resolved < MIN_RESOLVED;
            return (
              <tr key={g.label}>
                <td style={{ textAlign: "left" }}>{g.label}</td>
                <td>{g.tally.total}</td>
                <td>{g.tally.resolved}</td>
                <td className="trk-bar-cell">
                  <StackBar t={g.tally} />
                </td>
                {showExpected && <td>{pct(g.tally.avgConfidence)}</td>}
                <td className={thin ? "trk-thin" : "col-now"} title={thin ? "รู้ผลน้อยเกินไป ยังเชื่อไม่ได้" : undefined}>
                  {pct(g.tally.confirmRate)}
                  {thin && g.tally.resolved > 0 && <span className="trk-thin-mark">*</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function TrackRecordPage() {
  const rows = await listTrackRecordRows();
  const thesis = rows.filter(isThesisClaim);

  const all = tally(rows);
  const thesisT = tally(thesis);

  const dates = rows.map((r) => r.review_date).filter(Boolean).sort();
  const firstReview = dates[0];
  const earlyShare = all.total > 0 ? all.counts["too-early"] / all.total : 0;

  const feedCount = new Map<FeedGroup, number>();
  for (const r of rows) feedCount.set(feedGroup(r), (feedCount.get(feedGroup(r)) ?? 0) + 1);
  const wrongN = feedCount.get("wrong") ?? 0;
  const riskHitN = feedCount.get("risk-hit") ?? 0;
  // เปิดหน้ามาเจอเรื่องที่ต้องดูก่อน ถ้าไม่มีเลยค่อยโชว์ข้อที่ทายถูก
  const defaultTab = FEED_TABS.find((t) => (feedCount.get(t.key) ?? 0) > 0)?.key ?? "right";
  const wrongTickers = [...new Set(rows.filter((r) => feedGroup(r) === "wrong").map((r) => r.ticker))];

  const segments = groupBy(thesis, (r) => segmentLabel(segmentOf(r.sector)));
  const calib = calibrationVerdict(thesis);
  const bw = bestAndWorst(segments);

  const hitRateTone: Tone =
    thesisT.resolved < MIN_RESOLVED || thesisT.confirmRate == null
      ? "unknown"
      : thesisT.confirmRate >= 0.65
        ? "good"
        : thesisT.confirmRate >= 0.5
          ? "warn"
          : "bad";

  return (
    <>
      <h1>Track Record</h1>
      <p className="subtitle">ทุกสัปดาห์เราเช็คว่าสิ่งที่รายงานทำนายไว้ เกิดขึ้นจริงไหม — หน้านี้สรุปผลให้</p>

      {rows.length === 0 ? (
        <div className="empty-state">
          ยังไม่มีผลให้สรุป — ต้องทบทวนหุ้นอย่างน้อย 1 รอบก่อน สั่งด้วย <code>/review-stock &lt;TICKER&gt;</code>
        </div>
      ) : (
        <>
          <div className="trk-young">
            ⏳ เพิ่งเริ่มเก็บ ({firstReview}) · <b>ยังรู้ผลไม่ถึง {pct(1 - earlyShare)}</b> ของคำทำนายทั้งหมด —
            ตัวเลขยังขยับได้อีกมาก
          </div>

          <div className="trk-answers">
            <AnswerCard
              question="ทฤษฎีของเราถูกบ่อยแค่ไหน?"
              tone={hitRateTone}
              answer={
                thesisT.confirmRate == null ? (
                  "ยังไม่มีข้อที่รู้ผล"
                ) : (
                  <>
                    ถูก <b className="trk-big">{outOf10(thesisT.confirmRate)} ใน 10</b> ข้อ
                  </>
                )
              }
            >
              {thesisT.confirmRate != null && <Dots filled={outOf10(thesisT.confirmRate)} />}
              นับจาก {thesisT.resolved} ข้อที่รู้ผลแล้ว · <a href="#claims-right">ดูว่าถูกเพราะอะไร</a>
            </AnswerCard>

            <AnswerCard question="ตัวเลข &ldquo;ความมั่นใจ&rdquo; ในรายงานเชื่อได้ไหม?" tone={calib.tone} answer={calib.answer}>
              {calib.detail}
            </AnswerCard>

            <AnswerCard
              question="กลุ่มไหนเราแม่น กลุ่มไหนต้องระวัง?"
              tone={bw ? "warn" : "unknown"}
              answer={bw ? <>ระวังรายงานกลุ่ม <b>{bw.worst.label}</b></> : "ยังเร็วไปที่จะบอก"}
            >
              {bw && (
                <>
                  แม่นสุด: {bw.best.label} (ถูก {outOf10(bw.best.tally.confirmRate!)} ใน 10) · แย่สุด: {bw.worst.label} (ถูก{" "}
                  {outOf10(bw.worst.tally.confirmRate!)} ใน 10)
                </>
              )}
            </AnswerCard>

            <AnswerCard
              question="มีอะไรต้องไปดูไหม?"
              tone={wrongN > 0 ? "bad" : riskHitN > 0 ? "warn" : "good"}
              answer={
                wrongN === 0 && riskHitN === 0 ? (
                  "ไม่มี"
                ) : (
                  <>
                    {wrongN > 0 && (
                      <a href="#claims-wrong">
                        ทายผิด <b>{wrongN}</b> ข้อ
                      </a>
                    )}
                    {wrongN > 0 && riskHitN > 0 && " · "}
                    {riskHitN > 0 && (
                      <a href="#claims-risk-hit">
                        ความเสี่ยงที่กระทบหุ้น <b>{riskHitN}</b> ข้อ
                      </a>
                    )}
                  </>
                )
              }
            >
              {wrongN > 0 && <>ทายผิดที่ {wrongTickers.join(", ")} · กดเพื่อดูเหตุผลด้านล่าง</>}
            </AnswerCard>
          </div>

          <h2 className="sector-heading" id="claims">
            เคยพูดว่าอะไร แล้วเป็นยังไง
          </h2>
          <p className="trk-lead">ทุกข้อที่เคยทำนายไว้ พร้อมผลตรวจและเหตุผล — เลือกดูตามผล หรือเลือกหุ้นตัวเดียว</p>
          <ClaimFeed tabs={FEED_TABS} items={rows.map((r) => ({ group: feedGroup(r), ticker: r.ticker }))} defaultTab={defaultTab}>
            {/* จัดกลุ่มตามหุ้นแล้วพับไว้เหลือแค่ชื่อ — หุ้นบางตัวมีหลายสิบข้อ ถ้ากางทุกข้อทีเดียวหน้าจะรก
                จำนวนข้อ/การซ่อนกลุ่มที่ว่าง คำนวณจากแท็บเริ่มต้นตรงนี้ แล้ว ClaimFeed อัปเดตต่อตอนสลับแท็บ */}
            {[...new Set(rows.map((r) => r.ticker))].sort().map((ticker) => {
              const mine = rows.filter((r) => r.ticker === ticker);
              const n = mine.filter((r) => feedGroup(r) === defaultTab).length;
              return (
                <details key={ticker} className="trk-stock" data-stock-group={ticker} hidden={n === 0}>
                  <summary className="trk-stock-sum">
                    <span className="trk-ticker">{ticker}</span>
                    <span className="trk-stock-count" data-stock-count="">
                      {n} ข้อ
                    </span>
                    <span className="trk-chevron" aria-hidden="true">
                      ▸
                    </span>
                  </summary>
                  <div className="trk-stock-body">
                    {mine.map((r) => (
                      <ClaimItem key={`${r.ticker}-${r.claim}`} r={r} hidden={feedGroup(r) !== defaultTab} />
                    ))}
                  </div>
                </details>
              );
            })}
          </ClaimFeed>

          <details className="trk-more trk-detail">
            <summary>ตัวเลขละเอียด (สำหรับคนที่อยากดูลึก)</summary>

            <div className="trk-howto">
              <b>วิธีอ่าน:</b> ทุกข้อทำนายถูกให้เกรดเป็น <span className="ck-dot ck-confirmed">✓ ถูก</span>{" "}
              <span className="ck-dot ck-weakened">! อ่อนลง</span> <span className="ck-dot ck-broken">✕ ผิด</span>{" "}
              <span className="ck-dot ck-early">○ ยังไม่รู้ผล</span> · คอลัมน์ &ldquo;ถูก&rdquo; นับเฉพาะข้อที่รู้ผลแล้ว ·
              ติด <span className="trk-thin">*</span> = รู้ผลไม่ถึง {MIN_RESOLVED} ข้อ ยังเชื่อไม่ได้ · ความเสี่ยงไม่ถูกนับรวม
              เพราะความเสี่ยงที่ &ldquo;ถูก&rdquo; คือเรื่องร้ายที่เกิดจริง
            </div>

            <h3 className="trk-h3">ความมั่นใจ เทียบกับ ผลจริง</h3>
            <p className="trk-lead">ถ้าความมั่นใจเชื่อได้ ตัวเลขคอลัมน์ &ldquo;ถูก&rdquo; ควรไต่ขึ้นจากแถวบนลงแถวล่าง</p>
            <GroupTable groups={byConfidence(thesis)} firstCol="ความมั่นใจ" showExpected />

            <h3 className="trk-h3">แยกตามประเภท</h3>
            <GroupTable groups={groupBy(rows, (r) => CLAIM_TYPE_LABEL[r.claim_type] ?? r.claim_type)} firstCol="ประเภท" />

            <h3 className="trk-h3">แยกตามกลุ่มอุตสาหกรรม</h3>
            <GroupTable groups={segments} firstCol="กลุ่ม" />

            <h3 className="trk-h3">แยกตาม verdict ตอนเขียนรายงาน</h3>
            <GroupTable
              groups={groupBy(thesis, (r) => (r.verdict ? VERDICT_LABEL[r.verdict] ?? r.verdict : "ไม่ระบุ"))}
              firstCol="Verdict"
            />

            <p className="trk-lead">
              ไม่ใช้ราคาหุ้นในการนับ — ราคาคือสิ่งที่ทฤษฎีพยายามอธิบาย ไม่ใช่หลักฐานว่าทฤษฎีถูก ·
              ช่วงแรกตัวเลขมักดูดีเกินจริง เพราะข้อที่รู้ผลเร็วมักเป็นเรื่องใกล้ตัวที่ทายง่าย
            </p>
          </details>
        </>
      )}
    </>
  );
}
