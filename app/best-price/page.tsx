import Link from "next/link";
import type { Metadata } from "next";
import { listLatestSnapshots } from "@/lib/db";
import { getQuotes } from "@/lib/quote";
import { rankByPrice, STALE_MOVE_THRESHOLD, WEIGHTS, type PriceRank } from "@/lib/ranking";
import VerdictBadge from "@/components/VerdictBadge";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ราคาน่าสนใจที่สุดตอนนี้ | Tee Stock Research",
  description:
    "จัดอันดับหุ้นที่ราคาปัจจุบันน่าสนใจที่สุด จากรายงาน research → analyze → theorize ในระบบ",
};

const RISK_LABEL: Record<string, string> = {
  low: "เสี่ยงต่ำ",
  medium: "เสี่ยงปานกลาง",
  high: "เสี่ยงสูง",
};
const RISK_CLASS: Record<string, string> = {
  low: "risk-low",
  medium: "risk-mid",
  high: "risk-high",
};

const ENTRY_LABEL: Record<string, string> = {
  below: "ต่ำกว่าโซนไม้แรก",
  in: "อยู่ในโซนไม้แรก",
  above: "ยังสูงกว่าโซนไม้แรก",
};

const num = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 0 : 2 });
const money = (n: number, cur: string) => `${num(n)} ${cur}`;
const pct = (n: number, digits = 1) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(digits)}%`;
const toneClass = (n: number) => (n > 0 ? "up" : n < 0 ? "dn" : "");

/** เวลาราคาสด แสดงเป็นเวลาไทย */
const asOfText = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("th-TH", {
        timeZone: "Asia/Bangkok",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

/** แถบระยะทางจากราคาอ้างอิงไป bear / base / bull */
function RangeBar({ r }: { r: PriceRank }) {
  const lo = Math.min(r.bearTarget, r.price);
  const hi = Math.max(r.bullTarget, r.price);
  const at = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;
  return (
    <div className="rangebar">
      <div className="rb-track">
        <div
          className="rb-span"
          style={{ left: `${at(r.baseTarget)}%`, right: `${100 - at(r.bullTarget)}%` }}
        />
        <div className="rb-mark price" style={{ left: `${at(r.price)}%` }} />
        <div className="rb-mark base" style={{ left: `${at(r.baseTarget)}%` }} />
      </div>
      <div className="rb-legend">
        <span className="dn">
          bear {num(r.bearTarget)} ({pct(r.bearPct, 0)})
        </span>
        <span>
          base {num(r.baseTarget)} ({pct(r.basePct, 0)})
        </span>
        <span className="up">
          bull {num(r.bullTarget)} ({pct(r.bullPct, 0)})
        </span>
      </div>
      <div className="rb-note">
        <span className="rb-key price" /> {r.priceSource === "live" ? "ราคาตลาด" : "ราคา ณ วัน run"} {num(r.price)}
        <span className="rb-key base" /> base case
        <span className="rb-key span" /> ช่วง base → bull
      </div>
    </div>
  );
}

function RankCard({ r, rank }: { r: PriceRank; rank: number }) {
  return (
    <article className="card rank-card">
      <div className="rank-head">
        <div className="rank-no">{rank}</div>
        <div className="rank-id">
          <h3>
            <Link href={`/stock/${r.ticker}`}>{r.ticker}</Link>
            <span className="rank-name">{r.name}</span>
          </h3>
          <div className="rank-badges">
            <VerdictBadge verdict={r.verdict} />
            {r.riskLevel && (
              <span className={`badge ${RISK_CLASS[r.riskLevel] ?? "neutral"}`}>
                {RISK_LABEL[r.riskLevel] ?? r.riskLevel}
              </span>
            )}
            {r.stale && <span className="badge risk-high">บทวิเคราะห์เริ่มเก่า</span>}
            <span className="rank-sector">{r.sector ?? "ไม่ระบุกลุ่ม"}</span>
          </div>
        </div>
        <div className="rank-score">
          <div className="rank-score-v">{r.score.toFixed(1)}</div>
          <div className="rank-score-l">คะแนนราคา / 100</div>
        </div>
      </div>

      <div className="rail rank-rail">
        <div className="stat">
          <span className="stat-k">
            {r.priceSource === "live" ? "ราคาตลาด" : "ราคา ณ วัน run"}
          </span>
          <span className="stat-v">
            {money(r.price, r.currency)}
            {r.dayChangePct != null && (
              <small className={`stat-chg ${toneClass(r.dayChangePct)}`}>
                {pct(r.dayChangePct, 2)}
              </small>
            )}
          </span>
          <span className="stat-n">
            {r.priceSource === "live" ? (
              <>
                {asOfText(r.priceAsOf) ?? "ราคาสด"} · จากวัน run{" "}
                <span className={toneClass(r.moveSinceRunPct ?? 0)}>
                  {pct(r.moveSinceRunPct ?? 0, 1)}
                </span>
              </>
            ) : (
              <>ดึงราคาสดไม่ได้ · ใช้ราคา {r.runDate}</>
            )}
          </span>
        </div>
        <div className="stat">
          <span className="stat-k">เป้าถ่วงน้ำหนัก</span>
          <span className={`stat-v ${toneClass(r.upsidePct)}`}>{pct(r.upsidePct)}</span>
          <span className="stat-n">
            {money(r.evTarget, r.currency)} · {r.theoryCount} ทฤษฎี
          </span>
        </div>
        <div className="stat">
          <span className="stat-k">reward / risk</span>
          <span className="stat-v">{r.rewardRisk.toFixed(2)}x</span>
          <span className="stat-n">
            bull {pct(r.bullPct, 0)} เทียบ bear {pct(r.bearPct, 0)}
          </span>
        </div>
        <div className="stat">
          <span className="stat-k">พื้นฐาน / momentum</span>
          <span className="stat-v">
            {r.fundamentals ?? "–"} / {r.momentum ?? "–"}
          </span>
          <span className="stat-n">จากทีม analyze (เต็ม 10)</span>
        </div>
        <div className="stat">
          <span className="stat-k">โซนเข้าไม้แรก</span>
          <span className="stat-v">{r.entry ? r.entry.range : "–"}</span>
          <span className={`stat-n ${r.entry?.state === "above" ? "dn" : "up"}`}>
            {r.entry ? ENTRY_LABEL[r.entry.state] : "ไม่มี entry plan"}
          </span>
        </div>
      </div>

      <RangeBar r={r} />

      {r.topTheory && (
        <p className="rank-theory">
          ทฤษฎีหลักของ theorie team: <b>{r.topTheory}</b> —{" "}
          <Link href={`/stock/${r.ticker}`}>อ่านรายงานเต็ม →</Link>
        </p>
      )}
    </article>
  );
}

export default async function BestPricePage() {
  const snapshots = await listLatestSnapshots();
  const quotes = await getQuotes(snapshots.map((s) => s.stock.ticker));
  const ranked = rankByPrice(snapshots, quotes);
  const top5 = ranked.slice(0, 5);
  const rest = ranked.slice(5);

  const liveCount = ranked.filter((r) => r.priceSource === "live").length;
  const staleCount = ranked.filter((r) => r.stale).length;
  const latestQuoteAt = ranked
    .map((r) => r.priceAsOf)
    .filter((x): x is string => !!x)
    .sort()
    .pop();

  return (
    <>
      <h1>5 หุ้นที่ราคาน่าสนใจที่สุดตอนนี้</h1>
      <p className="subtitle">
        เทียบ<b>ราคาตลาดล่าสุด</b>กับเป้าหมาย bull/base/bear ที่ theorie team ตั้งไว้
        ผสมคะแนนพื้นฐาน ความเสี่ยง และโซนเข้าไม้แรกจาก entry plan — อันดับคำนวณใหม่ทุกครั้งที่เปิดหน้า
      </p>

      {ranked.length === 0 ? (
        <div className="empty-state">
          ยังจัดอันดับไม่ได้ — ต้องมีหุ้นที่ run เสร็จแล้วอย่างน้อย 1 ตัว (มีทั้งราคาและ scenario
          เป้าหมาย) สั่งด้วย <code>/research-stock &lt;TICKER&gt;</code>
        </div>
      ) : (
        <>
          <div className="note">
            <b>ราคาสด {liveCount}/{ranked.length} ตัว</b>
            {latestQuoteAt && <> · ล่าสุด {asOfText(latestQuoteAt)}</>} — ดึงจาก Yahoo Finance
            (cache ฝั่ง server 2 นาที) ตัวที่ดึงไม่ได้จะ fallback ไปใช้{" "}
            <code>price_at_run</code> และเขียนกำกับไว้ในการ์ด
            <br />
            <b>สดแค่ราคา</b> — เป้า bull/base/bear, คะแนนพื้นฐาน/momentum, risk_level และ verdict
            ยังเป็นค่า ณ วันที่รัน pipeline เปลี่ยนได้ต่อเมื่อรัน <code>/research-stock</code> ใหม่
          </div>

          {staleCount > 0 && (
            <div className="note warn">
              <b>{staleCount} ตัวราคาขยับจากวัน run เกิน {(STALE_MOVE_THRESHOLD * 100).toFixed(0)}%</b>{" "}
              — ติดป้าย &ldquo;บทวิเคราะห์เริ่มเก่า&rdquo; ไว้ ส่วนต่างถึงเป้าที่ดูดีของตัวพวกนี้
              อาจมาจากเป้าที่ยังไม่ถูกปรับ ไม่ใช่เพราะราคาถูกจริง ควรรัน research ใหม่ก่อน
            </div>
          )}

          <h2 className="sector-heading">อันดับ 1–{top5.length}</h2>
          {top5.map((r, i) => (
            <RankCard key={r.ticker} r={r} rank={i + 1} />
          ))}

          {rest.length > 0 && (
            <>
              <h2 className="sector-heading">
                อันดับที่เหลือ <span className="sector-count">({rest.length} ตัว)</span>
              </h2>
              <div className="tbl-scroll">
                <table className="fin-tbl">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>หุ้น</th>
                      <th>คะแนน</th>
                      <th>ราคาตลาด</th>
                      <th>จากวัน run</th>
                      <th>เป้าถ่วงน้ำหนัก</th>
                      <th>R/R</th>
                      <th>พื้นฐาน</th>
                      <th>ความเสี่ยง</th>
                      <th>โซนไม้แรก</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rest.map((r, i) => (
                      <tr key={r.ticker}>
                        <th>{i + 6}</th>
                        <td style={{ textAlign: "left" }}>
                          <Link href={`/stock/${r.ticker}`}>{r.ticker}</Link>
                          {r.stale && (
                            <span className="dn" title="ราคาขยับจากวัน run มาก — บทวิเคราะห์เริ่มเก่า">
                              {" "}
                              ⚠
                            </span>
                          )}
                        </td>
                        <td className="col-now">{r.score.toFixed(1)}</td>
                        <td>
                          {num(r.price)}
                          {r.priceSource === "run" && <span className="stat-n"> (วัน run)</span>}
                        </td>
                        <td className={r.moveSinceRunPct == null ? "" : toneClass(r.moveSinceRunPct)}>
                          {r.moveSinceRunPct == null ? "–" : pct(r.moveSinceRunPct)}
                        </td>
                        <td className={toneClass(r.upsidePct)}>{pct(r.upsidePct)}</td>
                        <td>{r.rewardRisk.toFixed(2)}x</td>
                        <td>{r.fundamentals ?? "–"}/10</td>
                        <td>{r.riskLevel ? RISK_LABEL[r.riskLevel] ?? r.riskLevel : "–"}</td>
                        <td className={r.entry?.state === "above" ? "dn" : "up"}>
                          {r.entry ? ENTRY_LABEL[r.entry.state] : "–"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <h2 className="sector-heading">คะแนนคิดจากอะไร</h2>
          <div className="panel">
            <div className="kv">
              {WEIGHTS.map((w) => (
                <div key={w.key}>
                  <span className="k">
                    <b style={{ color: "var(--text)" }}>{w.label}</b>
                    <br />
                    <span style={{ fontSize: 12.5 }}>{w.how}</span>
                  </span>
                  <span className="v">{(w.weight * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
            <p className="rank-theory" style={{ marginBottom: 0 }}>
              เป้าหมายและคะแนนทั้งหมดมาจากรายงานที่ทีม analyze/theorie เขียนไว้ใน DB
              หน้านี้เอามาคิดกับราคาตลาดล่าสุดเท่านั้น ไม่ได้ประเมินมูลค่าใหม่ —
              และ &ldquo;ส่วนต่างถึงเป้า&rdquo; ถูก cap ที่ +20% ในการให้คะแนน
              หุ้นที่ราคาร่วงแรงจึงดันคะแนนตัวเองขึ้นไปไม่สุดทาง &ldquo;ราคาดี&rdquo;
              ที่นี่หมายถึงส่วนต่างถึงเป้ากับความคุ้มของ reward/risk ไม่ได้แปลว่าควรซื้อ
            </p>
          </div>
        </>
      )}
    </>
  );
}
