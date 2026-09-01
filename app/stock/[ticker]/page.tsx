import Link from "next/link";
import { notFound } from "next/navigation";
import { getStock, listRuns, getRunBundle, type RunDetails, type EntryPlan } from "@/lib/db";
import Markdown from "@/components/Markdown";
import VerdictBadge from "@/components/VerdictBadge";
import ResearchNote, { noteSections } from "@/components/ResearchNote";

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

  const runs = await listRuns(ticker);
  const selectedRunId =
    runParam && runs.some((r) => r.id === Number(runParam))
      ? Number(runParam)
      : runs[0]?.id;

  const bundle = selectedRunId ? await getRunBundle(selectedRunId) : null;
  const keyPoints = parseJson<string[]>(bundle?.analysis?.key_points ?? null);
  const details = parseJson<RunDetails>(bundle?.run?.details_json ?? null);
  const entryPlan = parseJson<EntryPlan>(bundle?.run?.entry_plan_json ?? null);

  // index หัวข้อในหน้า — เฉพาะ section ที่มีข้อมูลจริง
  const toc: { id: string; label: string }[] = [];
  if (bundle?.run) toc.push({ id: "summary", label: "สรุปภาพรวม" });
  if (details) toc.push(...noteSections(details));
  if (entryPlan?.tranches?.length) toc.push({ id: "entry-plan", label: "จุดเข้าสะสม (ไม้ 1/2/3)" });
  if (bundle?.analysis) toc.push({ id: "analysis", label: "บทวิเคราะห์" });
  if (bundle?.theories?.length) toc.push({ id: "theories", label: "ทฤษฎี/สมมุติฐาน" });
  if (bundle?.items?.length) toc.push({ id: "raw", label: "ข้อมูลดิบ" });

  return (
    <>
      <div className="crumbs">
        <Link href="/">← หุ้นทั้งหมด</Link>
      </div>

      <div className="stock-head">
        <h1>{stock.ticker}</h1>
        {bundle?.run?.price_at_run != null && (
          <span className="price">
            {bundle.run.price_at_run.toLocaleString()} {stock.currency}
          </span>
        )}
        {bundle?.analysis && <VerdictBadge verdict={bundle.analysis.verdict} />}
      </div>
      <p className="subtitle">
        {stock.name}
        {stock.exchange && ` · ${stock.exchange}`}
        {stock.sector && ` · ${stock.sector}`}
      </p>

      {runs.length === 0 && (
        <div className="empty-state">ยังไม่มีรอบ research สำหรับหุ้นตัวนี้</div>
      )}

      {runs.length > 1 && (
        <div className="run-picker">
          {runs.map((r) => (
            <Link
              key={r.id}
              href={`/stock/${ticker}?run=${r.id}`}
              className={r.id === selectedRunId ? "active" : ""}
            >
              {r.run_date} (#{r.id})
            </Link>
          ))}
        </div>
      )}

      {toc.length > 1 && (
        <nav className="toc" aria-label="หัวข้อในหน้า">
          {toc.map((t) => (
            <a key={t.id} href={`#${t.id}`}>
              {t.label}
            </a>
          ))}
        </nav>
      )}

      {bundle?.run && (
        <>
          <h2 id="summary">📋 สรุปภาพรวม — รอบวันที่ {bundle.run.run_date}</h2>
          <div className="card">
            <Markdown text={bundle.run.summary_md} />
          </div>

          {details && <ResearchNote details={details} />}

          {entryPlan?.tranches && entryPlan.tranches.length > 0 && (
            <>
              <h2 id="entry-plan">🎯 มุมมองจุดเข้าสะสม — แบ่งไม้ (theorie team)</h2>
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
                      {t.rationale && <div className="tr-note">{t.rationale}</div>}
                      {t.trigger && (
                        <div className="tr-trigger">
                          <b>เงื่อนไข:</b> {t.trigger}
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

          {bundle.analysis && (
            <>
              <h2 id="analysis">📊 บทวิเคราะห์ (analyze team)</h2>
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
              <h2 id="theories">🔮 ทฤษฎีและสมมุติฐาน (theorie team)</h2>
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
                              {sc.rationale && <div className="sc-note">{sc.rationale}</div>}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {assumptions && assumptions.length > 0 && (
                      <>
                        <h4 style={{ margin: "14px 0 0", fontSize: 14 }}>สมมุติฐาน</h4>
                        <ul className="pill-list">
                          {assumptions.map((a, i) => (
                            <li key={i}>{a}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {catalysts && catalysts.length > 0 && (
                      <>
                        <h4 style={{ margin: "14px 0 0", fontSize: 14 }}>ปัจจัยกระตุ้น</h4>
                        <ul className="pill-list catalysts">
                          {catalysts.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {risks && risks.length > 0 && (
                      <>
                        <h4 style={{ margin: "14px 0 0", fontSize: 14 }}>ความเสี่ยง</h4>
                        <ul className="pill-list risks">
                          {risks.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {bundle.items.length > 0 && (
            <>
              <h2 id="raw">🔍 ข้อมูลดิบจากการ research (research team)</h2>
              {bundle.items.map((item) => (
                <div key={item.id} className="card">
                  <div className="card-title-row">
                    <h3>{item.title}</h3>
                    <span className="badge cat">
                      {CATEGORY_LABELS[item.category] ?? item.category}
                    </span>
                  </div>
                  <div className="src">
                    {item.source && <>แหล่ง: {item.source} · </>}
                    {item.published_at && <>{item.published_at} · </>}
                    ความสำคัญ {item.importance}/5
                    {item.url && (
                      <>
                        {" · "}
                        <a href={item.url} target="_blank" rel="noopener noreferrer">
                          ลิงก์ต้นทาง ↗
                        </a>
                      </>
                    )}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Markdown text={item.content_md} />
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </>
  );
}
