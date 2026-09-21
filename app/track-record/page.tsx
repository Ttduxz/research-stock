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
import ClaimFeed, { ALL_TAB, type FeedTab } from "@/components/ClaimFeed";
import TrackClaimCard from "@/components/TrackClaimCard";
import "./track-record.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Track Record | Tee Stock Research",
  description: "ทฤษฎีที่ทีม theorie ตั้งไว้ แม่นแค่ไหนเมื่อเจอหลักฐานจริง — สถิติจากรอบทบทวนรายสัปดาห์",
};

/**
 * หน้า /track-record — หน้าความน่าเชื่อถือของเว็บ (landing / หน้าแรก / login ลิงก์มาที่นี่)
 *
 * รื้อใหม่ 2026-09-21 ให้เข้าชุดกับหน้าที่ผู้ใช้อนุมัติแล้ว (login = ตาราง ledger, watchlist = การ์ด + dialog)
 * ลำดับหน้า: ตารางสรุปมีนิยาม + วันที่ → ข้อที่ผิด (ขึ้นก่อนข้อที่ถูก — งานวิจัยที่น่าเชื่อต้องโชว์ข้อพลาดก่อน)
 * → การ์ดทุกข้อ (สั้น กดแล้วเปิด dialog) → ตารางละเอียด (พับไว้)
 * ไม่มี emoji ในหัวข้อ/ป้าย ไม่มีคำเล่นๆ — ผู้ใช้บอกว่าแบบนั้น "ดูไม่ professional"
 * ตัวเลขทุกตัวมาจากแถว thesis_checks ตรงๆ ผ่าน lib/track-record.ts (ไม่ใช้ราคา)
 */

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

/** ป้ายประเภทแบบสั้นบนการ์ด */
const CLAIM_TYPE_SHORT: Record<string, string> = {
  assumption: "ข้อสมมุติ",
  catalyst: "ปัจจัยกระตุ้น",
  risk: "ความเสี่ยงที่เตือนไว้",
};

const pct = (n: number | null) => (n == null ? "–" : `${Math.round(n * 100)}%`);

/** 2026-09-17 → 17 ก.ย. 2569 (วันที่ใน DB เป็นวันตามปฏิทิน ไม่มีเวลา — อ่านเป็น UTC กันเลื่อนวัน) */
function thDate(d: string | null | undefined): string {
  if (!d) return "–";
  const t = new Date(`${d.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(t.getTime())) return d;
  return t.toLocaleDateString("th-TH", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
}

// ---------- กลุ่มของรายการ "เคยพูดว่า → ผล" ----------

/**
 * แปลงสถานะของ reviewer เป็นความหมายสำหรับคนอ่าน — ต้องแยกฝั่ง risk เพราะความหมายกลับกัน:
 * ทฤษฎีที่ "ยืนยัน" = เราถูก (ข่าวดี) แต่ความเสี่ยงที่ "ยืนยัน" = เรื่องร้ายเกิดจริง
 */
type FeedGroup = "wrong" | "risk-hit" | "weak" | "right" | "risk-miss" | "wait";

/** ลำดับแท็บ = ลำดับการ์ดในแท็บ "ทั้งหมด" — ข้อที่ผิดขึ้นก่อนข้อที่ถูกเสมอ */
const FEED_TABS: (FeedTab & { key: FeedGroup | typeof ALL_TAB })[] = [
  { key: ALL_TAB, label: "ทั้งหมด" },
  { key: "wrong", label: "ทายผิด", tone: "bad" },
  { key: "weak", label: "เริ่มไม่ใช่", tone: "warn" },
  { key: "risk-hit", label: "ความเสี่ยงที่กระทบหุ้น", tone: "bad" },
  { key: "right", label: "ทายถูก", tone: "good" },
  { key: "risk-miss", label: "ความเสี่ยงที่ไม่กระทบ", tone: "good" },
  { key: "wait", label: "ยังไม่รู้ผล", tone: "unknown" },
];
const GROUP_RANK = new Map(FEED_TABS.map((t, i) => [t.key, i]));

/** การ์ดต่อหน้าในรายการ — มากกว่านี้กด "แสดงเพิ่ม" (ข้อทั้งหมดหลายร้อย) */
const PAGE_SIZE = 24;
/** ข้อ "เริ่มไม่ใช่" ที่ยกขึ้นมาในส่วนข้อพลาด — ที่เหลืออยู่ในรายการด้านล่าง */
const WEAK_PREVIEW = 6;

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

const explainedOf = (r: TrackRecordRow) => !!(r.if_md && r.then_md && r.because_md);
/** เหตุผลบรรทัดเดียวของผลตรวจ — คำอธิบาย 4 ช่องก่อน แถวเก่า fallback เป็นเหตุผลของ reviewer */
const reasonOf = (r: TrackRecordRow) => (explainedOf(r) ? r.because_md : r.evidence_md);

// ---------- การ์ด / แถว / รายละเอียดใน dialog ----------

function Outcome({ r }: { r: TrackRecordRow }) {
  const o = outcome(r);
  return (
    <span className="tr2-out" data-tone={o.tone}>
      <span className="tr2-dot" aria-hidden="true" />
      {o.text}
    </span>
  );
}

function DialogTitle({ r }: { r: TrackRecordRow }) {
  return (
    <>
      <Outcome r={r} /> · {CLAIM_TYPE_SHORT[r.claim_type] ?? r.claim_type}
    </>
  );
}

/**
 * รายละเอียดเต็มของข้อหนึ่ง: "เคยบอกว่าถ้า X → จะส่งผล Y / ตอนนี้ [ผล] เพราะ Z → ส่งผลให้ U" + ข่าวต้นทาง
 * แถวเก่าที่ยังไม่ได้เติมคำอธิบาย 4 ช่อง fallback ไปแสดงข้อความเดิม + เหตุผลของ reviewer ตรงๆ
 */
function ClaimDetail({ r }: { r: TrackRecordRow }) {
  const o = outcome(r);
  const sources = sourcesOf(r.sources_json);
  const explained = explainedOf(r);
  const waiting = r.status === "too-early";
  return (
    <div className="tr2-detail" data-tone={o.tone}>
      <dl className="tr2-facts">
        <div>
          <dt>รายงานต้นทาง</dt>
          <dd>{thDate(r.origin_run_date)}</dd>
        </div>
        <div>
          <dt>ตรวจล่าสุด</dt>
          <dd>{thDate(r.review_date)}</dd>
        </div>
        {r.confidence != null && (
          <div>
            <dt>ความมั่นใจที่ประกาศ</dt>
            <dd>{r.confidence}</dd>
          </div>
        )}
        {r.impact && (
          <div>
            <dt>ผลต่อหุ้น</dt>
            <dd className="tr2-impact" data-tone={IMPACT_TONE[r.impact] ?? "unknown"}>
              {IMPACT_LABEL[r.impact] ?? r.impact}
            </dd>
          </div>
        )}
      </dl>

      <section className="tr2-step">
        <h3>เคยบอกว่า{explained ? "ถ้า" : ""}</h3>
        <p>
          <InlineMarkdown text={explained ? r.if_md : r.claim} />
        </p>
        {explained && (
          <>
            <h3>จะส่งผล</h3>
            <p>
              <InlineMarkdown text={r.then_md} />
            </p>
          </>
        )}
      </section>

      <section className="tr2-step tr2-now">
        <h3>
          ตอนนี้: <b>{o.text}</b>
          {waiting ? "" : " เพราะ"}
        </h3>
        {explained ? (
          <p>
            <InlineMarkdown text={r.because_md} />
          </p>
        ) : r.evidence_md ? (
          <p>
            <InlineMarkdown text={r.evidence_md} />
          </p>
        ) : (
          <p className="tr2-faint">ผู้ตรวจไม่ได้เขียนเหตุผลไว้</p>
        )}
        {explained && r.so_md && (
          <>
            <h3>ส่งผลให้</h3>
            <p>
              <InlineMarkdown text={r.so_md} />
            </p>
          </>
        )}
      </section>

      {sources.length > 0 && (
        <section className="tr2-src">
          <h3>หลักฐานที่ใช้ตัดสิน</h3>
          <ul>
            {sources.map((s, i) => (
              <li key={i}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.title || hostOf(s.url!)} ↗
                </a>
                {s.published_at && <span className="tr2-faint"> · {s.published_at}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {explained && (
        <section className="tr2-orig">
          <h3>ข้อความเดิมในรายงาน (ตรงตัว)</h3>
          <p>
            <InlineMarkdown text={r.claim} />
          </p>
          {r.evidence_md && (
            <>
              <h3>เหตุผลฉบับเต็มของผู้ตรวจ</h3>
              <p>
                <InlineMarkdown text={r.evidence_md} />
              </p>
            </>
          )}
        </section>
      )}

      <p className="tr2-dlg-foot">
        {r.theory_title && <>จากทฤษฎี &ldquo;{r.theory_title}&rdquo; · </>}
        <Link href={`/stock/${r.ticker}`}>อ่านรายงาน {r.ticker} ฉบับเต็ม →</Link>
      </p>
    </div>
  );
}

/** การ์ดในรายการ: ticker + ผล / ข้อความ 3 บรรทัด / ประเภท + วันที่ตรวจ */
function ClaimCard({ r, hidden }: { r: TrackRecordRow; hidden: boolean }) {
  const o = outcome(r);
  return (
    <TrackClaimCard
      className="tr2-card"
      ticker={r.ticker}
      group={feedGroup(r)}
      hidden={hidden}
      title={<DialogTitle r={r} />}
      detail={<ClaimDetail r={r} />}
      face={
        <div className="tr2-card-in" data-tone={o.tone}>
          <div className="tr2-card-top">
            <span className="tr2-tk">{r.ticker}</span>
            <Outcome r={r} />
          </div>
          <p className="tr2-card-claim">
            <InlineMarkdown text={explainedOf(r) ? r.if_md : r.claim} />
          </p>
          <div className="tr2-card-foot">
            <span>{CLAIM_TYPE_SHORT[r.claim_type] ?? r.claim_type}</span>
            <span>ตรวจ {thDate(r.review_date)}</span>
          </div>
        </div>
      }
    />
  );
}

/** แถวในส่วน "ข้อที่ผิด": ticker / ข้อความเดิม 1 บรรทัด / เหตุผล 2 บรรทัด / วันที่ */
function MissRow({ r }: { r: TrackRecordRow }) {
  const o = outcome(r);
  const why = reasonOf(r);
  return (
    <TrackClaimCard
      className="tr2-miss"
      ticker={r.ticker}
      title={<DialogTitle r={r} />}
      detail={<ClaimDetail r={r} />}
      face={
        <div className="tr2-miss-in" data-tone={o.tone}>
          <span className="tr2-tk">{r.ticker}</span>
          <div className="tr2-miss-text">
            <p className="tr2-miss-claim">
              <InlineMarkdown text={explainedOf(r) ? r.if_md : r.claim} />
            </p>
            {why && (
              <p className="tr2-miss-why">
                <span className="tr2-k">เหตุผล</span> <InlineMarkdown text={why} />
              </p>
            )}
          </div>
          <span className="tr2-miss-date">{thDate(r.review_date)}</span>
        </div>
      }
    />
  );
}

// ---------- ส่วนสรุป ----------

/** แถบสัดส่วนผลตรวจ — ทุกช่องมีป้ายกำกับ (ผู้ใช้สับสนกับแถบสีที่ไม่มีตัวเลข) */
function ResultBar({ t }: { t: Tally }) {
  const parts: { key: string; label: string; cls: string; n: number }[] = [
    { key: "confirmed", label: "ยืนยัน", cls: "ck-confirmed", n: t.counts.confirmed },
    { key: "weakened", label: "เริ่มไม่ใช่", cls: "ck-weakened", n: t.counts.weakened },
    { key: "broken", label: "ผิด", cls: "ck-broken", n: t.counts.broken },
    { key: "too-early", label: "ยังรอผล", cls: "ck-early", n: t.counts["too-early"] },
  ];
  if (t.total === 0) return null;
  return (
    <figure className="tr2-fig">
      <figcaption>ผลตรวจสมมุติฐาน + ปัจจัยกระตุ้น {t.total.toLocaleString()} ข้อ</figcaption>
      <div className="tr2-bar" role="img" aria-label={parts.map((p) => `${p.label} ${p.n} ข้อ`).join(", ")}>
        {parts.map((p) =>
          p.n > 0 ? (
            <span key={p.key} className={`tr2-seg ${p.cls}`} style={{ width: `${(p.n / t.total) * 100}%` }}>
              {p.n / t.total >= 0.09 ? p.n : ""}
            </span>
          ) : null
        )}
      </div>
      <ul className="tr2-legend">
        {parts.map((p) => (
          <li key={p.key}>
            <span className={`tr2-sw ${p.cls}`} aria-hidden="true" />
            {p.label}
            <b>{p.n}</b>
            <span className="tr2-faint">{pct(p.n / t.total)}</span>
          </li>
        ))}
      </ul>
    </figure>
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
  const risks = rows.filter((r) => !isThesisClaim(r));

  const thesisT = tally(thesis);
  const riskT = tally(risks);

  const dates = rows.map((r) => r.review_date).filter(Boolean).sort();
  const firstReview = dates[0];
  const lastReview = dates[dates.length - 1];
  const spanDays =
    firstReview && lastReview
      ? Math.round((Date.parse(`${lastReview.slice(0, 10)}T00:00:00Z`) - Date.parse(`${firstReview.slice(0, 10)}T00:00:00Z`)) / 86_400_000)
      : null;
  const companies = new Set(rows.map((r) => r.ticker)).size;

  const byGroup = new Map<FeedGroup, TrackRecordRow[]>();
  for (const r of rows) byGroup.set(feedGroup(r), [...(byGroup.get(feedGroup(r)) ?? []), r]);
  const newestFirst = (a: TrackRecordRow, b: TrackRecordRow) =>
    b.review_date.localeCompare(a.review_date) || a.ticker.localeCompare(b.ticker);
  const wrong = [...(byGroup.get("wrong") ?? [])].sort(newestFirst);
  const weak = [...(byGroup.get("weak") ?? [])].sort(newestFirst);
  const riskHitN = byGroup.get("risk-hit")?.length ?? 0;

  // ลำดับในรายการ: ผิด → เริ่มไม่ใช่ → ความเสี่ยงที่กระทบ → ถูก → … (ตาม FEED_TABS) แล้วรอบตรวจใหม่สุดก่อน
  const feed = [...rows].sort(
    (a, b) => (GROUP_RANK.get(feedGroup(a)) ?? 99) - (GROUP_RANK.get(feedGroup(b)) ?? 99) || newestFirst(a, b)
  );

  const segments = groupBy(thesis, (r) => segmentLabel(segmentOf(r.sector)));
  const calib = calibrationVerdict(thesis);
  const bw = bestAndWorst(segments);
  const thinSample = thesisT.resolved < MIN_RESOLVED;

  return (
    <div className="tr2">
      <p className="tr2-eyebrow">Track Record</p>
      <h1 className="tr2-title">ผลงานย้อนหลัง</h1>
      <p className="tr2-lead">
        ทุกสัปดาห์ผู้ตรวจนำข้อสรุปในรายงานเดิมมาตัดสินด้วยหลักฐานใหม่ที่มีลิงก์อ้างอิง หน้านี้รวมผลทั้งที่ถูกและผิด
        โดยไม่ใช้ราคาหุ้นเป็นหลักฐาน
      </p>

      {rows.length === 0 ? (
        <div className="empty-state">
          ยังไม่มีผลให้สรุป — ต้องทบทวนหุ้นอย่างน้อย 1 รอบก่อน สั่งด้วย <code>/review-stock &lt;TICKER&gt;</code>
        </div>
      ) : (
        <>
          <section className="tr2-top" aria-label="สรุปผลการตรวจ">
            <div className="tr2-ledger">
              <div className="tr2-ledger-head">
                <span>สรุปผลการตรวจ</span>
                <span>ข้อมูล ณ {thDate(lastReview)}</span>
              </div>
              <dl>
                <div className="tr2-row">
                  <dt>
                    สัดส่วนที่หลักฐานยืนยัน
                    <small>
                      ยืนยัน {thesisT.counts.confirmed} จาก {thesisT.resolved} ข้อที่ตัดสินแล้ว (สมมุติฐาน + ปัจจัยกระตุ้น)
                      {thinSample && ` · ต่ำกว่า ${MIN_RESOLVED} ข้อ ยังอ่านเป็นแนวโน้มไม่ได้`}
                    </small>
                  </dt>
                  <dd>{thesisT.confirmRate == null ? "–" : `${(thesisT.confirmRate * 100).toFixed(1)}%`}</dd>
                </div>
                <div className="tr2-row">
                  <dt>
                    ตัดสินแล้ว / ยังรอผล
                    <small>ข้อที่ยังรอผลไม่นับในสัดส่วนด้านบน</small>
                  </dt>
                  <dd>
                    {thesisT.resolved} <span className="tr2-dd-sep">/</span> {thesisT.counts["too-early"]}
                  </dd>
                </div>
                <div className="tr2-row tr2-row-bad">
                  <dt>
                    ผิด / เริ่มไม่ใช่
                    <small>ผิด = หลักฐานหักล้าง · เริ่มไม่ใช่ = หลักฐานใหม่ค้าน แต่ยังไม่ถึงขั้นหักล้าง</small>
                  </dt>
                  <dd>
                    <a href="#misses">
                      {thesisT.counts.broken} <span className="tr2-dd-sep">/</span> {thesisT.counts.weakened}
                    </a>
                  </dd>
                </div>
                <div className="tr2-row">
                  <dt>
                    ความเสี่ยงที่เตือนไว้แล้วกระทบหุ้น
                    <small>
                      จากความเสี่ยงทั้งหมด {riskT.total} ข้อ (รู้ผลแล้ว {riskT.resolved}) — นับแยก เพราะความเสี่ยงที่
                      &ldquo;ยืนยัน&rdquo; คือเรื่องร้ายเกิดจริง ไม่ใช่ความแม่นของทฤษฎี
                    </small>
                  </dt>
                  <dd>
                    <a href="#claims-risk-hit">{riskHitN}</a>
                  </dd>
                </div>
                <div className="tr2-row">
                  <dt>
                    ข้อสรุปที่ติดตามทั้งหมด
                    <small>
                      จาก {companies} บริษัท · สมมุติฐาน + ปัจจัยกระตุ้น {thesisT.total} · ความเสี่ยง {riskT.total}
                    </small>
                  </dt>
                  <dd>{rows.length.toLocaleString()}</dd>
                </div>
              </dl>
              <p className="tr2-note">
                เริ่มเก็บผลเมื่อ {thDate(firstReview)}
                {spanDays != null && ` (${spanDays} วัน)`} ช่วงเก็บข้อมูลยังสั้น ตัวเลขจึงเปลี่ยนแปลงได้มาก
                และข้อที่รู้ผลเร็วมักเป็นเรื่องใกล้ตัวที่ตัดสินง่าย สัดส่วนช่วงแรกจึงมักสูงกว่าที่จะเป็นในระยะยาว
              </p>
            </div>

            <div className="tr2-side">
              <ResultBar t={thesisT} />
              <dl className="tr2-obs">
                <div>
                  <dt>ความมั่นใจที่ประกาศในรายงาน เชื่อได้ไหม</dt>
                  <dd data-tone={calib.tone}>{calib.answer}</dd>
                  <dd className="tr2-obs-note">{calib.detail}</dd>
                </div>
                <div>
                  <dt>แยกตามกลุ่มอุตสาหกรรม</dt>
                  {bw ? (
                    <>
                      <dd>
                        สูงสุด {bw.best.label} · ต่ำสุด {bw.worst.label}
                      </dd>
                      <dd className="tr2-obs-note">
                        {bw.best.label} ยืนยัน {outOf10(bw.best.tally.confirmRate!)} ใน 10 · {bw.worst.label} ยืนยัน{" "}
                        {outOf10(bw.worst.tally.confirmRate!)} ใน 10 (นับเฉพาะกลุ่มที่ตัดสินแล้วอย่างน้อย {MIN_RESOLVED} ข้อ)
                      </dd>
                    </>
                  ) : (
                    <dd className="tr2-obs-note">ยังมีกลุ่มที่ตัดสินแล้วครบ {MIN_RESOLVED} ข้อไม่พอให้เทียบ</dd>
                  )}
                </div>
              </dl>
            </div>
          </section>

          <section className="tr2-sec" id="misses" aria-labelledby="misses-title">
            <div className="tr2-sec-head">
              <h2 id="misses-title" className="tr2-h2">
                ข้อที่ทายผิด
              </h2>
              <span className="tr2-sec-note">{wrong.length} ข้อ · กดเพื่อดูเหตุผลและหลักฐาน</span>
            </div>
            {wrong.length === 0 ? (
              <p className="tr2-empty">ยังไม่มีข้อที่หลักฐานหักล้าง</p>
            ) : (
              <div className="tr2-misses">
                {wrong.map((r) => (
                  <MissRow key={`${r.ticker}-${r.claim}`} r={r} />
                ))}
              </div>
            )}

            {weak.length > 0 && (
              <>
                <div className="tr2-sec-head tr2-sub-head">
                  <h3 className="tr2-h3">เริ่มไม่ใช่</h3>
                  <span className="tr2-sec-note">
                    {weak.length} ข้อ · หลักฐานใหม่ค้าน แต่ยังไม่ถึงขั้นหักล้าง
                    {weak.length > WEAK_PREVIEW && ` · แสดง ${WEAK_PREVIEW} ข้อล่าสุด`}
                  </span>
                </div>
                <div className="tr2-misses">
                  {weak.slice(0, WEAK_PREVIEW).map((r) => (
                    <MissRow key={`${r.ticker}-${r.claim}`} r={r} />
                  ))}
                </div>
                {weak.length > WEAK_PREVIEW && (
                  <a className="tr2-link" href="#claims-weak">
                    ดูทั้งหมด {weak.length} ข้อ →
                  </a>
                )}
              </>
            )}
          </section>

          <section className="tr2-sec" aria-labelledby="claims">
            <div className="tr2-sec-head">
              <h2 id="claims" className="tr2-h2">
                ทุกข้อที่ตรวจแล้ว
              </h2>
              <span className="tr2-sec-note">กดการ์ดเพื่อดู เคยบอกว่าถ้า → จะส่งผล / ตอนนี้ เพราะ → ส่งผลให้</span>
            </div>
            <ClaimFeed
              tabs={FEED_TABS}
              items={feed.map((r) => ({ group: feedGroup(r), ticker: r.ticker }))}
              defaultTab={ALL_TAB}
              pageSize={PAGE_SIZE}
            >
              {feed.map((r, i) => (
                <ClaimCard key={`${r.ticker}-${r.claim}`} r={r} hidden={i >= PAGE_SIZE} />
              ))}
            </ClaimFeed>
          </section>

          <details className="tr2-tables">
            <summary>ตารางละเอียด: แยกตามความมั่นใจ ประเภท กลุ่มอุตสาหกรรม และ verdict</summary>

            <div className="trk-howto">
              <b>วิธีอ่าน:</b> ทุกข้อทำนายถูกให้เกรดเป็น <span className="ck-dot ck-confirmed">✓ ถูก</span>{" "}
              <span className="ck-dot ck-weakened">! อ่อนลง</span> <span className="ck-dot ck-broken">✕ ผิด</span>{" "}
              <span className="ck-dot ck-early">○ ยังไม่รู้ผล</span> (สีเดียวกับแถบในคอลัมน์ &ldquo;สัดส่วนผล&rdquo;) ·
              คอลัมน์ &ldquo;ถูก&rdquo; นับเฉพาะข้อที่รู้ผลแล้ว · ติด <span className="trk-thin">*</span> = รู้ผลไม่ถึง{" "}
              {MIN_RESOLVED} ข้อ ยังเชื่อไม่ได้ · ความเสี่ยงไม่ถูกนับรวม เพราะความเสี่ยงที่ &ldquo;ถูก&rdquo;
              คือเรื่องร้ายที่เกิดจริง
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
    </div>
  );
}
