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
  /** 'full' = pipeline เต็ม | 'update' = reviewer + analyst/theorist | 'review' = reviewer อย่างเดียว */
  run_type: string | null;
  /** รอบก่อนหน้าของหุ้นตัวนี้ — ทำให้ไล่สายการเปลี่ยนความเห็นย้อนหลังได้ */
  prev_run_id: number | null;
  delta_json: string | null; // RunDelta (JSON)
  created_at: string;
}

/** สรุปว่ารอบนี้ต่างจากรอบก่อนยังไง — เก็บใน research_runs.delta_json */
export interface RunDelta {
  /** same = ยืนยันความเห็นเดิม | shifted = น้ำหนักเปลี่ยนแต่ยังไม่พลิก | escalate = ต้องทบทวนใหญ่ */
  stance?: "same" | "shifted" | "escalate";
  review_md?: string;
  prev_verdict?: string | null;
  verdict?: string | null;
  prev_price?: number | null;
  price_move_pct?: number | null;
  /** เหตุผลที่ยกธงให้ analyst/theorist ทำใหม่ (มีเมื่อ stance = escalate) */
  escalate_reason?: string;
  /** ใครเป็นคนยกธง — เกณฑ์แข็งจากสคริปต์ หรือดุลพินิจของ reviewer */
  escalated_by?: ("rule" | "reviewer")[];
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
  /** รอบที่เจอ item นี้ครั้งแรก (ไม่ใช่ 'รอบที่ item นี้สังกัด' — คลัง item เป็นของ ticker ไม่ใช่ของ run) */
  run_id: number;
  last_seen_run_id: number | null;
  first_seen_on: string | null;
  last_seen_on: string | null;
  /** active = แสดงปกติ | archived = เก่าและไม่สำคัญพอ | superseded = มีข่าวใหม่มาแทนแล้ว */
  status: string | null;
  /** id ของ item ที่มาแทน (เมื่อ status = superseded) */
  superseded_by: number | null;
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
  impact_score: number | null; // 1-100 — จัดอันดับละเอียดกว่า magnitude ใช้เลือก top-N ตอน magnitude เท่ากันหลายอัน
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
  /** วันที่ทบทวนล่าสุด (อาจใหม่กว่า latest_run_date ถ้าทบทวนแล้วยังไม่ครบเงื่อนไขวิเคราะห์ใหม่) */
  latest_review_date: string | null;
  latest_review_price: number | null;
}

/**
 * รอบทบทวนรายสัปดาห์ของทีม reviewer — ตัดสินความเห็นเดิม ไม่ได้ผลิตความเห็นใหม่
 * ถึงยกธง escalate ก็ยังไม่แก้ทฤษฎีเอง แต่ส่งต่อให้ analyst/theorist ทำรอบใหม่ (resulting_run_id)
 */
export interface Review {
  id: number;
  ticker: string;
  review_date: string;
  base_run_id: number | null;
  /** same = ยืนยันเดิม | shifted = น้ำหนักเปลี่ยนแต่ยังไม่พลิก | escalate = ต้องทบทวนใหญ่ */
  stance: string;
  review_md: string;
  price_at_review: number | null;
  price_move_pct: number | null;
  escalated_by: string | null; // JSON ["rule","reviewer"]
  escalate_reason: string | null;
  /** สถานะของแผนเดิมหลังทบทวน: no-action | watch | plan-live | plan-broken */
  plan_status: string | null;
  /** บรรทัดที่ตอบว่า "อ่านจบแล้วต้องทำอะไรไหม" — บังคับให้มีตั้งแต่ตอน ingest */
  action_md: string | null;
  resulting_run_id: number | null;
  created_at: string;
}

/**
 * การตัดสินข้อความจากทฤษฎีรอบก่อนด้วยหลักฐานใหม่ — ผลงานของทีม reviewer
 * claim ต้องเป็นข้อความเดิมแบบคัดลอกตรงตัว ไม่ใช่เรียบเรียงใหม่ (ไม่งั้นคำทำนายจะถูกแก้ให้ตรงผลย้อนหลัง)
 */
export interface ThesisCheck {
  id: number;
  ticker: string;
  review_id: number;
  origin_run_id: number | null;
  theory_title: string | null;
  claim_type: string; // assumption | catalyst | risk | invalidation | target
  claim: string;
  status: string; // confirmed | weakened | broken | too-early
  evidence_md: string | null;
  sources_json: string | null; // [{ title, url, published_at }]
  created_at: string;
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
  thesis_checks?: ThesisCheck[];
  reviews?: Review[];
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
      const reviews = (s.reviews ?? []).filter((r) => r.ticker === stock.ticker);
      reviews.sort((a, b) => b.review_date.localeCompare(a.review_date) || b.id - a.id);
      const latestReview = reviews[0] ?? null;
      return {
        ...stock,
        latest_run_id: latest?.id ?? null,
        latest_run_date: latest?.run_date ?? null,
        latest_verdict: analysis?.verdict ?? null,
        latest_price: latest?.price_at_run ?? null,
        run_count: s.research_runs.filter((r) => r.ticker === stock.ticker).length,
        latest_review_date: latestReview?.review_date ?? null,
        latest_review_price: latestReview?.price_at_review ?? null,
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
           (SELECT COUNT(*) FROM research_runs WHERE ticker = s.ticker) AS run_count,
           rv.review_date AS latest_review_date,
           rv.price_at_review AS latest_review_price
    FROM stocks s
    LEFT JOIN research_runs r
      ON r.id = (SELECT id FROM research_runs WHERE ticker = s.ticker ORDER BY run_date DESC, id DESC LIMIT 1)
    LEFT JOIN analyses a
      ON a.run_id = r.id
    LEFT JOIN reviews rv
      ON rv.id = (SELECT id FROM reviews WHERE ticker = s.ticker ORDER BY review_date DESC, id DESC LIMIT 1)
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

/** ticker → sector ของหุ้นทุกตัว (ใช้อนุมาน segment ของ hint ในหน้า /insights — ดู lib/segments.ts) */
export async function listStockSectors(): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  if (useSnapshot) {
    const s = await loadSnapshot();
    for (const stock of s?.stocks ?? []) out[stock.ticker] = stock.sector;
    return out;
  }
  const rs = await getDb().execute("SELECT ticker, sector FROM stocks");
  for (const row of rs.rows as unknown as { ticker: string; sector: string | null }[]) {
    out[row.ticker] = row.sector;
  }
  return out;
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
      run_type: r.run_type,
      prev_run_id: r.prev_run_id,
      delta_json: r.delta_json,
      created_at: r.created_at,
    },
    analysis: analyses.find((a) => a.run_id === r.id) ?? null,
    theories: theories.filter((t) => t.run_id === r.id),
  }));
}

/**
 * คลังข่าว/ข้อมูลของหุ้นตัวหนึ่งที่ยังใช้งานอยู่ — ข้ามตัวที่ถูก archive หรือถูกข่าวใหม่แทนที่แล้ว
 * ต่างจาก getRunBundle().items ตรงที่ไม่ผูกกับรอบใดรอบหนึ่ง (รอบติดตามรายสัปดาห์เพิ่มของใหม่เข้าคลังเดียวกัน)
 */
export async function listActiveItems(ticker: string): Promise<ResearchItem[]> {
  const t = ticker.toUpperCase();
  const active = (i: ResearchItem) => i.ticker === t && (i.status ?? "active") === "active";
  if (useSnapshot) {
    const s = await loadSnapshot();
    if (!s) return [];
    return s.research_items
      .filter(active)
      .sort(
        (a, b) =>
          (b.published_at ?? "").localeCompare(a.published_at ?? "") ||
          b.importance - a.importance ||
          b.id - a.id
      );
  }
  const rs = await getDb().execute({
    sql: `SELECT * FROM research_items
          WHERE ticker = ? AND COALESCE(status, 'active') = 'active'
          ORDER BY published_at DESC NULLS LAST, importance DESC, id DESC`,
    args: [t],
  });
  return rs.rows as unknown as ResearchItem[];
}

/** รอบทบทวนรายสัปดาห์ของหุ้นตัวหนึ่ง ใหม่สุดก่อน — คู่กับ listRuns() เวลาต่อ timeline */
export async function listReviews(ticker: string): Promise<Review[]> {
  const t = ticker.toUpperCase();
  if (useSnapshot) {
    const s = await loadSnapshot();
    if (!s?.reviews) return [];
    return s.reviews
      .filter((r) => r.ticker === t)
      .sort((a, b) => b.review_date.localeCompare(a.review_date) || b.id - a.id);
  }
  const rs = await getDb().execute({
    sql: "SELECT * FROM reviews WHERE ticker = ? ORDER BY review_date DESC, id DESC",
    args: [t],
  });
  return rs.rows as unknown as Review[];
}

/** ผลตัดสินทฤษฎีทั้งหมดของหุ้นตัวหนึ่ง เรียงรอบใหม่ก่อน (ใช้ทำ timeline + track record) */
export async function listThesisChecks(ticker: string): Promise<ThesisCheck[]> {
  const t = ticker.toUpperCase();
  if (useSnapshot) {
    const s = await loadSnapshot();
    if (!s?.thesis_checks) return [];
    return s.thesis_checks.filter((c) => c.ticker === t).sort((a, b) => b.review_id - a.review_id || a.id - b.id);
  }
  const rs = await getDb().execute({
    sql: "SELECT * FROM thesis_checks WHERE ticker = ? ORDER BY review_id DESC, id ASC",
    args: [t],
  });
  return rs.rows as unknown as ThesisCheck[];
}
