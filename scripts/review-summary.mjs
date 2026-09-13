/**
 * สรุปผลรอบทบทวนของวันหนึ่ง — ใช้ปิดท้าย /review-week
 *
 * Usage: node scripts/review-summary.mjs [YYYY-MM-DD]   (ไม่ใส่ = วันนี้)
 *
 * อ่านจาก DB ตรงๆ แทนที่จะให้ orchestrator จำผลของทุก ticker ไว้ใน context
 * — รันครบ 29 ตัวแล้วสรุปจากตรงนี้ทีเดียว แม่นกว่าและไม่กินที่
 */
import { applySchema } from "./schema.mjs";
import { openDb } from "./db-client.mjs";

const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const db = openDb();
await applySchema(db);

const STANCE = {
  same: "ยืนยันเดิม",
  shifted: "น้ำหนักเปลี่ยน",
  escalate: "ต้องวิเคราะห์ใหม่",
};
const PLAN = {
  "no-action": "ยังไม่ต้องทำอะไร",
  watch: "รอดู",
  "plan-live": "ราคาเข้าโซนซื้อ",
  "plan-broken": "แผนใช้ไม่ได้",
};

try {
  const reviews = (
    await db.execute({
      sql: `SELECT id, ticker, stance, plan_status, action_md, price_move_pct
            FROM reviews WHERE review_date = ? ORDER BY
              CASE stance WHEN 'escalate' THEN 0 WHEN 'shifted' THEN 1 ELSE 2 END, ticker`,
      args: [date],
    })
  ).rows;

  if (reviews.length === 0) {
    console.log(`ไม่มีรอบทบทวนของวันที่ ${date}`);
    process.exit(0);
  }

  const ids = reviews.map((r) => Number(r.id));
  const checks = (
    await db.execute(
      `SELECT review_id, status, COUNT(*) n FROM thesis_checks
       WHERE review_id IN (${ids.join(",")}) GROUP BY review_id, status`
    )
  ).rows;
  const tally = new Map();
  for (const c of checks) {
    const m = tally.get(Number(c.review_id)) ?? {};
    m[c.status] = Number(c.n);
    tally.set(Number(c.review_id), m);
  }

  const byStance = { same: 0, shifted: 0, escalate: 0 };
  console.log(`\nรอบทบทวนวันที่ ${date} — ${reviews.length} ตัว\n`);
  for (const r of reviews) {
    byStance[r.stance] = (byStance[r.stance] ?? 0) + 1;
    const t = tally.get(Number(r.id)) ?? {};
    const marks = [
      t.confirmed ? `✓${t.confirmed}` : null,
      t.weakened ? `!${t.weakened}` : null,
      t.broken ? `✕${t.broken}` : null,
      t["too-early"] ? `○${t["too-early"]}` : null,
    ]
      .filter(Boolean)
      .join(" ");
    const move = r.price_move_pct == null ? "" : ` ${r.price_move_pct > 0 ? "+" : ""}${r.price_move_pct}%`;
    // ประโยคแรกของ action_md พอสำหรับสรุป — รายละเอียดอยู่บนหน้าเว็บแล้ว
    const action = String(r.action_md ?? "").split(/(?<=[.।])\s|\s—\s/)[0].slice(0, 90);
    console.log(
      `${r.ticker.padEnd(6)} ${(STANCE[r.stance] ?? r.stance).padEnd(18)} ${(PLAN[r.plan_status] ?? "").padEnd(16)} ${marks.padEnd(14)}${move}`
    );
    console.log(`       ${action}`);
  }

  console.log(
    `\nสรุป: ยืนยันเดิม ${byStance.same ?? 0} · น้ำหนักเปลี่ยน ${byStance.shifted ?? 0} · ต้องวิเคราะห์ใหม่ ${byStance.escalate ?? 0}`
  );
  const esc = reviews.filter((r) => r.stance === "escalate").map((r) => r.ticker);
  if (esc.length > 0) console.log(`ตัวที่ต้องรัน /research-stock ต่อ: ${esc.join(", ")}`);
} finally {
  db.close();
}
