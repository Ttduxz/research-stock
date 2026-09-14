import Link from "next/link";
import { notFound } from "next/navigation";
import type { HintStat, HintSource } from "@/lib/db";
import { getHint } from "@/lib/cached";
import Markdown from "@/components/Markdown";
import HintBadge from "@/components/HintBadge";

export const dynamic = "force-dynamic";

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
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
  const sourceGroups = new Map<string, HintSource[]>();
  for (const s of sources ?? []) {
    const key = s.group || "แหล่งข้อมูล";
    const group = sourceGroups.get(key);
    if (group) group.push(s);
    else sourceGroups.set(key, [s]);
  }

  const tickers = hint.discovered_from?.split(",").map((t) => t.trim()).filter(Boolean) ?? [];

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

      <div className="card">
        <Markdown text={hint.content_md} />
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
