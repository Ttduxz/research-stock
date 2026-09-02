import { createClient, type Client } from "@libsql/client";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * แหล่งข้อมูลมี 3 โหมด (เลือกอัตโนมัติ):
 * 1. Turso cloud   — เมื่อตั้ง TURSO_DATABASE_URL (production เต็มรูปแบบ)
 * 2. JSON snapshot — บน Vercel ที่ยังไม่มี Turso: อ่าน data/export.json ที่แนบมากับ deployment
 * 3. SQLite file   — local dev: data/stock.db
 */

// ---------- Types ----------

export interface Stock {
  ticker: string;
  name: string;
  exchange: string | null;
  sector: string | null;
  currency: string;
  created_at: string;
}

export interface ResearchRun {
  id: number;
  ticker: string;
  run_date: string;
  status: string;
  summary_md: string | null;
  price_at_run: number | null;
  details_json: string | null; // RunDetails (JSON)
  entry_plan_json: string | null; // EntryPlan (JSON)
  created_at: string;
}

/** แผนจุดเข้าสะสมแบ่งไม้ — ความเห็นเชิงกลยุทธ์ของ theorie team (เพื่อการศึกษา) */
export interface EntryPlan {
  stance_md?: string;
  tranches?: {
    level: number;
    price_range: string;
    allocation?: string;
    rationale?: string;
    trigger?: string;
  }[];
  invalidation_md?: string;
}

/** ข้อมูลเชิงโครงสร้างระดับ equity research note — ทุก field optional */
export interface RunDetails {
  company_line?: string;
  business_md?: string;
  stats?: { label: string; value: string; note?: string; tone?: "up" | "down" | "neutral" }[];
  segments?: {
    name: string;
    revenue: string;
    share?: string;
    yoy?: string;
    margin_label?: string;
    margin_pct?: number;
    desc?: string;
  }[];
  end_markets_md?: string;
  pl_history?: FinTable & {
    chart?: { unit?: string; revenue: number[]; margin_pct?: number[]; margin_label?: string };
  };
  pl_note_md?: string;
  balance_history?: FinTable;
  balance_note_md?: string;
  cashflow_kv?: { k: string; v: string }[];
  latest_quarter_md?: string;
  guidance?: { columns: string[]; rows: FinRow[] };
  valuation_md?: string;
  drivers?: string[];
  risks?: string[];
}

export interface FinRow {
  label: string;
  values: (string | number)[];
  strong?: boolean;
  band?: boolean;
}

export interface FinTable {
  years: (string | number)[];
  rows: FinRow[];
}

export interface ResearchItem {
  id: number;
  run_id: number;
  ticker: string;
  category: string;
  title: string;
  url: string | null;
  source: string | null;
  published_at: string | null;
  content_md: string;
  importance: number;
}

export interface Analysis {
  id: number;
  run_id: number;
  ticker: string;
  verdict: "bullish" | "neutral" | "bearish";
  fundamentals_score: number | null;
  momentum_score: number | null;
  risk_level: string | null;
  key_points: string | null; // JSON array
  content_md: string;
  created_at: string;
}

export interface Theory {
  id: number;
  run_id: number;
  ticker: string;
  title: string;
  thesis_md: string;
  assumptions: string | null;
  catalysts: string | null;
  risks: string | null;
  scenarios: string | null;
  confidence: number | null;
  horizon: string | null;
  created_at: string;
}

/**
 * hint = ข่าว/ประเด็นที่กระทบกว้างกว่าตัวหุ้นที่ user สั่ง research (เชิงระบบ/อุตสาหกรรม/มหภาค)
 * ที่ research team บังเอิญเจอระหว่างค้นแล้วเห็นว่าสำคัญพอจะแยกเป็นรายงานของตัวเอง
 */
export interface Hint {
  id: number;
  slug: string;
  title: string;
  dek: string | null;
  direction: string | null; // "positive" | "negative" | "mixed" — hint ไม่ได้แปลว่าความเสี่ยงเสมอไป อาจเป็นโอกาสก็ได้
  magnitude: string | null; // "high" | "mid" | "low" — ขนาดผลกระทบ ไม่ว่าจะบวกหรือลบ
  discovered_from: string | null; // ticker ที่เจอระหว่าง research คั่นด้วย comma เช่น "NVDA,MSFT"
  run_date: string;
  stats_json: string | null; // { label, value, note? }[]
  content_md: string;
  opinion_md: string | null; // ความเห็นส่วนตัวปิดท้าย (ถ้ามี)
  sources_json: string | null; // { group, title, url }[]
  created_at: string;
}

export interface HintStat {
  label: string;
  value: string;
  note?: string;
}

export interface HintSource {
  group: string;
  title: string;
  url: string;
}

export interface StockOverview extends Stock {
  latest_run_id: number | null;
  latest_run_date: string | null;
  latest_verdict: string | null;
  latest_price: number | null;
  run_count: number;
}

export interface RunBundle {
  run: ResearchRun | null;
  items: ResearchItem[];
  analysis: Analysis | null;
  theories: Theory[];
}

interface Snapshot {
  stocks: Stock[];
  research_runs: ResearchRun[];
  research_items: ResearchItem[];
  analyses: Analysis[];
  theories: Theory[];
  hints?: Hint[];
}

// ---------- Mode selection ----------

const useTurso = !!process.env.TURSO_DATABASE_URL;
const useSnapshot = !useTurso && !!process.env.VERCEL;

let _db: Client | null = null;
function getDb(): Client {
  if (_db) return _db;
  _db = createClient({
    url: process.env.TURSO_DATABASE_URL ?? "file:./data/stock.db",
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  return _db;
}

let _snapshot: Snapshot | null | undefined;
async function loadSnapshot(): Promise<Snapshot | null> {
  if (_snapshot !== undefined) return _snapshot;
  try {
    const raw = await readFile(path.join(process.cwd(), "data", "export.json"), "utf8");
    _snapshot = JSON.parse(raw) as Snapshot;
  } catch {
    _snapshot = null;
  }
  return _snapshot;
}

function latestRunOf(runs: ResearchRun[], ticker: string): ResearchRun | null {
  const mine = runs.filter((r) => r.ticker === ticker);
  mine.sort((a, b) => b.run_date.localeCompare(a.run_date) || b.id - a.id);
  return mine[0] ?? null;
}

// ---------- Queries ----------

export async function listStocksWithLatest(): Promise<StockOverview[]> {
  if (useSnapshot) {
    const s = await loadSnapshot();
    if (!s) return [];
    const out = s.stocks.map((stock) => {
      const latest = latestRunOf(s.research_runs, stock.ticker);
      const analysis = latest ? s.analyses.find((a) => a.run_id === latest.id) : null;
      return {
        ...stock,
        latest_run_id: latest?.id ?? null,
        latest_run_date: latest?.run_date ?? null,
        latest_verdict: analysis?.verdict ?? null,
        latest_price: latest?.price_at_run ?? null,
        run_count: s.research_runs.filter((r) => r.ticker === stock.ticker).length,
      };
    });
    out.sort((a, b) =>
      (b.latest_run_date ?? "").localeCompare(a.latest_run_date ?? "") ||
      a.ticker.localeCompare(b.ticker)
    );
    return out;
  }

  const rs = await getDb().execute(`
    SELECT s.*,
           r.id AS latest_run_id,
           r.run_date AS latest_run_date,
           r.price_at_run AS latest_price,
           a.verdict AS latest_verdict,
           (SELECT COUNT(*) FROM research_runs WHERE ticker = s.ticker) AS run_count
    FROM stocks s
    LEFT JOIN research_runs r
      ON r.id = (SELECT id FROM research_runs WHERE ticker = s.ticker ORDER BY run_date DESC, id DESC LIMIT 1)
    LEFT JOIN analyses a
      ON a.run_id = r.id
    ORDER BY r.run_date DESC NULLS LAST, s.ticker ASC
  `);
  return rs.rows as unknown as StockOverview[];
}

export async function getStock(ticker: string): Promise<Stock | null> {
  const t = ticker.toUpperCase();
  if (useSnapshot) {
    const s = await loadSnapshot();
    return s?.stocks.find((x) => x.ticker === t) ?? null;
  }
  const rs = await getDb().execute({
    sql: "SELECT * FROM stocks WHERE ticker = ?",
    args: [t],
  });
  return (rs.rows[0] as unknown as Stock) ?? null;
}

export async function listRuns(ticker: string): Promise<ResearchRun[]> {
  const t = ticker.toUpperCase();
  if (useSnapshot) {
    const s = await loadSnapshot();
    if (!s) return [];
    return s.research_runs
      .filter((r) => r.ticker === t)
      .sort((a, b) => b.run_date.localeCompare(a.run_date) || b.id - a.id);
  }
  const rs = await getDb().execute({
    sql: "SELECT * FROM research_runs WHERE ticker = ? ORDER BY run_date DESC, id DESC",
    args: [t],
  });
  return rs.rows as unknown as ResearchRun[];
}

export async function getRunBundle(runId: number): Promise<RunBundle> {
  if (useSnapshot) {
    const s = await loadSnapshot();
    if (!s) return { run: null, items: [], analysis: null, theories: [] };
    return {
      run: s.research_runs.find((r) => r.id === runId) ?? null,
      items: s.research_items
        .filter((i) => i.run_id === runId)
        .sort((a, b) => b.importance - a.importance || a.id - b.id),
      analysis: s.analyses.find((a) => a.run_id === runId) ?? null,
      theories: s.theories.filter((t) => t.run_id === runId).sort((a, b) => a.id - b.id),
    };
  }

  const db = getDb();
  const [run, items, analysis, theories] = await Promise.all([
    db.execute({ sql: "SELECT * FROM research_runs WHERE id = ?", args: [runId] }),
    db.execute({
      sql: "SELECT * FROM research_items WHERE run_id = ? ORDER BY importance DESC, id ASC",
      args: [runId],
    }),
    db.execute({ sql: "SELECT * FROM analyses WHERE run_id = ? LIMIT 1", args: [runId] }),
    db.execute({ sql: "SELECT * FROM theories WHERE run_id = ? ORDER BY id ASC", args: [runId] }),
  ]);
  return {
    run: (run.rows[0] as unknown as ResearchRun) ?? null,
    items: items.rows as unknown as ResearchItem[],
    analysis: (analysis.rows[0] as unknown as Analysis) ?? null,
    theories: theories.rows as unknown as Theory[],
  };
}

export async function listHints(): Promise<Hint[]> {
  if (useSnapshot) {
    const s = await loadSnapshot();
    if (!s?.hints) return [];
    return [...s.hints].sort(
      (a, b) => b.run_date.localeCompare(a.run_date) || b.id - a.id
    );
  }
  const rs = await getDb().execute(
    "SELECT * FROM hints ORDER BY run_date DESC, id DESC"
  );
  return rs.rows as unknown as Hint[];
}

export async function getHint(slug: string): Promise<Hint | null> {
  if (useSnapshot) {
    const s = await loadSnapshot();
    return s?.hints?.find((h) => h.slug === slug) ?? null;
  }
  const rs = await getDb().execute({
    sql: "SELECT * FROM hints WHERE slug = ?",
    args: [slug],
  });
  return (rs.rows[0] as unknown as Hint) ?? null;
}

/** หุ้นหนึ่งตัว + run ล่าสุด + ผลวิเคราะห์/ทฤษฎีของ run นั้น (ใช้จัดอันดับหน้า /best-price) */
export interface LatestSnapshot {
  stock: Stock;
  run: ResearchRun;
  analysis: Analysis | null;
  theories: Theory[];
}

/** ดึง run ล่าสุดของหุ้นทุกตัวพร้อม analysis + theories ในคำสั่งเดียว */
export async function listLatestSnapshots(): Promise<LatestSnapshot[]> {
  if (useSnapshot) {
    const s = await loadSnapshot();
    if (!s) return [];
    const out: LatestSnapshot[] = [];
    for (const stock of s.stocks) {
      const run = latestRunOf(s.research_runs, stock.ticker);
      if (!run) continue;
      out.push({
        stock,
        run,
        analysis: s.analyses.find((a) => a.run_id === run.id) ?? null,
        theories: s.theories.filter((t) => t.run_id === run.id).sort((a, b) => a.id - b.id),
      });
    }
    return out;
  }

  const db = getDb();
  const runsRs = await db.execute(`
    SELECT r.*, s.name, s.exchange, s.sector, s.currency, s.created_at AS stock_created_at
    FROM research_runs r
    JOIN stocks s ON s.ticker = r.ticker
    WHERE r.id = (SELECT id FROM research_runs WHERE ticker = s.ticker ORDER BY run_date DESC, id DESC LIMIT 1)
  `);
  const rows = runsRs.rows as unknown as (ResearchRun & {
    name: string;
    exchange: string | null;
    sector: string | null;
    currency: string;
    stock_created_at: string;
  })[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(",");
  const [analysesRs, theoriesRs] = await Promise.all([
    db.execute({ sql: `SELECT * FROM analyses WHERE run_id IN (${placeholders})`, args: ids }),
    db.execute({
      sql: `SELECT * FROM theories WHERE run_id IN (${placeholders}) ORDER BY id ASC`,
      args: ids,
    }),
  ]);
  const analyses = analysesRs.rows as unknown as Analysis[];
  const theories = theoriesRs.rows as unknown as Theory[];

  return rows.map((r) => ({
    stock: {
      ticker: r.ticker,
      name: r.name,
      exchange: r.exchange,
      sector: r.sector,
      currency: r.currency,
      created_at: r.stock_created_at,
    },
    run: {
      id: r.id,
      ticker: r.ticker,
      run_date: r.run_date,
      status: r.status,
      summary_md: r.summary_md,
      price_at_run: r.price_at_run,
      details_json: r.details_json,
      entry_plan_json: r.entry_plan_json,
      created_at: r.created_at,
    },
    analysis: analyses.find((a) => a.run_id === r.id) ?? null,
    theories: theories.filter((t) => t.run_id === r.id),
  }));
}
