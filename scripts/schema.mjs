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
    impact_score    INTEGER,
    discovered_from TEXT,
    run_date        TEXT NOT NULL,
    stats_json      TEXT,
    content_md      TEXT NOT NULL,
    opinion_md      TEXT,
    sources_json    TEXT,
    visuals_json    TEXT,
    glossary_json   TEXT,
    tldr_md         TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS reviews (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker          TEXT NOT NULL REFERENCES stocks(ticker),
    review_date     TEXT NOT NULL,
    base_run_id     INTEGER REFERENCES research_runs(id),
    stance          TEXT NOT NULL,
    review_md       TEXT NOT NULL,
    price_at_review REAL,
    price_move_pct  REAL,
    escalated_by    TEXT,
    escalate_reason TEXT,
    action_md       TEXT,
    plan_status     TEXT,
    alternatives_md TEXT,
    data_quality_md TEXT,
    resulting_run_id INTEGER REFERENCES research_runs(id),
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS thesis_checks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker        TEXT NOT NULL,
    review_id     INTEGER NOT NULL REFERENCES reviews(id),
    origin_run_id INTEGER REFERENCES research_runs(id),
    theory_title  TEXT,
    claim_type    TEXT NOT NULL,
    claim         TEXT NOT NULL,
    status        TEXT NOT NULL,
    evidence_md   TEXT,
    sources_json  TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  )`,


  // log การเข้าใช้เว็บ (Google login) — ไม่อยู่ใน export-db.mjs ตั้งใจ ไม่ให้อีเมลผู้ใช้หลุดไปกับ snapshot
  `CREATE TABLE IF NOT EXISTS access_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    email       TEXT NOT NULL,
    name        TEXT,
    event       TEXT NOT NULL,
    path        TEXT,
    user_agent  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // หุ้นที่แต่ละคนกด ☆ ติดตาม (หน้า /watchlist) — ผูกกับอีเมลเหมือน access_logs จึงไม่อยู่ใน export-db.mjs ตั้งใจ
  // และไม่ผ่าน lib/cached.ts (ต่างกันรายคน + ต้องเห็นผลทันทีหลังกด)
  `CREATE TABLE IF NOT EXISTS watchlist (
    email      TEXT NOT NULL,
    ticker     TEXT NOT NULL REFERENCES stocks(ticker),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (email, ticker)
  )`,

  // คำขอให้วิเคราะห์หุ้นที่ยังไม่มีในระบบ — ผูกอีเมลเหมือน watchlist จึงไม่อยู่ใน export-db.mjs และไม่ผ่าน lib/cached.ts
  // "วิเคราะห์แล้ว" ไม่ต้องเก็บสถานะ: ดูจากว่า ticker มีในตาราง stocks แล้วหรือยัง
  `CREATE TABLE IF NOT EXISTS stock_requests (
    email      TEXT NOT NULL,
    ticker     TEXT NOT NULL,
    note       TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (email, ticker)
  )`,

  `CREATE INDEX IF NOT EXISTS idx_runs_ticker ON research_runs(ticker, run_date)`,
  `CREATE INDEX IF NOT EXISTS idx_access_email ON access_logs(email, created_at)`,

  `CREATE INDEX IF NOT EXISTS idx_items_run ON research_items(run_id)`,
  `CREATE INDEX IF NOT EXISTS idx_analyses_run ON analyses(run_id)`,
  `CREATE INDEX IF NOT EXISTS idx_theories_run ON theories(run_id)`,
  `CREATE INDEX IF NOT EXISTS idx_hints_run_date ON hints(run_date)`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_ticker ON reviews(ticker, review_date)`,
  `CREATE INDEX IF NOT EXISTS idx_checks_review ON thesis_checks(review_id)`,
  `CREATE INDEX IF NOT EXISTS idx_checks_ticker ON thesis_checks(ticker, status)`,
];

// ALTER สำหรับ DB เก่าที่สร้างก่อน column ใหม่ — รันด้วย try/catch (ซ้ำ = ข้าม)
export const MIGRATIONS = [
  `ALTER TABLE research_runs ADD COLUMN details_json TEXT`,
  `ALTER TABLE research_runs ADD COLUMN entry_plan_json TEXT`,
  // hints เคยมีแค่ severity (risk-high/mid/low) — เปลี่ยนเป็น direction+magnitude ให้จับเรื่องบวกได้ด้วย ไม่ใช่แค่ความเสี่ยง
  `ALTER TABLE hints ADD COLUMN direction TEXT`,
  `ALTER TABLE hints ADD COLUMN magnitude TEXT`,
  // magnitude เป็นแค่ 3 ระดับ (high/mid/low) จัดลำดับละเอียดไม่ได้เวลามีหลาย hint ระดับเดียวกัน
  // impact_score (1-100) ให้จัดอันดับละเอียดขึ้น ใช้เลือก "3 อันดับ impact สูงสุด" ในหน้าแรก
  `ALTER TABLE hints ADD COLUMN impact_score INTEGER`,
  // รอบติดตามรายสัปดาห์ (ดู .claude/commands/review-stock.md) — run ผูกกันเป็นสายแทนที่จะเป็นเกาะแยก
  // run_type: 'full' (pipeline เต็ม) | 'update' (reviewer + analyst/theorist) | 'review' (reviewer อย่างเดียว)
  `ALTER TABLE research_runs ADD COLUMN run_type TEXT`,
  `ALTER TABLE research_runs ADD COLUMN prev_run_id INTEGER`,
  `ALTER TABLE research_runs ADD COLUMN delta_json TEXT`,
  // research_items เปลี่ยนจาก 'ของรอบนั้น' เป็นคลังระดับ ticker ที่มีอายุขัย:
  // run_id = รอบที่เจอครั้งแรก, last_seen_run_id = รอบล่าสุดที่ยังเจอ, status = active|archived|superseded
  `ALTER TABLE research_items ADD COLUMN last_seen_run_id INTEGER`,
  `ALTER TABLE research_items ADD COLUMN status TEXT`,
  `ALTER TABLE research_items ADD COLUMN superseded_by INTEGER`,
  `ALTER TABLE research_items ADD COLUMN first_seen_on TEXT`,
  `ALTER TABLE research_items ADD COLUMN last_seen_on TEXT`,
  // index นี้อยู่ท้าย MIGRATIONS ไม่ใช่ใน SCHEMA เพราะอ้างคอลัมน์ status ที่เพิ่งถูก ALTER เพิ่มด้านบน
  `ALTER TABLE reviews ADD COLUMN action_md TEXT`,
  `ALTER TABLE reviews ADD COLUMN plan_status TEXT`,
  // 2 ช่องจากแนวคิด Rebalance Rationale Memo (plugin Claude for Financial Advisors):
  // alternatives_md = ทางเลือกที่พิจารณาแล้ว "ไม่เลือก" และเพราะอะไร (อิงแผนเดิม — กันการตัดสินใจโดยไม่ได้ชั่งทางเลือก)
  // data_quality_md = ข้อมูลที่ยังสงสัย/ช่องว่างหลักฐานของรอบนี้ (คนอ่านต้องรู้ว่าคำตัดสินนี้ยืนบนข้อมูลแค่ไหน)
  `ALTER TABLE reviews ADD COLUMN alternatives_md TEXT`,
  `ALTER TABLE reviews ADD COLUMN data_quality_md TEXT`,
  // คำอธิบาย 4 ช่องของผลตัดสินแต่ละข้อ (หน้า /track-record): "เคยบอกว่าถ้า X → จะส่งผล Y / ตอนนี้ Z เพราะ → ส่งผลให้ U"
  // claim ยังเป็นข้อความเดิมตรงตัวเหมือนเดิม — 4 ช่องนี้เป็นแค่ชั้นอธิบายภาษาคน then_md ต้องมาจากทฤษฎีเดิมเท่านั้น
  `ALTER TABLE thesis_checks ADD COLUMN if_md TEXT`,
  `ALTER TABLE thesis_checks ADD COLUMN then_md TEXT`,
  `ALTER TABLE thesis_checks ADD COLUMN because_md TEXT`,
  `ALTER TABLE thesis_checks ADD COLUMN so_md TEXT`,
  // ผลตรวจนี้ดีหรือร้ายต่อหุ้น (good | bad | mixed) — เดาจาก claim_type + status ไม่ได้ เพราะ risk บางข้อคือ
  // "ความเสี่ยงที่ทฤษฎีจะผิด" (เช่นทฤษฎีมองลบ) ซึ่งถ้าเกิดจริงกลับดีต่อหุ้น — null ได้เฉพาะ too-early
  `ALTER TABLE thesis_checks ADD COLUMN impact TEXT`,
  // ไม่เก็บ IP ของผู้ใช้แล้ว (privacy) — ลบทั้งคอลัมน์และข้อมูลเก่า ไม่ใช่แค่หยุดเขียน
  // DB ใหม่ที่สร้างจาก SCHEMA ไม่มีคอลัมน์นี้อยู่แล้ว → เจอ "no such column" ซึ่ง applySchema ข้ามให้
  `ALTER TABLE access_logs DROP COLUMN ip`,
  // อายุขัยของ hint (ดู .claude/commands/review-hints.md): active = ยังมีผล | played-out = เกิดขึ้นครบแล้ว | invalidated = ถูกหักล้างแล้ว
  // hint ที่ไม่ active ต้องไม่ถูกเอาไปปรับการวิเคราะห์หุ้นตัวอื่นในขั้น 2.6 อีก — รายงานเดิมเก็บไว้ตามที่เขียน ไม่ลบ
  `ALTER TABLE hints ADD COLUMN status TEXT`,
  `ALTER TABLE hints ADD COLUMN status_md TEXT`,
  `ALTER TABLE hints ADD COLUMN status_sources_json TEXT`,
  `ALTER TABLE hints ADD COLUMN last_checked_on TEXT`,
  // ชั้น "อ่านให้เข้าใจ" ของรายงาน hint (ดู scripts/hint-visuals.mjs): visuals = สเปกภาพประกอบที่เว็บวาดเอง
  // (agent ห้ามส่ง SVG/HTML), glossary = ศัพท์การเงินที่ต้องรู้ก่อนอ่าน, tldr = สรุป 2-4 บรรทัดภาษาคน
  // ตัวเลขทุกตัวในภาพต้องมีในเนื้อหาอยู่แล้ว — ภาพเป็นแค่การ "ทำให้เห็น" ไม่ใช่แหล่งข้อมูลใหม่
  `ALTER TABLE hints ADD COLUMN visuals_json TEXT`,
  `ALTER TABLE hints ADD COLUMN glossary_json TEXT`,
  `ALTER TABLE hints ADD COLUMN tldr_md TEXT`,
  `CREATE INDEX IF NOT EXISTS idx_items_ticker ON research_items(ticker, status)`,
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
  // ค่าเริ่มต้นคร่าวๆ จาก magnitude สำหรับแถวที่ไม่มี impact_score (เช่น hint เก่าก่อนมีคอลัมน์นี้)
  // ค่าที่ hint-analyst ประเมินเองตอน ingest จะแม่นกว่านี้เสมอ — นี่แค่กันไม่ให้เป็น NULL เฉยๆ
  `UPDATE hints SET impact_score = CASE magnitude
     WHEN 'high' THEN 70
     WHEN 'mid' THEN 45
     WHEN 'low' THEN 20
     ELSE 45 END
   WHERE impact_score IS NULL`,
  // แถวเก่าก่อนมีระบบรอบติดตาม: ทุก run ที่มีอยู่คือ full run, ทุก item ยัง active
  `UPDATE research_runs SET run_type = 'full' WHERE run_type IS NULL`,
  `UPDATE research_items SET status = 'active' WHERE status IS NULL`,
  `UPDATE research_items SET last_seen_run_id = run_id WHERE last_seen_run_id IS NULL`,
  `UPDATE research_items SET first_seen_on = (SELECT run_date FROM research_runs WHERE id = research_items.run_id)
   WHERE first_seen_on IS NULL`,
  `UPDATE research_items SET last_seen_on = first_seen_on WHERE last_seen_on IS NULL`,
  // hint ที่มีอยู่ก่อนมีระบบทบทวน = ยังไม่เคยถูกตัดสินว่าจบ/ถูกหักล้าง → active
  `UPDATE hints SET status = 'active' WHERE status IS NULL`,
];

export async function applySchema(db) {
  for (const stmt of SCHEMA) await db.execute(stmt);
  for (const stmt of MIGRATIONS) {
    try {
      await db.execute(stmt);
    } catch (err) {
      // duplicate column = ADD COLUMN ที่เคยรันแล้ว · no such column = DROP COLUMN ที่เคยรันแล้ว
      if (!/duplicate column|no such column/i.test(String(err))) throw err;
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
