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
  `CREATE INDEX IF NOT EXISTS idx_runs_ticker ON research_runs(ticker, run_date)`,

  `CREATE INDEX IF NOT EXISTS idx_items_run ON research_items(run_id)`,
  `CREATE INDEX IF NOT EXISTS idx_analyses_run ON analyses(run_id)`,
  `CREATE INDEX IF NOT EXISTS idx_theories_run ON theories(run_id)`,
];

// ALTER สำหรับ DB เก่าที่สร้างก่อน column ใหม่ — รันด้วย try/catch (ซ้ำ = ข้าม)
export const MIGRATIONS = [
  `ALTER TABLE research_runs ADD COLUMN details_json TEXT`,
  `ALTER TABLE research_runs ADD COLUMN entry_plan_json TEXT`,
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
}
