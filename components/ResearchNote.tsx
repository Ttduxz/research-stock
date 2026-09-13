import type { RunDetails, FinRow } from "@/lib/db";
import Markdown from "./Markdown";
import FinChart from "./FinChart";

/** สีตามทิศทางตัวเลข: +x → เขียว, −x/-x หรือ (x) → แดง */
function toneOf(v: string | number): string {
  const s = String(v).trim();
  if (s.startsWith("+")) return "up";
  if (s.startsWith("-") || s.startsWith("−") || s.startsWith("(")) return "dn";
  return "";
}

function FinTableView({
  caption,
  head,
  rows,
}: {
  caption?: string;
  head: (string | number)[];
  rows: FinRow[];
}) {
  return (
    <div className="tbl-scroll">
      <table className="fin-tbl">
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            <th>รายการ</th>
            {head.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`${r.strong ? "strong" : ""} ${r.band ? "band" : ""}`}>
              <th>{r.label}</th>
              {r.values.map((v, j) => (
                <td
                  key={j}
                  className={`${j === r.values.length - 1 ? "col-now" : ""} ${toneOf(v)}`}
                >
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KvPanel({ title, kv }: { title: string; kv: { k: string; v: string }[] }) {
  return (
    <div className="panel">
      <h3>{title}</h3>
      <div className="kv">
        {kv.map((item, i) => (
          <div key={i}>
            <span className="k">{item.k}</span>
            <span className="v">{item.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** รายการ section ของ research note ที่จะแสดงจริง (ใช้สร้าง index บนหน้า) */
export function noteSections(d: RunDetails): { id: string; label: string }[] {
  const s: { id: string; label: string }[] = [];
  if (d.business_md || d.segments) s.push({ id: "business", label: "ทำธุรกิจอะไร" });
  if (d.pl_history) s.push({ id: "pl", label: "งบการเงิน 5 ปี" });
  if (d.balance_history || d.cashflow_kv) s.push({ id: "balance", label: "งบดุล/กระแสเงินสด" });
  if (d.latest_quarter_md || d.guidance || d.valuation_md)
    s.push({ id: "current", label: "สถานะปัจจุบัน" });
  if (d.drivers || d.risks) s.push({ id: "drivers", label: "ตัวหนุน/ความเสี่ยง" });
  return s;
}

/** เรนเดอร์ equity research note จากข้อมูลเชิงโครงสร้างของ research team */
export default function ResearchNote({ details }: { details: RunDetails }) {
  const d = details;
  return (
    <>
      {d.stats && d.stats.length > 0 && (
        <div className="rail">
          {d.stats.map((s, i) => (
            <div key={i} className="stat">
              <span className="stat-k">
                {/* กัน "ราคาล่าสุด" ชนกับราคาล่าสุดจริงบนหัวหน้า — ตัวเลขนี้คือราคา ณ วันที่ทำรายงาน */}
                {s.label.includes("ราคาล่าสุด") ? s.label.replace("ราคาล่าสุด", "ราคาตอนทำรายงาน") : s.label}
              </span>
              <span className="stat-v">{s.value}</span>
              {s.note && (
                <span className={`stat-n ${s.tone === "up" ? "up" : s.tone === "down" ? "dn" : ""}`}>
                  {s.note}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {(d.business_md || d.segments) && (
        <>
          <h2 id="business">🏭 ทำธุรกิจอะไร</h2>
          {d.company_line && <p className="subtitle">{d.company_line}</p>}
          {d.business_md && (
            <div className="prose-block">
              <Markdown text={d.business_md} />
            </div>
          )}
          {d.segments && d.segments.length > 0 && (
            <div className="segs">
              {d.segments.map((s, i) => (
                <article key={i} className="seg">
                  <h3 className="seg-name">{s.name}</h3>
                  <span className="seg-rev">{s.revenue}</span>
                  <span className="seg-meta">
                    {s.share && <span>{s.share} ของรายได้</span>}
                    {s.yoy && (
                      <span className={s.yoy.startsWith("+") ? "up" : s.yoy.startsWith("−") || s.yoy.startsWith("-") ? "dn" : ""}>
                        {s.yoy} YoY
                      </span>
                    )}
                  </span>
                  {s.desc && <p className="seg-desc">{s.desc}</p>}
                  {s.margin_pct != null && (
                    <div className="meter">
                      <div className="meter-top">
                        <span>{s.margin_label ?? "Margin"}</span>
                        <b>{s.margin_pct}%</b>
                      </div>
                      <div className="track">
                        <div className="fill" style={{ width: `${Math.min(100, s.margin_pct * 2.5)}%` }} />
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
          {d.end_markets_md && (
            <div className="note">
              <Markdown text={d.end_markets_md} />
            </div>
          )}
        </>
      )}

      {d.pl_history && (
        <>
          <h2 id="pl">💰 งบการเงินย้อนหลัง {d.pl_history.years.length} ปี</h2>
          {d.pl_note_md && (
            <div className="prose-block">
              <Markdown text={d.pl_note_md} />
            </div>
          )}
          {d.pl_history.chart && (
            <FinChart years={d.pl_history.years} chart={d.pl_history.chart} />
          )}
          <FinTableView
            caption="งบกำไรขาดทุน · ตัวเลขตามที่บริษัทรายงาน"
            head={d.pl_history.years}
            rows={d.pl_history.rows}
          />
        </>
      )}

      {(d.balance_history || d.cashflow_kv) && (
        <>
          <h2 id="balance">🏦 งบดุลและกระแสเงินสด</h2>
          {d.balance_note_md && (
            <div className="prose-block">
              <Markdown text={d.balance_note_md} />
            </div>
          )}
          {d.balance_history && (
            <FinTableView
              caption="งบดุล ณ สิ้นปี"
              head={d.balance_history.years}
              rows={d.balance_history.rows}
            />
          )}
          {d.cashflow_kv && (
            <div className="two">
              <KvPanel title="กระแสเงินสดปีล่าสุด" kv={d.cashflow_kv} />
            </div>
          )}
        </>
      )}

      {(d.latest_quarter_md || d.guidance || d.valuation_md) && (
        <>
          <h2 id="current">📈 สถานะปัจจุบันและเป้าหมาย</h2>
          {d.latest_quarter_md && (
            <div className="prose-block">
              <Markdown text={d.latest_quarter_md} />
            </div>
          )}
          {d.guidance && (
            <FinTableView head={d.guidance.columns} rows={d.guidance.rows} />
          )}
          {d.valuation_md && (
            <div className="note">
              <Markdown text={d.valuation_md} />
            </div>
          )}
        </>
      )}

      {(d.drivers || d.risks) && (
        <>
          <h2 id="drivers">⚖️ ปัจจัยขับเคลื่อนและความเสี่ยง</h2>
          <div className="two">
            {d.drivers && (
              <div className="panel">
                <h3>ตัวหนุน</h3>
                <ul className="pill-list">
                  {d.drivers.map((x, i) => (
                    <li key={i}>
                      <Markdown text={x} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {d.risks && (
              <div className="panel">
                <h3>ความเสี่ยง</h3>
                <ul className="pill-list risks">
                  {d.risks.map((x, i) => (
                    <li key={i}>
                      <Markdown text={x} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
