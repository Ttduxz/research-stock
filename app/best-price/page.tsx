import Link from "next/link";
import type { Metadata } from "next";
import { listLatestSnapshots } from "@/lib/cached";
import { getQuotes } from "@/lib/quote";
import {
  rankByPrice,
  STALE_MOVE_THRESHOLD,
  WEIGHTS,
  entryLabel,
  entryTone,
  type PriceRank,
  type Technical,
  type EntryZone,
} from "@/lib/ranking";
import VerdictBadge from "@/components/VerdictBadge";
import ScenarioLadder from "@/components/ScenarioLadder";

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
// เวอร์ชันย่อสำหรับตารางอันดับที่เหลือ — หัวคอลัมน์บอกว่า "ความเสี่ยง" อยู่แล้ว ไม่ต้องพูดซ้ำคำว่า "เสี่ยง" ทุกแถว
const RISK_LABEL_SHORT: Record<string, string> = { low: "ต่ำ", medium: "กลาง", high: "สูง" };
const RISK_CLASS: Record<string, string> = {
  low: "risk-low",
  medium: "risk-mid",
  high: "risk-high",
};

/** บรรทัดขยาย stat-n ของการ์ด — ยาวกว่า entryLabel() ของตาราง เพราะการ์ดมีที่พออธิบาย
 *  ว่าราคานี้ theorist ยอมลงเงินไปแล้วกี่ % ของแผน (ไม่ใช่แค่ "อยู่ในโซนไหม") */
function entryDetail(entry: EntryZone | null): string {
  if (!entry) return "ไม่มี entry plan";
  const pct = `${Math.round(entry.cumShare * 100)}%`;
  const note = entry.allocKnown ? "" : " (แผนเก่าไม่ระบุสัดส่วน — สมมุติแบ่งเท่ากัน)";
  switch (entry.state) {
    case "above":
      return `ยังเหนือไม้ ${entry.tranche}${note}`;
    case "in":
      return `ถึงไม้ ${entry.tranche}/${entry.trancheCount} · theorist ลง ${pct} ของแผน${note}`;
    case "between":
      return `ผ่านไม้ ${entry.tranche} แล้ว · ลงไป ${pct} รอไม้ ${entry.tranche + 1} (${entry.nextRange})${note}`;
    case "below":
      return `หลุดทุกไม้ — ถูกกว่าแผนสุดขั้ว เช็คว่า thesis ยังอยู่ไหม${note}`;
  }
}

const entryValue = (entry: EntryZone | null): string => {
  if (!entry) return "–";
  if (entry.state === "between") return `ไม้ ${entry.tranche} ✓ → รอไม้ ${entry.tranche + 1}`;
  return `ไม้ ${entry.tranche} · ${entry.range}`;
};

const num = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 0 : 2 });
const money = (n: number, cur: string) => `${num(n)} ${cur}`;
const pct = (n: number, digits = 1) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(digits)}%`;
const toneClass = (n: number) => (n > 0 ? "up" : n < 0 ? "dn" : "");

const TREND_TEXT: Record<NonNullable<Technical["trend"]>, string> = {
  strong_up: "ขาขึ้นแข็งแรง",
  up: "ย่อในขาขึ้น",
  mixed: "เทรนด์ไม่ชัด",
  down: "ขาลง",
};
const ZONE_TEXT: Record<NonNullable<Technical["zone"]>, string> = {
  discount: "ล่างกรอบ",
  equilibrium: "กลางกรอบ",
  premium: "บนกรอบ",
};

/** ป้ายเดียวรวมเทรนด์ (EMA 50/100/200) + ตำแหน่งในกรอบราคา 6 เดือน — แทนตัวเลขดิบ
 *  ให้เข้าใจ "จังหวะเก็บของ" ได้ทันทีโดยไม่ต้องอ่านค่า % เอง */
function techLabel(t: Technical): string {
  if (t.trend == null && t.zone == null) return "ไม่มีข้อมูลราคาย้อนหลัง";
  if (t.zone == null) return "ประวัติราคาไม่พอ";
  if (t.trend == null) return `${ZONE_TEXT[t.zone]} · เทรนด์ยังดูไม่ได้`;
  return `${TREND_TEXT[t.trend]} · ${ZONE_TEXT[t.zone]}`;
}

/** สีตามกรอบราคาอย่างเดียว (ล่างกรอบ = โอกาสเก็บของ, บนกรอบ = ยืดแล้ว) — ไม่เอาสีเทรนด์มาซ้อนกันสองสัญญาณ */
const techTone = (t: Technical) => (t.zone === "discount" ? "up" : t.zone === "premium" ? "dn" : "");

const TREND_TEXT_SHORT: Record<NonNullable<Technical["trend"]>, string> = {
  strong_up: "ขาขึ้นแรง",
  up: "ย่อขึ้น",
  mixed: "ไม่ชัด",
  down: "ขาลง",
};
const ZONE_TEXT_SHORT: Record<NonNullable<Technical["zone"]>, string> = {
  discount: "ล่าง",
  equilibrium: "กลาง",
  premium: "บน",
};

/** เวอร์ชันย่อของ techLabel สำหรับตารางอันดับที่เหลือโดยเฉพาะ — ตารางกว้างจำกัด ห้ามล้นจนต้อง scroll */
function techLabelShort(t: Technical): string {
  if (t.trend == null && t.zone == null) return "–";
  if (t.zone == null) return "ไม่พอ";
  if (t.trend == null) return `${ZONE_TEXT_SHORT[t.zone]}·–`;
  return `${TREND_TEXT_SHORT[t.trend]}·${ZONE_TEXT_SHORT[t.zone]}`;
}

/** บรรทัดขยายสำหรับการ์ด (มีที่พอ) — ตารางไม่ใช้ตัวนี้ */
function techDetail(t: Technical): string {
  if (t.rangeLow == null || t.rangeHigh == null || t.distFromMidPct == null) return "";
  const magnitude = `${Math.abs(t.distFromMidPct * 100).toFixed(0)}%`;
  const mid = t.distFromMidPct >= 0 ? `สูงกว่าจุดกลางกรอบ ${magnitude}` : `ต่ำกว่าจุดกลางกรอบ ${magnitude}`;
  return `${mid} · กรอบ ${num(t.rangeLow)}–${num(t.rangeHigh)}`;
}

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

/** แถบระยะทางจากราคาอ้างอิงไป bear / base / bull — ใช้ ScenarioLadder ตัวเดียวกับหน้าหุ้น
 *  (เดิมมีแค่ tick ของ base+ราคาปัจจุบันบนเส้น ส่วน bear/bull มีแต่ตัวเลขในตำนานด้านล่าง
 *   ทำให้แยกไม่ออกว่า bear/bull อยู่ตรงไหนบนเส้นจริง — ตอนนี้มีจุดของทุกเป้าครบ) */
function RangeBar({ r }: { r: PriceRank }) {
  return (
    <div className="rangebar">
      <ScenarioLadder
        currentPrice={r.price}
        currency={r.currency}
        bear={{ target: r.bearTarget }}
        base={{ target: r.baseTarget }}
        bull={{ target: r.bullTarget }}
        showTrack={false}
      />
      <div className="rb-note">
        {r.priceSource === "live" ? "ราคาตลาด" : "ราคา ณ วัน run"} {num(r.price)} · เป้าเฉลี่ยถ่วงน้ำหนักจาก {r.theoryCount} ทฤษฎี
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
          <span className="stat-k">โซนเข้า · แผน {r.entry?.trancheCount ?? 0} ไม้</span>
          <span className="stat-v">{entryValue(r.entry)}</span>
          <span className={`stat-n ${entryTone(r.entry)}`}>{entryDetail(r.entry)}</span>
        </div>
        <div className="stat">
          <span className="stat-k">จังหวะเก็บของ · กรอบ 6 เดือน</span>
          <span className={`stat-v ${techTone(r.tech)}`}>{techLabel(r.tech)}</span>
          <span className="stat-n">
            {techDetail(r.tech) || (r.tech.trend == null ? "EMA200 ยังคำนวณไม่ได้ (ประวัติ < 200 วัน)" : "")}
          </span>
        </div>
      </div>

      <RangeBar r={r} />

      {r.topTheory && (
        <p className="rank-theory">
          ทฤษฎีหลัก: <b>{r.topTheory}</b> —{" "}
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
        เทียบ<b>ราคาตลาดล่าสุด</b>กับเป้าหมายดีสุด/กรณีฐาน/แย่สุดที่ตั้งไว้ในรายงาน
        ผสมคะแนนพื้นฐาน ความเสี่ยง และบันไดไม้จาก entry plan — อันดับคำนวณใหม่ทุกครั้งที่เปิดหน้า
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
            <br />
            <b>จังหวะเก็บของ</b> คำนวณจาก EMA 50/100/200 และกรอบสูง-ต่ำ 6 เดือน จากราคาปิดรายวันของ
            Yahoo ตัวที่ประวัติไม่พอได้คะแนนกลางๆ — <b>บันไดไม้</b> ตอบว่า &ldquo;ราคาไหนคุ้มตามแผนของหุ้นตัวนี้&rdquo;
            (คิดตามสัดส่วนเงินที่ theorist วางแผนลงจริง ไม้แรกที่แบ่งเงินไว้น้อยจึงไม่นับว่าราคาคุ้มเต็มที่)
            ส่วน <b>จังหวะเก็บของ</b> ตอบว่า &ldquo;ตอนนี้ราคาอยู่ส่วนไหนของการแกว่ง 6 เดือน&rdquo; ตรงกันสองอย่าง
            (ถึงไม้ที่ลงเงินเยอะ + ล่างกรอบ) = จังหวะชัด ขัดกันให้ยึดแผนไม้เป็นหลัก
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
                <table className="fin-tbl rank-tbl">
                  {/* กำหนด % ตายตัวเอง — ปล่อยให้ table-layout:fixed หารเท่ากันจะบีบ 2 คอลัมน์ท้าย
                      (เนื้อหายาวสุด) จนตัดคำภาษาไทยแหว่งเกินจำเป็น */}
                  <colgroup>
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "7%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "7%" }} />
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "7%" }} />
                    <col style={{ width: "17%" }} />
                    <col style={{ width: "22%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>หุ้น</th>
                      <th>คะแนน</th>
                      <th>ราคา</th>
                      <th>เป้า</th>
                      <th>R/R</th>
                      <th>พื้นฐาน</th>
                      <th>เสี่ยง</th>
                      <th>ไม้/แผน</th>
                      <th>จังหวะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rest.map((r, i) => (
                      <tr key={r.ticker}>
                        <td style={{ textAlign: "left" }}>
                          <span className="rank-tbl-no">{i + 6}</span>
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
                          <br />
                          <span
                            className={`stat-n ${r.moveSinceRunPct == null ? "" : toneClass(r.moveSinceRunPct)}`}
                            title="เทียบราคา ณ วัน run"
                          >
                            {r.moveSinceRunPct == null ? "(วัน run)" : pct(r.moveSinceRunPct)}
                          </span>
                        </td>
                        <td className={toneClass(r.upsidePct)}>{pct(r.upsidePct, 0)}</td>
                        <td>{r.rewardRisk.toFixed(1)}x</td>
                        <td>{r.fundamentals ?? "–"}/10</td>
                        <td>{r.riskLevel ? RISK_LABEL_SHORT[r.riskLevel] ?? r.riskLevel : "–"}</td>
                        <td className={entryTone(r.entry)}>{entryLabel(r.entry)}</td>
                        <td className={techTone(r.tech)}>{techLabelShort(r.tech)}</td>
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
