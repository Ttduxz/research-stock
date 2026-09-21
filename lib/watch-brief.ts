import { createClient, type Client } from "@libsql/client";
import { watchlistAvailable } from "@/lib/watchlist";

/**
 * "มีอะไรใหม่ตั้งแต่ครั้งก่อน" บนหน้า /watchlist — ฉบับเว็บของ scripts/watch-brief.mjs
 *
 * อ่านจาก DB อย่างเดียว ไม่ผลิตความเห็นใหม่: ทุกบรรทัดคือสิ่งที่รอบทบทวน/รายงาน/insight เขียนไว้แล้ว
 * แค่คัดเฉพาะของที่เกิดหลังจากคนนี้เปิดหน้านี้ครั้งก่อน (ตาราง watchlist_seen)
 * ต่างจากสคริปต์: ไม่ดึงราคาสด (price-delta.mjs เรียก quote ภายนอก) — ราคาที่แสดงเป็นของรอบทบทวน
 *
 * ผูกอีเมล: ไม่ผ่าน lib/cached.ts (ต่างกันรายคน)
 */

let _db: Client | null = null;
function getDb(): Client {
  if (_db) return _db;
  _db = createClient({
    url: process.env.TURSO_DATABASE_URL?.trim() ?? "file:./data/stock.db",
    authToken: process.env.TURSO_AUTH_TOKEN?.trim(),
  });
  return _db;
}

const norm = (email: string) => email.trim().toLowerCase();

/** ห่างจากการเปิดครั้งล่าสุดเกินเท่านี้ = การเข้าชมรอบใหม่ → จุดตั้งต้นขยับมาที่ครั้งล่าสุด */
const VISIT_GAP = "-30 minutes";
/** เข้าครั้งแรก (ยังไม่มีแถว) ดูย้อนหลังกี่วัน */
const FIRST_VISIT = "-7 days";

/**
 * จุดตั้งต้นของ "ของใหม่" สำหรับการเข้าชมรอบนี้ (รูปแบบเดียวกับ created_at: 'YYYY-MM-DD HH:MM:SS' UTC)
 * คำนวณแบบเดียวกับ markWatchlistSeen — หน้าอ่านก่อน แล้ว client ค่อยบันทึก จึงได้ค่าเดียวกัน
 */
export async function getBriefBaseline(email: string): Promise<{ since: string; firstVisit: boolean }> {
  const db = getDb();
  try {
    const rs = await db.execute({
      sql: `SELECT CASE WHEN last_seen_at < datetime('now', ?) THEN last_seen_at ELSE NULLIF(baseline_at, '') END AS since
            FROM watchlist_seen WHERE email = ?`,
      args: [VISIT_GAP, norm(email)],
    });
    // baseline_at = '' แปลว่ายังอยู่ในการเข้าชมครั้งแรก (รีเฟรชภายใน 30 นาที) — ยังใช้ช่วง 7 วันเหมือนเดิม
    if (rs.rows.length > 0 && rs.rows[0].since != null) return { since: String(rs.rows[0].since), firstVisit: false };
  } catch {
    // ตารางยังไม่ถูกสร้าง (ยังไม่ได้รัน db:init) — ทำเหมือนเข้าครั้งแรก
  }
  const rs = await db.execute({ sql: "SELECT datetime('now', ?) AS since", args: [FIRST_VISIT] });
  return { since: String(rs.rows[0].since), firstVisit: true };
}

/** บันทึกว่าเปิดหน้าแล้ว — เรียกจาก client หลัง mount เท่านั้น (prefetch ไม่นับ เหมือน PageViewLogger) */
export async function markWatchlistSeen(email: string): Promise<void> {
  if (!watchlistAvailable) return;
  await getDb().execute({
    sql: `INSERT INTO watchlist_seen (email, baseline_at, last_seen_at) VALUES (?, '', datetime('now'))
          ON CONFLICT(email) DO UPDATE SET
            baseline_at = CASE WHEN last_seen_at < datetime('now', ?) THEN last_seen_at ELSE baseline_at END,
            last_seen_at = datetime('now')`,
    args: [norm(email), VISIT_GAP],
  });
}

export interface BriefInsight {
  slug: string;
  title: string;
  direction: string | null;
  magnitude: string | null;
  status: string;
}

export interface BriefEntry {
  ticker: string;
  /** รอบทบทวนล่าสุดที่เกิดหลัง since */
  review: {
    date: string;
    stance: string;
    /** สถานะก่อนช่วงนี้ — null ถ้าไม่มี หรือเป็นแผนของรายงานฉบับก่อน (ดู new_plan) */
    plan_from: string | null;
    plan_to: string | null;
    /** รอบนี้ทบทวนรายงานฉบับใหม่ — สถานะเดิมเป็นของแผนอีกชุด เอามาเทียบกันไม่ได้ */
    new_plan: boolean;
    action_md: string | null;
    price_move_pct: number | null;
    /** ผลตัดสินทฤษฎีเดิมของรอบนี้ นับตาม status */
    checks: Record<string, number>;
  } | null;
  /** รายงานที่ทำใหม่หลัง since (full/update — ไม่รวมรอบ review ที่ไม่ได้แตะ verdict) */
  run: { date: string; run_type: string; verdict_from: string | null; verdict_to: string | null } | null;
  /** insight ที่เปิดใหม่และรายงานล่าสุดของหุ้นนี้อ้างถึง */
  insights_new: BriefInsight[];
  /** insight ที่รายงานล่าสุดเคยอ้าง แต่เพิ่งถูกปิด (เกิดครบแล้ว / ถูกหักล้าง) */
  insights_closed: BriefInsight[];
  /** ใช้เรียง: ตัวที่ต้องอ่านก่อนมาก่อน */
  weight: number;
}

export interface WatchBrief {
  since: string;
  firstVisit: boolean;
  entries: BriefEntry[];
  /** insight ใหม่ทั้งระบบที่ไม่ผูกกับหุ้นที่ติดตาม — บอกแค่จำนวน */
  otherNewInsights: number;
}

const PLAN_WEIGHT: Record<string, number> = { "plan-broken": 40, "plan-live": 30, watch: 10, "no-action": 0 };

/**
 * รวมของใหม่ของหุ้นที่ติดตาม
 * insightSlugs = listLatestRunInsightSlugs() (cached ของกลาง) — ใช้ตัวเดียวกับชิป insight ในแถว จะได้ไม่ขัดกัน
 */
export async function getWatchBrief(
  tickers: string[],
  baseline: { since: string; firstVisit: boolean },
  insightSlugs: Record<string, string[]>
): Promise<WatchBrief> {
  const { since } = baseline;
  if (tickers.length === 0) return { ...baseline, entries: [], otherNewInsights: 0 };
  const db = getDb();
  const ph = tickers.map(() => "?").join(",");

  const [reviewsRs, runsRs, hintsRs] = await Promise.all([
    db.execute({
      sql: `SELECT id, ticker, review_date, base_run_id, stance, plan_status, action_md, price_move_pct, created_at
            FROM reviews WHERE ticker IN (${ph}) ORDER BY ticker, review_date DESC, id DESC`,
      args: tickers,
    }),
    db.execute({
      sql: `SELECT r.id, r.ticker, r.run_date, COALESCE(r.run_type, 'full') AS run_type, r.created_at, a.verdict
            FROM research_runs r LEFT JOIN analyses a ON a.run_id = r.id
            WHERE r.ticker IN (${ph}) ORDER BY r.ticker, r.run_date DESC, r.id DESC`,
      args: tickers,
    }),
    // ปิดแล้ว: last_checked_on เป็นวันที่ล้วน เทียบกับวันที่ของ since
    db.execute({
      sql: `SELECT slug, title, direction, magnitude, COALESCE(status, 'active') AS status, created_at, last_checked_on
            FROM hints
            WHERE (COALESCE(status, 'active') = 'active' AND created_at > ?)
               OR (COALESCE(status, 'active') <> 'active' AND last_checked_on >= date(?))`,
      args: [since, since],
    }),
  ]);

  type Row = Record<string, unknown>;
  const groupBy = (rows: Row[]) => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      const t = String(r.ticker);
      m.set(t, [...(m.get(t) ?? []), r]);
    }
    return m;
  };
  const reviewsBy = groupBy(reviewsRs.rows as Row[]);
  const runsBy = groupBy(runsRs.rows as Row[]);

  // นับผลตัดสินทฤษฎีของรอบทบทวนใหม่ทั้งหมดในคำสั่งเดียว
  const newReviewIds = [...reviewsBy.values()]
    .map((list) => list[0])
    .filter((r) => r && String(r.created_at) > since)
    .map((r) => Number(r.id));
  const checksBy = new Map<number, Record<string, number>>();
  if (newReviewIds.length > 0) {
    const rs = await db.execute({
      sql: `SELECT review_id, status, COUNT(*) AS n FROM thesis_checks
            WHERE review_id IN (${newReviewIds.map(() => "?").join(",")}) GROUP BY review_id, status`,
      args: newReviewIds,
    });
    for (const r of rs.rows) {
      const id = Number(r.review_id);
      checksBy.set(id, { ...(checksBy.get(id) ?? {}), [String(r.status)]: Number(r.n) });
    }
  }

  const hints = hintsRs.rows.map((h) => ({
    slug: String(h.slug),
    title: String(h.title),
    direction: h.direction == null ? null : String(h.direction),
    magnitude: h.magnitude == null ? null : String(h.magnitude),
    status: String(h.status),
  }));
  const usedSlugs = new Set<string>();

  const entries: BriefEntry[] = [];
  for (const t of tickers) {
    const revs = reviewsBy.get(t) ?? [];
    const latestRev = revs[0];
    let review: BriefEntry["review"] = null;
    if (latestRev && String(latestRev.created_at) > since) {
      // "จาก" = สถานะก่อนช่วงนี้ ไม่ใช่รอบก่อนหน้าติดกัน — ถ้าในช่วงนี้มีหลายรอบ จะได้เห็นการเปลี่ยนสุทธิ
      const before = revs.find((r) => String(r.created_at) <= since);
      const newPlan = !!before && before.base_run_id !== latestRev.base_run_id;
      review = {
        date: String(latestRev.review_date),
        stance: String(latestRev.stance),
        plan_from: newPlan || before?.plan_status == null ? null : String(before.plan_status),
        new_plan: newPlan,
        plan_to: latestRev.plan_status == null ? null : String(latestRev.plan_status),
        action_md: latestRev.action_md == null ? null : String(latestRev.action_md),
        price_move_pct: latestRev.price_move_pct == null ? null : Number(latestRev.price_move_pct),
        checks: checksBy.get(Number(latestRev.id)) ?? {},
      };
    }

    const runs = (runsBy.get(t) ?? []).filter((r) => r.run_type !== "review");
    const latestRun = runs[0];
    let run: BriefEntry["run"] = null;
    if (latestRun && String(latestRun.created_at) > since) {
      const before = runs.find((r) => String(r.created_at) <= since);
      run = {
        date: String(latestRun.run_date),
        run_type: String(latestRun.run_type),
        verdict_from: before?.verdict == null ? null : String(before.verdict),
        verdict_to: latestRun.verdict == null ? null : String(latestRun.verdict),
      };
    }

    const slugs = new Set(insightSlugs[t] ?? []);
    const mine = hints.filter((h) => slugs.has(h.slug));
    mine.forEach((h) => usedSlugs.add(h.slug));
    const insights_new = mine.filter((h) => h.status === "active");
    const insights_closed = mine.filter((h) => h.status !== "active");

    if (!review && !run && insights_new.length === 0 && insights_closed.length === 0) continue;

    let weight = 0;
    if (review) {
      if (review.new_plan) weight += 5 + (PLAN_WEIGHT[review.plan_to ?? ""] ?? 0);
      else if (review.plan_from !== review.plan_to) weight += 20 + (PLAN_WEIGHT[review.plan_to ?? ""] ?? 0);
      if (review.stance === "escalate") weight += 25;
      if ((review.checks.broken ?? 0) > 0) weight += 15;
      weight += 2;
    }
    if (run) weight += run.verdict_from && run.verdict_from !== run.verdict_to ? 30 : 5;
    weight += insights_closed.length * 8 + insights_new.length * 6;

    entries.push({ ticker: t, review, run, insights_new, insights_closed, weight });
  }
  entries.sort((a, b) => b.weight - a.weight || a.ticker.localeCompare(b.ticker));

  const otherNewInsights = hints.filter((h) => h.status === "active" && !usedSlugs.has(h.slug)).length;
  return { ...baseline, entries, otherNewInsights };
}
