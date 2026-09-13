import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getStock,
  listRuns,
  listReviews,
  listThesisChecks,
  getRunBundle,
  type RunDetails,
  type EntryPlan,
} from "@/lib/db";
import Markdown, { InlineMarkdown } from "@/components/Markdown";
import VerdictBadge from "@/components/VerdictBadge";
import ResearchNote, { noteSections } from "@/components/ResearchNote";
import TocNav from "@/components/TocNav";
import ScenarioLadder from "@/components/ScenarioLadder";
import CategoryIcon from "@/components/CategoryIcon";
import ClaimList, { CheckTally, StatusLegend, checkIndex } from "@/components/ClaimStatus";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  news: "ข่าว",
  financials: "งบการเงิน",
  filing: "เอกสารทางการ",
  industry: "อุตสาหกรรม",
  sentiment: "ความเห็นตลาด",
  other: "อื่นๆ",
};

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** พาดหัวของการ์ดทบทวน — ตอบคำถามแรกของคนอ่านว่า "แล้วต้องทำอะไรไหม" ก่อนจะลงรายละเอียด */
// คำพวกนี้ผ่านการทดสอบกับคนอ่านทั่วไปแล้ว — "จับตาไว้" ของเดิมถูกเข้าใจผิดว่าแปลว่า "หุ้นน่าสนใจ"
const PLAN_STATUS_LABEL: Record<string, string> = {
  "no-action": "ยังไม่ต้องทำอะไร",
  watch: "ยังไม่ต้องทำอะไร แต่มีเรื่องรอดู",
  "plan-live": "ราคาเข้าโซนซื้อของแผนแล้ว",
  "plan-broken": "แผนเดิมใช้ไม่ได้แล้ว",
};

interface Scenario {
  target?: number;
  probability?: number;
  rationale?: string;
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

  const [runs, reviews, checks] = await Promise.all([
    listRuns(ticker),
    listReviews(ticker),
    listThesisChecks(ticker),
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

  // index หัวข้อในหน้า — เฉพาะ section ที่มีข้อมูลจริง
  const toc: { id: string; label: string }[] = [];
  if (bundle?.run) toc.push({ id: "summary", label: "สรุปภาพรวม" });
  if (entryPlan?.tranches?.length) toc.push({ id: "entry-plan", label: "ราคาที่น่าสะสม (ไม้ 1/2/3)" });
  if (details) toc.push(...noteSections(details));
  if (bundle?.analysis) toc.push({ id: "analysis", label: "บทวิเคราะห์" });
  if (bundle?.theories?.length) toc.push({ id: "theories", label: "ทฤษฎี/สมมุติฐาน" });
  if (bundle?.items?.length) toc.push({ id: "raw", label: "ข้อมูลดิบ" });

  return (
    <>
      <div className="crumbs">
        <Link href="/">← หุ้นทั้งหมด</Link>
      </div>

      <div className="stock-head ticker-head">
        <h1>{stock.ticker}</h1>
        {latestReview?.price_at_review != null ? (
          <>
            <span className="price">
              {latestReview.price_at_review.toLocaleString()} {stock.currency}
            </span>
            <span className="price-when">ราคาล่าสุด {latestReview.review_date}</span>
          </>
        ) : (
          bundle?.run?.price_at_run != null && (
            <>
              <span className="price">
                {bundle.run.price_at_run.toLocaleString()} {stock.currency}
              </span>
              <span className="price-when">ณ วันทำรายงาน {bundle.run.run_date}</span>
            </>
          )
        )}
        {bundle?.analysis && <VerdictBadge verdict={bundle.analysis.verdict} />}
      </div>
      {latestReview?.price_at_review != null && bundle?.run?.price_at_run != null && (
        <p className="price-note">
          รายงานด้านล่างเขียนตอนราคา {bundle.run.price_at_run.toLocaleString()} {stock.currency} (
          {bundle.run.run_date}) — ตัวเลขและช่วงราคาทั้งหมดในรายงานอ้างอิงราคานั้น
        </p>
      )}
      <p className="subtitle">
        {stock.name}
        {stock.exchange && ` · ${stock.exchange}`}
        {stock.sector && ` · ${stock.sector}`}
      </p>

      {latestReview?.action_md && (
        <div className={`rv-action ps-${latestReview.plan_status ?? "no-action"}`}>
          <div className="rv-action-top">
            <span className="rv-action-label">
              {PLAN_STATUS_LABEL[latestReview.plan_status ?? ""] ?? "สรุป"}
            </span>
            <span className="rv-action-when">
              <span className="cmp-new">ใหม่</span> จากรอบทบทวน {latestReview.review_date}
              {latestReview.price_move_pct != null && (
                <>
                  {" · ราคา "}
                  {latestReview.price_move_pct > 0 ? "+" : ""}
                  {latestReview.price_move_pct.toFixed(1)}% จากวันที่ทำรายงาน
                </>
              )}
            </span>
          </div>
          <p className="rv-action-text">{latestReview.action_md}</p>
        </div>
      )}

      {runs.length === 0 && (
        <div className="empty-state">ยังไม่มีรอบ research สำหรับหุ้นตัวนี้</div>
      )}

      {toc.length > 1 && <TocNav items={toc} />}

      {bundle?.run && (
        <>
          <h2 id="summary">📋 สรุปภาพรวม — รอบวันที่ {bundle.run.run_date}</h2>
          <div className="card">
            <Markdown text={bundle.run.summary_md} />
          </div>

          {latestReview && (
            <div className="card review-note">
              <div className="rv-head">
                <span className="rv-eyebrow">
                  <span className="cmp-new">ใหม่</span> ทบทวนล่าสุด · {latestReview.review_date}
                </span>
                <span className={`badge rv-${latestReview.stance}`}>
                  {latestReview.stance === "same"
                    ? "ยังมองเหมือนเดิม"
                    : latestReview.stance === "shifted"
                      ? "น้ำหนักเปลี่ยน"
                      : "ต้องทบทวนใหญ่"}
                </span>
                <CheckTally checks={runChecks.filter((c) => c.review_id === latestReview.id)} />
                {latestReview.price_move_pct != null && (
                  <span className={`rv-move ${latestReview.price_move_pct >= 0 ? "up" : "down"}`}>
                    ราคา {latestReview.price_move_pct > 0 ? "+" : ""}
                    {latestReview.price_move_pct.toFixed(1)}% จากวันที่ทำรายงานนี้
                  </span>
                )}
              </div>
              <p className="rv-what">
                รอบทบทวน = ทุกสัปดาห์เราเอา<strong>รายงานฉบับเดิม</strong>มาตรวจกับข่าวและราคาใหม่
                ว่าสิ่งที่เคยเขียนไว้ยังจริงอยู่ไหม — ไม่ใช่รายงานฉบับใหม่ ตัวรายงานด้านล่างยังเป็นของวันที่{" "}
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
          )}

          {targetBand && (
            <div className="target-band">
              <span className="tb-lead">ราคาเป้าหมายจากทฤษฎีทั้ง {bundle.theories.length} ข้อ</span>
              <div className="tb-items">
                {(["bear", "base", "bull"] as const).map((k) =>
                  targetBand[k] ? (
                    <span key={k} className={`tb-item tb-${k}`}>
                      <span className="tb-k">
                        {k === "bear" ? "แย่สุด" : k === "base" ? "กรณีฐาน" : "ดีสุด"}
                      </span>
                      {targetBand[k]} {stock.currency}
                    </span>
                  ) : null
                )}
              </div>
            </div>
          )}

          {entryPlan?.tranches && entryPlan.tranches.length > 0 && (
            <>
              <h2 id="entry-plan">🎯 ราคาที่น่าสะสม — แบ่งไม้ 1/2/3</h2>
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
            </>
          )}

          {details && <ResearchNote details={details} />}

          {bundle.analysis && (
            <>
              <h2 id="analysis">📊 บทวิเคราะห์เต็ม</h2>
              <div className="card">
                <div className="score-row">
                  <div className="score-tile">
                    <div className="label">มุมมอง</div>
                    <div className="value">
                      <VerdictBadge verdict={bundle.analysis.verdict} />
                    </div>
                  </div>
                  {bundle.analysis.fundamentals_score != null && (
                    <div className="score-tile">
                      <div className="label">พื้นฐาน</div>
                      <div className="value">{bundle.analysis.fundamentals_score}/10</div>
                    </div>
                  )}
                  {bundle.analysis.momentum_score != null && (
                    <div className="score-tile">
                      <div className="label">Momentum</div>
                      <div className="value">{bundle.analysis.momentum_score}/10</div>
                    </div>
                  )}
                  {bundle.analysis.risk_level && (
                    <div className="score-tile">
                      <div className="label">ความเสี่ยง</div>
                      <div className="value">{bundle.analysis.risk_level}</div>
                    </div>
                  )}
                </div>

                {keyPoints && keyPoints.length > 0 && (
                  <ul className="pill-list">
                    {keyPoints.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                )}

                <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "14px 0" }} />
                <Markdown text={bundle.analysis.content_md} />
              </div>
            </>
          )}

          {bundle.theories.length > 0 && (
            <>
              <h2 id="theories">🔮 ทฤษฎีและข้อสมมุติ</h2>
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
                        <h4 style={{ margin: "14px 0 0", fontSize: 14 }}>สมมุติฐาน</h4>
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
                        <h4 style={{ margin: "14px 0 0", fontSize: 14 }}>ปัจจัยกระตุ้น</h4>
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
                        <h4 style={{ margin: "14px 0 0", fontSize: 14 }}>ความเสี่ยง</h4>
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
            </>
          )}

          {bundle.items.length > 0 && (
            <>
              <h2 id="raw">🔍 แหล่งข้อมูลที่ใช้ทำรายงาน</h2>
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
            </>
          )}
        </>
      )}
    </>
  );
}
