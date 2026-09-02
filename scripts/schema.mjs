export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS stocks (
    ticker     TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    exchange   TEXT,
    sector     TEXT,
    currency   TEXT NOT NULL DEFAULT 'USD',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS research_runs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker       TEXT NOT NULL REFERENCES stocks(ticker),
    run_date     TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'complete',
    summary_md   TEXT,
    price_at_run REAL,
    details_json TEXT,
    entry_plan_json TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS research_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id       INTEGER NOT NULL REFERENCES research_runs(id),
    ticker       TEXT NOT NULL,
    category     TEXT NOT NULL,
    title        TEXT NOT NULL,
    url          TEXT,
    source       TEXT,
    published_at TEXT,
    content_md   TEXT NOT NULL,
    importance   INTEGER NOT NULL DEFAULT 3
  )`,
  `CREATE TABLE IF NOT EXISTS analyses (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id             INTEGER NOT NULL REFERENCES research_runs(id),
    ticker             TEXT NOT NULL,
    verdict            TEXT NOT NULL,
    fundamentals_score INTEGER,
    momentum_score     INTEGER,
    risk_level         TEXT,
    key_points         TEXT,
    content_md         TEXT NOT NULL,
    created_at         TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS theories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id      INTEGER NOT NULL REFERENCES research_runs(id),
    ticker      TEXT NOT NULL,
    title       TEXT NOT NULL,
    thesis_md   TEXT NOT NULL,
    assumptions TEXT,
    catalysts   TEXT,
    risks       TEXT,
    scenarios   TEXT,
    confidence  INTEGER,
    horizon     TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS hints (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    slug            TEXT UNIQUE NOT NULL,
    title           TEXT NOT NULL,
    dek             TEXT,
    direction       TEXT,
    magnitude       TEXT,
    discovered_from TEXT,
    run_date        TEXT NOT NULL,
    stats_json      TEXT,
    content_md      TEXT NOT NULL,
    opinion_md      TEXT,
    sources_json    TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE INDEX IF NOT EXISTS idx_runs_ticker ON research_runs(ticker, run_date)`,

  `CREATE INDEX IF NOT EXISTS idx_items_run ON research_items(run_id)`,
  `CREATE INDEX IF NOT EXISTS idx_analyses_run ON analyses(run_id)`,
  `CREATE INDEX IF NOT EXISTS idx_theories_run ON theories(run_id)`,
  `CREATE INDEX IF NOT EXISTS idx_hints_run_date ON hints(run_date)`,
];

// ALTER สำหรับ DB เก่าที่สร้างก่อน column ใหม่ — รันด้วย try/catch (ซ้ำ = ข้าม)
export const MIGRATIONS = [
  `ALTER TABLE research_runs ADD COLUMN details_json TEXT`,
  `ALTER TABLE research_runs ADD COLUMN entry_plan_json TEXT`,
  // hints เคยมีแค่ severity (risk-high/mid/low) — เปลี่ยนเป็น direction+magnitude ให้จับเรื่องบวกได้ด้วย ไม่ใช่แค่ความเสี่ยง
  `ALTER TABLE hints ADD COLUMN direction TEXT`,
  `ALTER TABLE hints ADD COLUMN magnitude TEXT`,
];

// backfill ครั้งเดียว: แถวเก่าที่ยังมีแค่ severity (คอลัมน์เก่า ไม่ได้อยู่ใน SCHEMA แล้วแต่ยังอยู่ใน DB จริงถ้าเคยสร้างไว้)
// ให้ direction/magnitude ที่ยังว่าง — ปลอดภัยรันซ้ำได้เพราะเช็ค WHERE direction IS NULL
const BACKFILL = [
  `UPDATE hints SET direction = 'negative',
     magnitude = CASE severity
       WHEN 'risk-high' THEN 'high'
       WHEN 'risk-mid' THEN 'mid'
       WHEN 'risk-low' THEN 'low'
       ELSE NULL END
   WHERE direction IS NULL AND severity IS NOT NULL`,
];

export async function applySchema(db) {
  for (const stmt of SCHEMA) await db.execute(stmt);
  for (const stmt of MIGRATIONS) {
    try {
      await db.execute(stmt);
    } catch (err) {
      if (!/duplicate column/i.test(String(err))) throw err;
    }
  }
  for (const stmt of BACKFILL) {
    try {
      await db.execute(stmt);
    } catch (err) {
      // DB ใหม่ที่ไม่เคยมีคอลัมน์ severity เลย — ไม่มีอะไรต้อง backfill ข้ามได้
      if (!/no such column/i.test(String(err))) throw err;
    }
  }
}
