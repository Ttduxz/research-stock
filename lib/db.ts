import { createClient, type Client, type ResultSet } from "@libsql/client";
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
  /** คำอธิบายภาษาคน 4 ช่อง — null ในแถวที่ยังไม่ได้เติม (หน้าเว็บ fallback ไปแสดง claim/evidence_md ตรงๆ) */
  if_md?: string | null;
  then_md?: string | null;
  because_md?: string | null;
  so_md?: string | null;
  /** good | bad | mixed — ผลตรวจนี้ดีหรือร้ายต่อหุ้น (null = too-early หรือแถวเก่า) */
  impact?: string | null;
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

/**
 * แถวจาก libSQL เป็น object พิเศษ (มี prototype + key ตัวเลข) ส่งเข้า Client Component ตรงๆ ไม่ได้
 * — React เตือน "Only plain objects can be passed to Client Components" ทุกแถว (หน้าแรกขึ้น 35 ข้อ)
 * แปลงเป็น plain object ด้วยชื่อคอลัมน์เดิม ค่าที่อ่านได้จึงเหมือนเดิมทุกตัว
 */
function plainRows<T>(rs: ResultSet): T[] {
  return rs.rows.map((row) =>
    Object.fromEntries(rs.columns.map((col) => [col, (row as unknown as Record<string, unknown>)[col]]))
  ) as T[];
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
  return plainRows<StockOverview>(rs);
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
  return plainRows<Stock>(rs)[0] ?? null;
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
  return plainRows<ResearchRun>(rs);
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
    run: plainRows<ResearchRun>(run)[0] ?? null,
    items: plainRows<ResearchItem>(items),
    analysis: plainRows<Analysis>(analysis)[0] ?? null,
    theories: plainRows<Theory>(theories),
  };
}

/**
 * คอลัมน์ที่หน้ารายการ hint ใช้จริง (การ์ดบนหน้าแรก + /insights) — ไม่รวม content_md / sources / stats ที่ยาว
 * /insights ส่งรายการนี้เข้า Client Component ทั้งก้อน เดิม SELECT * ทำให้เนื้อหาเต็มของทุกรายงาน (~280KB)
 * วิ่งไป browser ทุกครั้งที่เปิดหน้า ทั้งที่การ์ดโชว์แค่หัวข้อกับป้าย — เนื้อหาเต็มดึงทีละเรื่องผ่าน getHint()
 */
export type HintSummary = Pick<
  Hint,
  "id" | "slug" | "title" | "dek" | "direction" | "magnitude" | "impact_score" | "discovered_from" | "run_date"
>;

export async function listHints(): Promise<HintSummary[]> {
  if (useSnapshot) {
    const s = await loadSnapshot();
    if (!s?.hints) return [];
    return [...s.hints]
      .sort((a, b) => b.run_date.localeCompare(a.run_date) || b.id - a.id)
      .map(({ id, slug, title, dek, direction, magnitude, impact_score, discovered_from, run_date }) => ({
        id,
        slug,
        title,
        dek,
        direction,
        magnitude,
        impact_score,
        discovered_from,
        run_date,
      }));
  }
  const rs = await getDb().execute(
    `SELECT id, slug, title, dek, direction, magnitude, impact_score, discovered_from, run_date
     FROM hints ORDER BY run_date DESC, id DESC`
  );
  return plainRows<HintSummary>(rs);
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
  return plainRows<Hint>(rs)[0] ?? null;
}

/**
 * หุ้นหนึ่งตัว + run ล่าสุด + ผลวิเคราะห์/ทฤษฎีของ run นั้น (ใช้จัดอันดับหน้า /best-price)
 * เก็บเฉพาะ field ที่ lib/ranking.ts ใช้ — details_json (งบการเงินเต็ม) / summary_md / thesis_md ของทุกหุ้น
 * รวมกันเกิน 1MB แต่ไม่ถูกใช้เลย ถ้าหน้า /best-price จะแสดงอะไรเพิ่ม ต้องเพิ่มทั้งใน Pick นี้และ SELECT ด้านล่าง
 */
export interface LatestSnapshot {
  stock: Stock;
  run: Pick<ResearchRun, "id" | "ticker" | "run_date" | "price_at_run" | "entry_plan_json">;
  analysis: Pick<Analysis, "run_id" | "verdict" | "fundamentals_score" | "momentum_score" | "risk_level"> | null;
  theories: Pick<Theory, "id" | "run_id" | "title" | "scenarios" | "confidence">[];
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
    SELECT r.id, r.ticker, r.run_date, r.price_at_run, r.entry_plan_json,
           s.name, s.exchange, s.sector, s.currency, s.created_at AS stock_created_at
    FROM research_runs r
    JOIN stocks s ON s.ticker = r.ticker
    WHERE r.id = (SELECT id FROM research_runs WHERE ticker = s.ticker ORDER BY run_date DESC, id DESC LIMIT 1)
  `);
  const rows = plainRows<LatestSnapshot["run"] & {
    name: string;
    exchange: string | null;
    sector: string | null;
    currency: string;
    stock_created_at: string;
  }>(runsRs);
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(",");
  const [analysesRs, theoriesRs] = await Promise.all([
    db.execute({
      sql: `SELECT run_id, verdict, fundamentals_score, momentum_score, risk_level
            FROM analyses WHERE run_id IN (${placeholders})`,
      args: ids,
    }),
    db.execute({
      sql: `SELECT id, run_id, title, scenarios, confidence
            FROM theories WHERE run_id IN (${placeholders}) ORDER BY id ASC`,
      args: ids,
    }),
  ]);
  const analyses = plainRows<NonNullable<LatestSnapshot["analysis"]>>(analysesRs);
  const theories = plainRows<LatestSnapshot["theories"][number]>(theoriesRs);

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
      price_at_run: r.price_at_run,
      entry_plan_json: r.entry_plan_json,
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
  return plainRows<ResearchItem>(rs);
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
  return plainRows<Review>(rs);
}

/** รอบทบทวนล่าสุดของหุ้นทุกตัว ตัวละ 1 แถว (ใช้หน้า /watchlist แสดงสถานะของหุ้นที่แต่ละคนติดตาม) */
export async function listLatestReviews(): Promise<Review[]> {
  if (useSnapshot) {
    const s = await loadSnapshot();
    if (!s?.reviews) return [];
    const latest = new Map<string, Review>();
    for (const r of [...s.reviews].sort((a, b) => b.review_date.localeCompare(a.review_date) || b.id - a.id)) {
      if (!latest.has(r.ticker)) latest.set(r.ticker, r);
    }
    return [...latest.values()];
  }
  const rs = await getDb().execute(`
    SELECT * FROM reviews r
    WHERE r.id = (SELECT id FROM reviews WHERE ticker = r.ticker ORDER BY review_date DESC, id DESC LIMIT 1)
  `);
  return plainRows<Review>(rs);
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
  return plainRows<ThesisCheck>(rs);
}

/** ผลตัดสินหนึ่งข้อ + บริบทที่ใช้แยกกลุ่มในหน้า /track-record (ความมั่นใจของทฤษฎีต้นทาง, เซกเตอร์, verdict ตอนตั้ง) */
export interface TrackRecordRow {
  ticker: string;
  claim_type: string;
  claim: string;
  status: string;
  evidence_md: string | null;
  sources_json: string | null; // [{ title, url, published_at }] — หลักฐานที่ reviewer ใช้ตัดสิน
  /** เคยบอกว่าถ้า… */
  if_md: string | null;
  /** …จะส่งผล (มาจากทฤษฎีเดิม ไม่ใช่เขียนหลังรู้ผล) */
  then_md: string | null;
  /** ตอนนี้เป็นแบบนี้เพราะ… */
  because_md: string | null;
  /** …ส่งผลให้ */
  so_md: string | null;
  /** good | bad | mixed ต่อหุ้น — ใช้ให้สีการ์ด risk แทนการเดาจาก status */
  impact: string | null;
  theory_title: string | null;
  review_date: string;
  origin_run_date: string | null;
  confidence: number | null;
  sector: string | null;
  verdict: string | null;
}

/**
 * ผลตัดสิน **ล่าสุด** ของทุก claim ทั้งระบบ — claim เดียวกันอาจถูกตัดสินหลายรอบ นับแค่รอบใหม่สุด
 * ไม่งั้นข้อที่ถูกทบทวนบ่อยจะมีน้ำหนักเกินจริงในสถิติ
 */
export async function listTrackRecordRows(): Promise<TrackRecordRow[]> {
  const latestOnly = (rows: TrackRecordRow[]) => {
    const seen = new Set<string>();
    return rows.filter((r) => {
      const key = `${r.ticker}|${r.claim.replace(/\s+/g, " ").trim()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  if (useSnapshot) {
    const s = await loadSnapshot();
    if (!s?.thesis_checks || !s.reviews) return [];
    const reviewDate = new Map(s.reviews.map((r) => [r.id, r.review_date]));
    const rows = s.thesis_checks
      .map((c): TrackRecordRow => {
        const run = s.research_runs.find((r) => r.id === c.origin_run_id);
        const theory = s.theories.find((t) => t.run_id === c.origin_run_id && t.title === c.theory_title);
        return {
          ticker: c.ticker,
          claim_type: c.claim_type,
          claim: c.claim,
          status: c.status,
          evidence_md: c.evidence_md,
          sources_json: c.sources_json,
          if_md: c.if_md ?? null,
          then_md: c.then_md ?? null,
          because_md: c.because_md ?? null,
          so_md: c.so_md ?? null,
          impact: c.impact ?? null,
          theory_title: c.theory_title,
          review_date: reviewDate.get(c.review_id) ?? "",
          origin_run_date: run?.run_date ?? null,
          confidence: theory?.confidence ?? null,
          sector: s.stocks.find((x) => x.ticker === c.ticker)?.sector ?? null,
          verdict: s.analyses.find((a) => a.run_id === c.origin_run_id)?.verdict ?? null,
        };
      })
      .sort((a, b) => b.review_date.localeCompare(a.review_date));
    return latestOnly(rows);
  }

  const rs = await getDb().execute(`
    SELECT c.ticker, c.claim_type, c.claim, c.status, c.evidence_md, c.sources_json, c.theory_title,
           c.if_md, c.then_md, c.because_md, c.so_md, c.impact,
           rv.review_date, r.run_date AS origin_run_date,
           (SELECT t.confidence FROM theories t
             WHERE t.run_id = c.origin_run_id AND t.title = c.theory_title LIMIT 1) AS confidence,
           s.sector,
           (SELECT a.verdict FROM analyses a WHERE a.run_id = c.origin_run_id LIMIT 1) AS verdict
    FROM thesis_checks c
    JOIN reviews rv ON rv.id = c.review_id
    LEFT JOIN research_runs r ON r.id = c.origin_run_id
    LEFT JOIN stocks s ON s.ticker = c.ticker
    ORDER BY rv.review_date DESC, c.review_id DESC, c.id ASC
  `);
  return latestOnly(plainRows<TrackRecordRow>(rs));
}
