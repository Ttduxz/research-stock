/**
 * สรุปก่อนเปิดตลาดสำหรับหุ้นที่ติดตาม (watchlist) — อ่านจาก DB อย่างเดียว ไม่ค้นเว็บ ไม่ใช้ agent
 *
 * Usage: node scripts/watch-brief.mjs [--email=<email>] [--all] [--days=7] [--json]
 *   --email  = watchlist ของอีเมลนี้ (ค่าเริ่มต้น: อีเมลแรกใน env ADMIN_EMAILS)
 *   --all    = รวม watchlist ของทุกคน (ไม่พิมพ์อีเมลใครออกมา)
 *   --days   = ช่วง "ใหม่" ย้อนหลังกี่วัน (ค่าเริ่มต้น 7)
 *   --json   = พิมพ์ JSON แทนข้อความ
 *
 * โครงจากแนวคิด pre-meeting ของ plugin Claude for Financial Advisors (snapshot → สิ่งที่เปลี่ยน → เรื่องที่ต้องตาม)
 * ปรับเป็น "อ่านก่อนเปิดตลาด": ต้องทำอะไรไหม / อะไรเปลี่ยนจากรอบก่อน / ราคาเข้าโซนไหน / insight ที่กระทบ / ค้างทบทวน
 * ราคามาจาก price-delta.mjs (เกณฑ์แข็งชุดเดียวกับรอบทบทวน) — ไม่คำนวณซ้ำที่นี่
 *
 * ข้อมูล watchlist ผูกกับอีเมล: สคริปต์นี้รันในเครื่องเจ้าของระบบเท่านั้น ไม่มีส่วนไหนถูก export หรือแสดงบนเว็บ
 */
import { execFileSync } from "node:child_process";
import { applySchema } from "./schema.mjs";
import { openDb } from "./db-client.mjs";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const all = args.includes("--all");
const emailArg = args.find((a) => a.startsWith("--email="))?.split("=")[1];
const daysArg = Number(args.find((a) => a.startsWith("--days="))?.split("=")[1]);
const days = Number.isFinite(daysArg) && daysArg > 0 ? daysArg : 7;
// วันที่ตามเวลาเครื่อง ไม่ใช่ UTC — รันตอนเช้าไทยแล้ววันที่ต้องเป็นวันนี้
const localDate = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const today = localDate(new Date());
const since = localDate(new Date(Date.now() - days * 86400000));

const PLAN = { "no-action": "ยังไม่ต้องทำอะไร", watch: "รอดู", "plan-live": "ราคาเข้าโซนของแผน", "plan-broken": "แผนเดิมใช้ไม่ได้" };
const STANCE = { same: "ยืนยันเดิม", shifted: "น้ำหนักเปลี่ยน", escalate: "ต้องวิเคราะห์ใหม่" };
const HINT_STATUS = { "played-out": "เกิดขึ้นครบแล้ว", invalidated: "ถูกหักล้างแล้ว" };

const db = openDb();
await applySchema(db);
const parse = (v) => {
  try {
    return v == null ? null : JSON.parse(v);
  } catch {
    return null;
  }
};

try {
  // ---- 1. ticker ที่ติดตาม ----
  let tickers;
  if (all) {
    tickers = (await db.execute("SELECT DISTINCT ticker FROM watchlist ORDER BY ticker")).rows.map((r) => String(r.ticker));
  } else {
    const email = (emailArg ?? process.env.ADMIN_EMAILS?.split(",")[0] ?? "").trim().toLowerCase();
    if (!email) {
      console.error("ไม่รู้จะดู watchlist ของใคร — ใส่ --email=<email> หรือตั้ง ADMIN_EMAILS ใน .env หรือใช้ --all");
      process.exit(1);
    }
    tickers = (
      await db.execute({ sql: "SELECT ticker FROM watchlist WHERE email = ? ORDER BY ticker", args: [email] })
    ).rows.map((r) => String(r.ticker));
  }
  if (tickers.length === 0) {
    if (asJson) console.log(JSON.stringify({ date: today, tickers: [], sections: {} }));
    else console.log("watchlist ว่าง — กด ☆ ที่หน้าหุ้นบนเว็บก่อน");
    process.exit(0);
  }

  // ---- 2. ราคา + เกณฑ์แข็ง (สคริปต์เดิม) ----
  let delta = [];
  try {
    delta = JSON.parse(execFileSync("node", ["scripts/price-delta.mjs", ...tickers, "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }));
  } catch {
    console.error("⚠ price-delta.mjs ล้มเหลว — สรุปโดยไม่มีราคา");
  }
  const byTicker = new Map(delta.map((d) => [d.ticker, d]));

  // ---- 3. รอบทบทวน 2 ครั้งล่าสุด + รายงานล่าสุด + verdict ----
  const placeholders = tickers.map(() => "?").join(",");
  const reviews = (
    await db.execute({
      sql: `SELECT ticker, review_date, stance, plan_status, action_md, data_quality_md FROM reviews
            WHERE ticker IN (${placeholders}) ORDER BY ticker, review_date DESC, id DESC`,
      args: tickers,
    })
  ).rows;
  const revs = new Map();
  for (const r of reviews) {
    const list = revs.get(r.ticker) ?? [];
    if (list.length < 2) list.push(r);
    revs.set(r.ticker, list);
  }
  const runs = (
    await db.execute({
      sql: `SELECT r.ticker, r.run_date, r.run_type, r.id, a.verdict, a.risk_level
            FROM research_runs r LEFT JOIN analyses a ON a.run_id = r.id
            WHERE r.ticker IN (${placeholders})
              AND r.id = (SELECT id FROM research_runs WHERE ticker = r.ticker ORDER BY run_date DESC, id DESC LIMIT 1)`,
      args: tickers,
    })
  ).rows;
  const runBy = new Map(runs.map((r) => [r.ticker, r]));
  const names = new Map(
    (await db.execute({ sql: `SELECT ticker, name FROM stocks WHERE ticker IN (${placeholders})`, args: tickers })).rows.map((r) => [r.ticker, r.name])
  );

  // ---- 4. insight: ที่เพิ่งปิด (กระทบหุ้นที่เคยอ้าง) + ที่เพิ่งเปิดใหม่ ----
  const closedHints = (
    await db.execute({
      sql: `SELECT slug, title, status, status_md, last_checked_on FROM hints
            WHERE COALESCE(status,'active') <> 'active' AND COALESCE(last_checked_on, run_date) >= ?`,
      args: [since],
    })
  ).rows;
  const closedExposure = [];
  for (const h of closedHints) {
    const pattern = `%/insights/${h.slug}%`;
    const rs = await db.execute({
      sql: `SELECT DISTINCT r.ticker FROM research_runs r
            LEFT JOIN analyses a ON a.run_id = r.id LEFT JOIN theories t ON t.run_id = r.id
            WHERE r.ticker IN (${placeholders})
              AND r.id = (SELECT id FROM research_runs WHERE ticker = r.ticker ORDER BY run_date DESC, id DESC LIMIT 1)
              AND (r.summary_md LIKE ? OR r.entry_plan_json LIKE ? OR a.content_md LIKE ? OR a.key_points LIKE ?
                   OR t.thesis_md LIKE ? OR t.assumptions LIKE ? OR t.catalysts LIKE ? OR t.risks LIKE ? OR t.scenarios LIKE ?)`,
      args: [...tickers, ...Array(9).fill(pattern)],
    });
    const exposed = rs.rows.map((r) => String(r.ticker));
    if (exposed.length) closedExposure.push({ slug: h.slug, title: h.title, status: h.status, status_md: h.status_md, tickers: exposed });
  }
  const newHints = (
    await db.execute({
      sql: `SELECT slug, title, dek, direction, magnitude, run_date, discovered_from FROM hints
            WHERE run_date >= ? AND COALESCE(status,'active') = 'active' ORDER BY impact_score DESC NULLS LAST, run_date DESC`,
      args: [since],
    })
  ).rows;

  // ---- 5. จัดหมวด ----
  const sections = { act: [], changed: [], price: [], stale: [], quiet: [] };
  for (const t of tickers) {
    const d = byTicker.get(t) ?? null;
    const [latest, prev] = revs.get(t) ?? [];
    const run = runBy.get(t) ?? null;
    const row = {
      ticker: t,
      name: names.get(t) ?? null,
      verdict: run?.verdict ?? null,
      last_run: run ? { date: run.run_date, type: run.run_type ?? "full" } : null,
      review: latest ? { date: latest.review_date, stance: latest.stance, plan_status: latest.plan_status, action_md: latest.action_md, data_quality_md: latest.data_quality_md } : null,
      prev_plan_status: prev?.plan_status ?? null,
      price: d ? { now: d.price, move_pct: d.move_pct, baseline_from: d.baseline_from, tranche_hit: d.tranche_hit, target_hit: d.target_hit, suspicious: d.price_suspicious, reasons: d.escalate_reasons } : null,
      days_since_activity: d?.days_since_activity ?? null,
    };
    if (!run) {
      sections.stale.push({ ...row, why: "ยังไม่เคย research" });
      continue;
    }
    const ps = latest?.plan_status ?? null;
    const mustAct = ps === "plan-live" || ps === "plan-broken" || latest?.stance === "escalate";
    const changed = latest && latest.review_date >= since && prev && prev.plan_status !== latest.plan_status;
    const priceEvent = d && !d.price_suspicious && (d.tranche_hit || d.target_hit || (d.move_pct != null && Math.abs(d.move_pct) >= 7));
    const stale = d && d.days_since_activity != null && d.days_since_activity >= 7;
    if (mustAct) sections.act.push(row);
    else if (changed) sections.changed.push({ ...row, from: prev.plan_status, to: ps });
    else if (priceEvent) sections.price.push(row);
    else if (stale) sections.stale.push({ ...row, why: `ค้างทบทวน ${d.days_since_activity} วัน` });
    else sections.quiet.push(row);
    // ตัวที่ต้องทำอะไรอยู่แล้วก็ยังอาจค้างทบทวนด้วย — บอกไว้ในบรรทัดของมันเอง ไม่ใส่ซ้ำสองหมวด
  }

  const out = { date: today, since, tickers, sections, insights: { closed_affecting: closedExposure, new: newHints } };
  if (asJson) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  // ---- 6. พิมพ์ ----
  const fmtPrice = (p) => {
    if (!p || p.now == null) return "ราคา -";
    const mv = p.move_pct == null ? "" : ` (${p.move_pct > 0 ? "+" : ""}${p.move_pct}% จาก${p.baseline_from})`;
    return `ราคา ${p.now.toFixed(2)}${mv}${p.suspicious ? " ⚠ ราคาน่าสงสัย" : ""}`;
  };
  const line = (r) => {
    const bits = [`${r.ticker}${r.name ? ` (${r.name})` : ""}`, fmtPrice(r.price)];
    if (r.price?.tranche_hit) bits.push(`อยู่ในโซนไม้ ${r.price.tranche_hit.level} ${r.price.tranche_hit.price_range}`);
    if (r.price?.target_hit) bits.push(r.price.target_hit === "bull" ? "แตะเป้า bull แล้ว" : "หลุดเป้า bear แล้ว");
    if (r.review) bits.push(`ทบทวน ${r.review.date}: ${STANCE[r.review.stance] ?? r.review.stance} · ${PLAN[r.review.plan_status] ?? r.review.plan_status ?? "-"}`);
    if (r.days_since_activity != null && r.days_since_activity >= 7) bits.push(`ค้างทบทวน ${r.days_since_activity} วัน`);
    return `- ${bits.join(" · ")}`;
  };
  const detail = (r) => (r.review?.action_md ? `    → ${r.review.action_md}\n` : "");

  console.log(`# สรุปก่อนเปิดตลาด ${today} — ติดตาม ${tickers.length} ตัว (ของใหม่นับตั้งแต่ ${since})\n`);

  console.log(`## 1. ต้องทำอะไรตามแผนเดิมไหม (${sections.act.length})`);
  if (!sections.act.length) console.log("ไม่มี — ไม่มีตัวไหนที่ราคาเข้าโซนของแผนหรือแผนพัง");
  for (const r of sections.act) process.stdout.write(line(r) + "\n" + detail(r));

  console.log(`\n## 2. สถานะเปลี่ยนจากรอบก่อน (${sections.changed.length})`);
  if (!sections.changed.length) console.log("ไม่มี");
  for (const r of sections.changed) process.stdout.write(`${line(r)} · ${PLAN[r.from] ?? r.from} → ${PLAN[r.to] ?? r.to}\n` + detail(r));

  console.log(`\n## 3. ราคาขยับถึงเกณฑ์แต่ยังไม่ได้ทบทวน (${sections.price.length})`);
  if (!sections.price.length) console.log("ไม่มี");
  for (const r of sections.price) process.stdout.write(line(r) + (r.price?.reasons?.length ? `\n    เกณฑ์: ${r.price.reasons.join(" / ")}` : "") + "\n");

  console.log(`\n## 4. insight ที่กระทบหุ้นที่ติดตาม`);
  if (!closedExposure.length && !newHints.length) console.log("ไม่มี");
  for (const h of closedExposure)
    console.log(`- ปิดแล้ว (${HINT_STATUS[h.status] ?? h.status}): ${h.title} → เคยถูกใช้ในรายงานของ ${h.tickers.join(", ")} — รายงานพวกนี้ควรถูกทบทวนรอบหน้า /insights/${h.slug}`);
  for (const h of newHints)
    console.log(`- ใหม่ (${h.direction ?? "?"}/${h.magnitude ?? "?"}, ${h.run_date}): ${h.title}${h.dek ? ` — ${h.dek}` : ""} /insights/${h.slug}`);

  console.log(`\n## 5. ค้างทบทวน / ยังไม่มีรายงาน (${sections.stale.length})`);
  if (!sections.stale.length) console.log("ไม่มี");
  for (const r of sections.stale) console.log(`${line(r)} · ${r.why}`);

  console.log(`\n## 6. ไม่มีอะไรเปลี่ยน (${sections.quiet.length})`);
  console.log(sections.quiet.length ? sections.quiet.map((r) => r.ticker).join(", ") : "-");

  const doubts = tickers.filter((t) => revs.get(t)?.[0]?.data_quality_md && !/^ไม่มี/.test(revs.get(t)[0].data_quality_md.trim()));
  if (doubts.length) console.log(`\nข้อมูลที่รอบทบทวนล่าสุดยังสงสัย: ${doubts.join(", ")} (ดูในหน้าหุ้น › ทบทวนล่าสุด)`);
  console.log("\nเนื้อหาเป็นการศึกษา ไม่ใช่คำแนะนำการลงทุน");
} finally {
  db.close();
}
