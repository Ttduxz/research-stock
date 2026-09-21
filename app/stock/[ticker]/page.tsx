import Link from "next/link";
import { notFound } from "next/navigation";
import type { RunDetails, EntryPlan } from "@/lib/db";
import { getStock, listRuns, listReviews, listThesisChecks, getRunBundle } from "@/lib/cached";
import { getLatestQuotes, type Quote } from "@/lib/quote";
import Markdown, { InlineMarkdown } from "@/components/Markdown";
import VerdictBadge from "@/components/VerdictBadge";
import ResearchNote, { NoteRail, noteSections } from "@/components/ResearchNote";
import ScenarioLadder from "@/components/ScenarioLadder";
import CategoryIcon from "@/components/CategoryIcon";
import ClaimList, { CheckTally, StatusLegend, checkIndex } from "@/components/ClaimStatus";
import WatchButton from "@/components/WatchButton";
import PlanZone, { parseTranches, zoneInfo } from "@/components/PlanZone";
import Chevron from "@/components/Chevron";
import StockSections from "@/components/StockSections";
import { auth } from "@/auth";
import { isWatching, watchlistAvailable } from "@/lib/watchlist";
import { PLAN_STATUS_LABEL } from "@/lib/plan-status";
import { PLAN_SHORT } from "@/app/watchlist/views";
import "./stock.css";

export const dynamic = "force-dynamic";

/**
 * หน้าหุ้น = "สรุปก่อน รายละเอียดตอนกด"
 * เดิมยาว ~39 จอ (มือถือ 67 จอ) 21 หัวข้อ คนอ่านไม่รู้จะดูตรงไหนก่อน จึงแบ่งเป็น 2 ชั้น:
 *  1) hero (.sp-hero) ตอบว่า "ตอนนี้หุ้นตัวนี้อยู่สถานะไหน" ในจอเดียว — ภาษาภาพเดียวกับการ์ด /watchlist ที่ผู้ใช้เลือกแล้ว
 *     ราคาสด + สถานะแผน (จาก plan_status ของรอบทบทวนเท่านั้น ไม่เดาจากราคา) + แถบไม้ + ข้อความรอบทบทวน + ตัวเลขหลักไม่กี่ตัว
 *  2) รายงานฉบับเต็มเป็นหัวข้อพับได้ (components/StockSections.tsx) — ข้อมูลเดิมครบทุกชิ้น ลิงก์ #id เดิมยังเปิดถึง
 * CSS ของหน้านี้อยู่ ./stock.css (คลาสขึ้นต้น sp-) รวมกฎขนาดตัวอักษรขั้นต่ำ 12px / มือถือ 13px
 */

const CATEGORY_LABELS: Record<string, string> = {
  news: "ข่าว",
  financials: "งบการเงิน",
  filing: "เอกสารทางการ",
  industry: "อุตสาหกรรม",
  sentiment: "ความเห็นตลาด",
  other: "อื่นๆ",
};

const STANCE_LABEL: Record<string, string> = {
  same: "ยังมองเหมือนเดิม",
  shifted: "น้ำหนักเปลี่ยน",
  escalate: "ต้องทบทวนใหญ่",
};

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

interface Scenario {
  target?: number;
  probability?: number;
  rationale?: string;
}

/** วันที่ 'YYYY-MM-DD' → "21 ก.ย." (เหมือนหน้า /watchlist) */
const fmtDay = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("th-TH", { timeZone: "UTC", day: "numeric", month: "short" });

/** เวลาของราคาสด (เวลาไทย) — วันเดียวกันบอกแค่เวลา ถ้าเป็นราคาปิดของวันก่อน (ตลาดปิด) บอกวันที่แทน — ตรงกับ /watchlist */
function fmtQuoteTime(asOf: string | null): string | null {
  if (!asOf) return null;
  const t = new Date(asOf);
  if (Number.isNaN(t.getTime())) return null;
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  return day(t) === day(new Date())
    ? t.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" })
    : t.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short" });
}

/** หัวข้อพับได้หนึ่งหัวข้อ — id อยู่ที่ <details> เพื่อให้ลิงก์ #id เดิมเปิดถึง (StockSections เปิดให้) */
function Section({
  id,
  title,
  meta,
  children,
}: {
  id: string;
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <details className="sp-sec" id={id}>
      <summary>
        <div className="sp-sec-text">
          <h2 className="sp-sec-title">{title}</h2>
          {meta && <div className="sp-sec-meta">{meta}</div>}
        </div>
        <span className="sp-chev" aria-hidden="true">
          <Chevron size={16} />
        </span>
      </summary>
      <div className="sp-sec-body">{children}</div>
    </details>
  );
}

export default async function StockPage({
  params,
  searchParams,
}: {
  params: Promise<{ ticker: string }>;
  searchParams: Promise<{ run?: string }>;
}) {
  const { ticker: rawTicker } = await params;
  const { run: runParam } = await searchParams;
  const ticker = decodeURIComponent(rawTicker).toUpperCase();

  const stock = await getStock(ticker);
  if (!stock) notFound();

  // สถานะ ☆ ติดตาม เป็นของแต่ละคน — อ่านสด (ไม่ผ่าน cache) คู่ขนานกับข้อมูลหุ้นที่ cache ร่วมกัน
  // ราคาสดยิงพร้อมกัน — ดึงไม่ได้/ช้าเกิน timeout ของ lib/quote.ts = fallback เป็นราคาจากรอบทบทวน/รายงาน หน้าไม่พัง
  const session = await auth();
  const email = session?.user?.email ?? null;
  const [runs, reviews, checks, watching, quotes] = await Promise.all([
    listRuns(ticker),
    listReviews(ticker),
    listThesisChecks(ticker),
    email && watchlistAvailable ? isWatching(email, ticker) : Promise.resolve(false),
    getLatestQuotes([ticker]).catch(() => new Map<string, Quote>()),
  ]);
  const selectedRunId =
    runParam && runs.some((r) => r.id === Number(runParam))
      ? Number(runParam)
      : runs[0]?.id;

  const bundle = selectedRunId ? await getRunBundle(selectedRunId) : null;
  const keyPoints = parseJson<string[]>(bundle?.analysis?.key_points ?? null);
  const details = parseJson<RunDetails>(bundle?.run?.details_json ?? null);
  const entryPlan = parseJson<EntryPlan>(bundle?.run?.entry_plan_json ?? null);

  // รอบทบทวนที่ทบทวน "รอบที่กำลังดูอยู่" นี้ — ใหม่สุดมาก่อน
  const runReviews = reviews.filter((v) => v.base_run_id === selectedRunId);
  const runReviewIds = new Set(runReviews.map((v) => v.id));
  const runChecks = checks.filter((c) => runReviewIds.has(c.review_id));
  const latestReview = runReviews[0] ?? null;
  const latestReviewId = latestReview?.id ?? -1;
  const reviewDates = new Map(reviews.map((v) => [v.id, v.review_date]));

  // เทียบ "รอบก่อน กับ รอบนี้" — รอบก่อนคือรอบทบทวนก่อนหน้ารอบล่าสุด (อาจเป็นรอบที่ทบทวนรายงานฉบับก่อนก็ได้)
  const claimChecks = checkIndex(
    runChecks.filter((c) => c.review_id === latestReviewId),
    reviewDates
  );
  const prevReview = reviews.find((v) => v.id !== latestReviewId) ?? null;
  const prevClaimChecks = prevReview
    ? checkIndex(
        checks.filter((c) => c.review_id === prevReview.id),
        reviewDates
      )
    : undefined;

  // ช่วงเป้าราคารวมจากทุกทฤษฎีของรอบนี้ — แสดงเป็นช่วง ไม่เฉลี่ย เพราะแต่ละทฤษฎีมองคนละมุม
  const targetBand = (() => {
    const buckets: Record<"bear" | "base" | "bull", number[]> = { bear: [], base: [], bull: [] };
    for (const t of bundle?.theories ?? []) {
      const sc = parseJson<Record<string, Scenario>>(t.scenarios);
      for (const k of ["bear", "base", "bull"] as const) {
        const v = sc?.[k]?.target;
        if (typeof v === "number" && Number.isFinite(v)) buckets[k].push(v);
      }
    }
    const fmt = (xs: number[]) => {
      if (xs.length === 0) return null;
      const lo = Math.min(...xs);
      const hi = Math.max(...xs);
      return lo === hi ? `${lo.toLocaleString()}` : `${lo.toLocaleString()}–${hi.toLocaleString()}`;
    };
    const out = { bear: fmt(buckets.bear), base: fmt(buckets.base), bull: fmt(buckets.bull) };
    return out.bear || out.base || out.bull ? out : null;
  })();

  // ---- hero: ราคาสด (fallback รายตัวแบบ /watchlist) ----
  // ราคาสดใช้แค่แสดงราคา + ตำแหน่งบนแถบไม้ — สถานะแผนมาจาก plan_status ของรอบทบทวนเท่านั้น
  const quote = quotes.get(stock.ticker) ?? null;
  const reviewPrice = latestReview?.price_at_review ?? null;
  const runPrice = bundle?.run?.price_at_run ?? null;
  const fallback = reviewPrice ?? runPrice;
  const fallbackDate = reviewPrice != null ? latestReview!.review_date : (bundle?.run?.run_date ?? null);
  const price = quote ? quote.price : fallback;
  const priceLabel = quote
    ? { text: `ราคา ${fmtQuoteTime(quote.asOf) ?? "ล่าสุด"}`, live: true }
    : fallback != null && fallbackDate
      ? { text: `ราคา ณ ${reviewPrice != null ? "ทบทวน" : "รายงาน"} ${fmtDay(fallbackDate)}`, live: false }
      : null;
  const rawMove = quote
    ? quote.changePct != null
      ? quote.changePct * 100
      : null
    : reviewPrice != null
      ? (latestReview?.price_move_pct ?? null)
      : null;
  // ราคาสดบางตัวมาทศนิยม 3 ตำแหน่ง — ตัดเหลือ 2 · ลูกศรดูจากค่าที่ปัดแล้ว ไม่ให้เกิด "▼ 0.0%"
  const move = rawMove != null ? Math.round(rawMove * 10) / 10 : null;
  const moveTitle = quote ? "เปลี่ยนแปลงวันนี้" : "เทียบราคาวันที่ทำรายงาน";
  const plan = latestReview?.plan_status ?? "none";
  const tranches = parseTranches(bundle?.run?.entry_plan_json ?? null);
  const zone = price != null ? zoneInfo(tranches, price) : null;
  // แถบไม้บอก "ราคา ณ ทบทวน" เมื่อไม่มีราคาสด — ถ้าราคาที่มีเป็นของวันทำรายงาน ป้ายจะผิด จึงไม่แสดงแถบ (แผนเต็มอยู่ในหัวข้อแผนสะสม)
  const showZone = !!quote || reviewPrice != null;
  const a = bundle?.analysis ?? null;

  // index หัวข้อย่อยของ research note — ใช้เป็นคำอธิบายใต้หัวข้อ "ข้อมูลบริษัทและงบการเงิน"
  const noteParts = details ? noteSections(details) : [];
  const hasNoteBody = noteParts.length > 0;
  const checkedCount = runChecks.filter((c) => c.review_id === latestReviewId).length;

  return (
    <div className="sp">
      <div className="crumbs">
        <Link href="/">← หุ้นทั้งหมด</Link>
      </div>

      {/* ================= hero ================= */}
      <section className={`sp-hero ps-${plan}`} aria-label={`สรุปสถานะ ${stock.ticker}`}>
        <div className="sp-head">
          <div className="sp-id">
            <h1 className="sp-ticker">{stock.ticker}</h1>
            <p className="sp-name">
              {stock.name}
              {stock.exchange && ` · ${stock.exchange}`}
              {stock.sector && ` · ${stock.sector}`}
            </p>
          </div>
          {/* ดาวอยู่ขวาบนที่เดียว (เหมือนการ์ด /watchlist) */}
          {email && watchlistAvailable && <WatchButton ticker={stock.ticker} watching={watching} />}
        </div>

        {price != null && (
          <div className="sp-pricerow">
            <span className="sp-price">
              {price.toLocaleString("en-US", { maximumFractionDigits: 2 })}
              <span className="sp-cur"> {stock.currency}</span>
            </span>
            {move != null && (
              <span className={`wc-move ${move >= 0 ? "up" : "dn"}`} title={moveTitle}>
                {move > 0 ? "▲" : move < 0 ? "▼" : ""} {Math.abs(move).toFixed(1)}%
                <span className="sp-sr"> {moveTitle}</span>
              </span>
            )}
            {priceLabel && <span className={`wc-asof${priceLabel.live ? " live" : ""}`}>{priceLabel.text}</span>}
          </div>
        )}

        <div className="sp-statusrow">
          <span className="wc-status" title={PLAN_STATUS_LABEL[plan] ?? undefined}>
            <i className="wc-dot" aria-hidden="true" />
            {PLAN_SHORT[plan] ?? plan}
          </span>
          {a && <VerdictBadge verdict={a.verdict} />}
        </div>

        {showZone && <PlanZone tranches={tranches} info={zone} price={price} live={!!quote} />}

        {latestReview?.action_md && (
          <div className="wc-quote sp-quote">
            <span className="wc-k">รอบทบทวน {latestReview.review_date} บอกว่า</span>
            <p className="wc-action">{latestReview.action_md}</p>
          </div>
        )}

        {(a?.fundamentals_score != null || a?.momentum_score != null || a?.risk_level || targetBand) && (
          <dl className="sp-keys">
            {a?.fundamentals_score != null && (
              <div className="sp-key">
                <dt>พื้นฐาน</dt>
                <dd>{a.fundamentals_score}/10</dd>
              </div>
            )}
            {a?.momentum_score != null && (
              <div className="sp-key">
                <dt>Momentum</dt>
                <dd>{a.momentum_score}/10</dd>
              </div>
            )}
            {a?.risk_level && (
              <div className="sp-key">
                <dt>ความเสี่ยง</dt>
                <dd>{a.risk_level}</dd>
              </div>
            )}
            {targetBand &&
              (["bear", "base", "bull"] as const).map((k) =>
                targetBand[k] ? (
                  <div key={k} className={`sp-key sp-t-${k}`}>
                    <dt>เป้า{k === "bear" ? "แย่สุด" : k === "base" ? "กรณีฐาน" : "ดีสุด"}</dt>
                    <dd>{targetBand[k]}</dd>
                  </div>
                ) : null
              )}
          </dl>
        )}

        {bundle?.run && (
          <p className="sp-foot">
            รายงานฉบับวันที่ {bundle.run.run_date}
            {runPrice != null && (
              <>
                {" "}
                เขียนตอนราคา {runPrice.toLocaleString()} {stock.currency} — ตัวเลขและช่วงราคาทั้งหมดในรายงานอ้างอิงราคานั้น
              </>
            )}
            {targetBand && <> · เป้าราคาเป็นช่วงจากทฤษฎีทั้ง {bundle.theories.length} ข้อ</>}
          </p>
        )}
      </section>

      {runs.length === 0 && (
        <div className="empty-state">ยังไม่มีรอบ research สำหรับหุ้นตัวนี้</div>
      )}

      {/* ================= รายงานฉบับเต็ม (พับไว้) ================= */}
      {bundle?.run && (
        <StockSections>
          <Section id="summary" title={`📋 สรุปภาพรวม — รอบวันที่ ${bundle.run.run_date}`} meta="สรุปรายงาน + ตัวเลขสำคัญ ณ วันทำรายงาน">
            <div className="card">
              <Markdown text={bundle.run.summary_md} />
            </div>
            {details && <NoteRail details={details} />}
          </Section>

          {latestReview && (
            <Section
              id="review"
              title="🔁 ทบทวนล่าสุด"
              meta={
                <>
                  {latestReview.review_date} · {STANCE_LABEL[latestReview.stance] ?? latestReview.stance} · ตรวจมาแล้ว{" "}
                  {reviews.length} ครั้ง
                </>
              }
            >
              <div className="card review-note">
                <div className="rv-head">
                  <span className={`badge rv-${latestReview.stance}`}>
                    {STANCE_LABEL[latestReview.stance] ?? latestReview.stance}
                  </span>
                  <CheckTally checks={runChecks.filter((c) => c.review_id === latestReview.id)} />
                  {latestReview.price_move_pct != null && (
                    <span className={`rv-move ${latestReview.price_move_pct >= 0 ? "up" : "down"}`}>
                      ราคา {latestReview.price_move_pct > 0 ? "+" : ""}
                      {latestReview.price_move_pct.toFixed(1)}% จากวันที่ทำรายงานนี้ (ณ วันทบทวน)
                    </span>
                  )}
                </div>
                {latestReview.plan_status && PLAN_STATUS_LABEL[latestReview.plan_status] && (
                  <p className="sp-plan-full">
                    สถานะแผน: <strong>{PLAN_STATUS_LABEL[latestReview.plan_status]}</strong>
                  </p>
                )}
                <p className="rv-what">
                  รอบทบทวน = ทุกสัปดาห์เราเอา<strong>รายงานฉบับเดิม</strong>มาตรวจกับข่าวและราคาใหม่
                  ว่าสิ่งที่เคยเขียนไว้ยังจริงอยู่ไหม — ไม่ใช่รายงานฉบับใหม่ ตัวรายงานยังเป็นของวันที่{" "}
                  {bundle.run.run_date} เหมือนเดิม
                </p>
                <Markdown text={latestReview.review_md} />
                {latestReview.stance === "escalate" && latestReview.escalate_reason && (
                  <p className="rv-escalate">
                    <strong>เหตุผลที่ต้องทบทวนใหญ่:</strong> {latestReview.escalate_reason}
                    {latestReview.resulting_run_id && (
                      <>
                        {" — "}
                        <Link href={`/stock/${ticker}?run=${latestReview.resulting_run_id}`}>
                          ดูรอบที่ทบทวนใหม่ →
                        </Link>
                      </>
                    )}
                  </p>
                )}
                {(latestReview.alternatives_md || latestReview.data_quality_md) && (
                  <div className="rv-action-more">
                    {latestReview.alternatives_md && (
                      <details className="rv-action-detail">
                        <summary>ทางเลือกที่พิจารณาแล้วไม่เลือก</summary>
                        <Markdown text={latestReview.alternatives_md} />
                      </details>
                    )}
                    {latestReview.data_quality_md && (
                      <details className="rv-action-detail">
                        <summary>ข้อมูลที่ยังสงสัยในรอบนี้</summary>
                        <Markdown text={latestReview.data_quality_md} />
                      </details>
                    )}
                  </div>
                )}
                {reviews.length > 0 && (
                  <div className="rv-hist">
                    <span className="rv-hist-lead">
                      ตรวจมาแล้ว {reviews.length} ครั้ง ตั้งแต่ทำรายงานฉบับนี้
                    </span>
                    <ul>
                      {reviews.map((v) => (
                        <li key={v.id}>
                          <span className="rvh-date">{v.review_date}</span>
                          <span className={`badge rv-${v.stance}`}>
                            {v.stance === "same"
                              ? "ยังมองเหมือนเดิม"
                              : v.stance === "shifted"
                                ? "น้ำหนักเปลี่ยน"
                                : "ต้องวิเคราะห์ใหม่"}
                          </span>
                          {v.action_md && <span className="rvh-note">{v.action_md.split(" — ")[0]}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Section>
          )}

          {entryPlan?.tranches && entryPlan.tranches.length > 0 && (
            <Section
              id="entry-plan"
              title="🎯 ราคาที่น่าสะสม — แบ่งไม้ 1/2/3"
              meta={`${entryPlan.tranches.length} ไม้ · ช่วงราคา เงื่อนไข และกรณีที่แผนใช้ไม่ได้`}
            >
              <div className="card">
                {entryPlan.stance_md && <Markdown text={entryPlan.stance_md} />}
                <div className="tranches">
                  {entryPlan.tranches.map((t) => (
                    <div key={t.level} className={`tranche t${t.level}`}>
                      <div className="tr-head">
                        <span className="tr-name">ไม้ {t.level}</span>
                        {t.allocation && <span className="tr-alloc">{t.allocation}</span>}
                      </div>
                      <div className="tr-price">{t.price_range}</div>
                      {t.rationale && (
                        <div className="tr-note">
                          <InlineMarkdown text={t.rationale} />
                        </div>
                      )}
                      {t.trigger && (
                        <div className="tr-trigger">
                          <b>เงื่อนไข:</b> <InlineMarkdown text={t.trigger} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {entryPlan.invalidation_md && (
                  <div className="note" style={{ marginBottom: 0 }}>
                    <Markdown text={entryPlan.invalidation_md} />
                  </div>
                )}
              </div>
            </Section>
          )}

          {a && (
            <Section
              id="analysis"
              title="📊 บทวิเคราะห์เต็ม"
              meta={keyPoints && keyPoints.length > 0 ? `ประเด็นสำคัญ ${keyPoints.length} ข้อ + บทวิเคราะห์` : "บทวิเคราะห์"}
            >
              <div className="card">
                {/* มุมมอง/คะแนน/ความเสี่ยงอยู่บน hero แล้ว — ไม่ซ้ำที่นี่ */}
                {keyPoints && keyPoints.length > 0 && (
                  <ul className="pill-list">
                    {keyPoints.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                )}
                {keyPoints && keyPoints.length > 0 && (
                  <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "14px 0" }} />
                )}
                <Markdown text={a.content_md} />
              </div>
            </Section>
          )}

          {details && hasNoteBody && (
            <Section
              id="company"
              title="🏭 ข้อมูลบริษัทและงบการเงิน"
              meta={noteParts.map((p) => p.label).join(" · ")}
            >
              <ResearchNote details={details} showRail={false} />
            </Section>
          )}

          {bundle.theories.length > 0 && (
            <Section
              id="theories"
              title="🔮 ทฤษฎีและข้อสมมุติ"
              meta={
                <>
                  {bundle.theories.length} ทฤษฎี · scenario bull/base/bear
                  {checkedCount > 0 && <> · รอบทบทวนล่าสุดตรวจแล้ว {checkedCount} ข้อ</>}
                </>
              }
            >
              {runChecks.length > 0 && (
                <>
                  <p className="subtitle" style={{ marginBottom: 10 }}>
                    ข้อที่ถูกตรวจแล้วจะเป็นกล่อง: <strong>หัวกล่อง</strong> คือข้อสมมุติจากรายงานวันที่{" "}
                    {bundle.run.run_date} (คงไว้ทุกตัวอักษร) · <strong>ซ้าย</strong> คือความเห็นของรอบทบทวนก่อน ·{" "}
                    <strong>ขวา</strong> คือความเห็นรอบล่าสุด · ข้อที่ยังไม่ถูกตรวจแสดงเป็นบรรทัดธรรมดา
                  </p>
                  <StatusLegend />
                </>
              )}
              {bundle.theories.map((t) => {
                const scenarios = parseJson<Record<string, Scenario>>(t.scenarios);
                const assumptions = parseJson<string[]>(t.assumptions);
                const catalysts = parseJson<string[]>(t.catalysts);
                const risks = parseJson<string[]>(t.risks);
                return (
                  <div key={t.id} className="card">
                    <div className="card-title-row">
                      <h3>{t.title}</h3>
                      <div className="theory-meta">
                        {t.confidence != null && <span>ความมั่นใจ {t.confidence}%</span>}
                        {t.horizon && <span>กรอบเวลา {t.horizon}</span>}
                      </div>
                    </div>
                    <Markdown text={t.thesis_md} />

                    {scenarios && bundle.run?.price_at_run != null && (
                      <ScenarioLadder
                        currentPrice={bundle.run.price_at_run}
                        currency={stock.currency}
                        bear={scenarios.bear}
                        base={scenarios.base}
                        bull={scenarios.bull}
                      />
                    )}

                    {scenarios && (
                      <div className="scenarios">
                        {(["bull", "base", "bear"] as const).map((key) => {
                          const sc = scenarios[key];
                          if (!sc) return null;
                          return (
                            <div key={key} className={`scenario ${key}`}>
                              <div className="sc-name">{key}</div>
                              {sc.target != null && (
                                <div className="sc-target">
                                  {sc.target.toLocaleString()} {stock.currency}
                                </div>
                              )}
                              {sc.probability != null && (
                                <div className="sc-prob">
                                  โอกาส {(sc.probability * 100).toFixed(0)}%
                                </div>
                              )}
                              {sc.rationale && (
                                <div className="sc-note">
                                  <InlineMarkdown text={sc.rationale} />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {assumptions && assumptions.length > 0 && (
                      <>
                        <h4 className="sp-h4">สมมุติฐาน</h4>
                        <ClaimList
                          items={assumptions}
                          checks={claimChecks}
                          prevChecks={prevClaimChecks}
                          prevDate={prevReview?.review_date}
                          className="pill-list"
                          runDate={bundle.run?.run_date}
                        />
                      </>
                    )}
                    {catalysts && catalysts.length > 0 && (
                      <>
                        <h4 className="sp-h4">ปัจจัยกระตุ้น</h4>
                        <ClaimList
                          items={catalysts}
                          checks={claimChecks}
                          prevChecks={prevClaimChecks}
                          prevDate={prevReview?.review_date}
                          className="pill-list catalysts"
                          runDate={bundle.run?.run_date}
                        />
                      </>
                    )}
                    {risks && risks.length > 0 && (
                      <>
                        <h4 className="sp-h4">ความเสี่ยง</h4>
                        <ClaimList
                          items={risks}
                          checks={claimChecks}
                          prevChecks={prevClaimChecks}
                          prevDate={prevReview?.review_date}
                          className="pill-list risks"
                          runDate={bundle.run?.run_date}
                        />
                      </>
                    )}
                  </div>
                );
              })}
            </Section>
          )}

          {bundle.items.length > 0 && (
            <Section
              id="raw"
              title="🔍 แหล่งข้อมูลที่ใช้ทำรายงาน"
              meta={`${bundle.items.length} แหล่งข่าว/เอกสาร`}
            >
              <p className="subtitle" style={{ marginBottom: 12 }}>
                {bundle.items.length} แหล่งข่าว/เอกสารที่ใช้ประกอบรายงานนี้ — คลิกหัวข้อเพื่อดูเนื้อหาเต็ม
              </p>
              {bundle.items.map((item) => (
                <details key={item.id} className="card raw-item">
                  <summary>
                    <div className="card-title-row" style={{ marginBottom: 0 }}>
                      <h3>{item.title}</h3>
                      <span className="badge cat">
                        <CategoryIcon category={item.category} />
                        {CATEGORY_LABELS[item.category] ?? item.category}
                      </span>
                    </div>
                    <div className="src">
                      {item.source && <>แหล่ง: {item.source} · </>}
                      {item.published_at && <>{item.published_at} · </>}
                      ความสำคัญ {item.importance}/5
                    </div>
                  </summary>
                  <div style={{ marginTop: 12 }}>
                    {item.url && (
                      <div className="src" style={{ marginBottom: 8 }}>
                        <a href={item.url} target="_blank" rel="noopener noreferrer">
                          ลิงก์ต้นทาง ↗
                        </a>
                      </div>
                    )}
                    <Markdown text={item.content_md} />
                  </div>
                </details>
              ))}
            </Section>
          )}
        </StockSections>
      )}
    </div>
  );
}
