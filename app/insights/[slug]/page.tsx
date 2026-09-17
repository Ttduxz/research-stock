import Link from "next/link";
import { notFound } from "next/navigation";
import type { HintStat, HintSource, HintVisual, HintGlossaryTerm } from "@/lib/db";
import { getHint } from "@/lib/cached";
import Markdown from "@/components/Markdown";
import HintBadge from "@/components/HintBadge";
import HintVisualFigure from "@/components/HintVisuals";
import HintGlossary from "@/components/HintGlossary";
import { HINT_STATUS_LABEL, isActiveHint } from "@/lib/hint-status";

export const dynamic = "force-dynamic";

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** แยก content_md ตรงบรรทัด [[visual:id]] เป็นท่อนข้อความสลับกับภาพ — ภาพที่ไม่มี marker ไปต่อท้าย
 *  (สเปก marker อยู่ scripts/hint-visuals.mjs) */
const MARKER_RE = /^\s*\[\[visual:([a-z0-9-]+)\]\]\s*$/gm;
function splitContent(md: string, visuals: HintVisual[] | null) {
  const byId = new Map((visuals ?? []).map((v) => [v.id, v]));
  const parts: ({ kind: "md"; text: string } | { kind: "visual"; visual: HintVisual })[] = [];
  const placed = new Set<string>();
  let last = 0;
  for (const m of md.matchAll(MARKER_RE)) {
    const v = byId.get(m[1]);
    if (!v) continue;
    const before = md.slice(last, m.index).trim();
    if (before) parts.push({ kind: "md", text: before });
    parts.push({ kind: "visual", visual: v });
    placed.add(v.id);
    last = (m.index ?? 0) + m[0].length;
  }
  const tail = md.slice(last).trim();
  if (tail) parts.push({ kind: "md", text: tail });
  for (const v of visuals ?? []) if (!placed.has(v.id)) parts.push({ kind: "visual", visual: v });
  return parts;
}

export default async function InsightPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const hint = await getHint(slug);
  if (!hint) notFound();

  const stats = parseJson<HintStat[]>(hint.stats_json);
  const sources = parseJson<HintSource[]>(hint.sources_json);
  const visuals = parseJson<HintVisual[]>(hint.visuals_json);
  const glossary = parseJson<HintGlossaryTerm[]>(hint.glossary_json) ?? [];
  const contentParts = splitContent(hint.content_md, visuals);
  const sourceGroups = new Map<string, HintSource[]>();
  for (const s of sources ?? []) {
    const key = s.group || "แหล่งข้อมูล";
    const group = sourceGroups.get(key);
    if (group) group.push(s);
    else sourceGroups.set(key, [s]);
  }

  const tickers = hint.discovered_from?.split(",").map((t) => t.trim()).filter(Boolean) ?? [];
  const statusSources = parseJson<{ title?: string; url: string; published_at?: string }[]>(hint.status_sources_json);

  return (
    <>
      <div className="crumbs">
        <Link href="/insights">← Insights</Link>
      </div>

      <div className="stock-head">
        <h1>{hint.title}</h1>
        <HintBadge direction={hint.direction} magnitude={hint.magnitude} impactScore={hint.impact_score} />
      </div>
      <p className="subtitle">
        {hint.dek}
        {tickers.length > 0 && (
          <>
            {" "}
            · เจอระหว่าง research{" "}
            {tickers.map((t, i) => (
              <span key={t}>
                {i > 0 && ", "}
                <Link href={`/stock/${t}`}>{t}</Link>
              </span>
            ))}
          </>
        )}
        {" "}· {hint.run_date}
      </p>

      {/* ผลรอบทบทวนล่าสุด — เรื่องที่ปิดแล้วต้องบอกชัดตั้งแต่บนสุด เนื้อรายงานด้านล่างเป็นของเดิม ณ วันที่ทำ */}
      {hint.last_checked_on &&
        (isActiveHint(hint.status) ? (
          <p className="hint-checked">
            ตรวจล่าสุด {hint.last_checked_on} · {HINT_STATUS_LABEL.active}
            {hint.status_md && <> — {hint.status_md}</>}
          </p>
        ) : (
          <div className={`hint-status-note st-${hint.status}`}>
            <div className="hint-status-head">
              <span className={`badge hint-status st-${hint.status}`}>
                {HINT_STATUS_LABEL[hint.status ?? ""] ?? hint.status}
              </span>
              <span className="hint-status-date">ตรวจเมื่อ {hint.last_checked_on}</span>
            </div>
            {hint.status_md && <p>{hint.status_md}</p>}
            {statusSources && statusSources.length > 0 && (
              <div className="hint-status-src">
                หลักฐาน:{" "}
                {statusSources.map((s, i) => (
                  <a key={i} href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.title || s.url}
                    {s.published_at ? ` (${s.published_at})` : ""} ↗
                  </a>
                ))}
              </div>
            )}
            <p className="hint-status-foot">
              รายงานด้านล่างเก็บไว้ตามที่เขียน ณ วันที่ {hint.run_date} เพื่อย้อนดูได้ — ระบบไม่ใช้ประเด็นนี้ประกอบการวิเคราะห์หุ้นแล้ว
            </p>
          </div>
        ))}

      {hint.tldr_md && (
        <section className="tldr" aria-label="สรุปสั้นๆ">
          <span className="tldr-k">อ่านแค่นี้ก็พอเข้าใจ</span>
          <Markdown text={hint.tldr_md} />
        </section>
      )}

      {stats && stats.length > 0 && (
        <div className="rail">
          {stats.map((s, i) => (
            <div className="stat" key={i}>
              <div className="stat-k">{s.label}</div>
              <div className="stat-v">{s.value}</div>
              {s.note && <div className="stat-n">{s.note}</div>}
            </div>
          ))}
        </div>
      )}

      {glossary.length > 0 && <HintGlossary terms={glossary} scope="#hint-content" />}

      <div className="card" id="hint-content">
        {contentParts.map((p, i) =>
          p.kind === "md" ? <Markdown key={i} text={p.text} /> : <HintVisualFigure key={i} visual={p.visual} />
        )}
      </div>

      {hint.opinion_md && (
        <>
          <h2>ความเห็นส่วนตัวของผู้วิเคราะห์</h2>
          <div className="card opinion">
            <span className="badge cat" style={{ marginBottom: 12, display: "inline-block" }}>
              ความเห็นส่วนตัว — ไม่ใช่ข้อเท็จจริง ไม่ใช่คำแนะนำการลงทุน
            </span>
            <Markdown text={hint.opinion_md} />
          </div>
        </>
      )}

      {sourceGroups.size > 0 && (
        <>
          <h2>แหล่งข้อมูลอ้างอิง</h2>
          <div className="card">
            {[...sourceGroups.entries()].map(([group, items]) => (
              <div key={group} style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 14 }}>{group}</h3>
                <ul className="pill-list">
                  {items.map((s, i) => (
                    <li key={i}>
                      <a href={s.url} target="_blank" rel="noopener noreferrer">
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="disclaimer" style={{ marginTop: 24 }}>
        เนื้อหานี้เจอโดยทีม research ระหว่างวิเคราะห์หุ้น{tickers.length > 0 ? ` ${tickers.join(", ")}` : ""}{" "}
        แล้ววิเคราะห์เชิงลึกแยกต่างหากเพราะกระทบกว้างกว่าหุ้นตัวนั้น เป็นการวิเคราะห์เพื่อการศึกษาเท่านั้น ไม่ใช่คำแนะนำการลงทุน
      </p>
    </>
  );
}
