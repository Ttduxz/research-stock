/**
 * ด่านตรวจภาษาก่อน ingest — อ่านผลของ agent `stock-compliance` (compliance.json) แล้วตัดสินด้วยโค้ด
 *
 * Usage: node scripts/check-compliance.mjs <run-dir>
 *   exit 0 = ผ่าน (ไม่มี fail)   exit 1 = fix-required หรือไฟล์ผิดรูป
 *
 * ทำ 3 อย่างที่ให้ agent ตัดสินเองไม่ได้:
 *   1. ตรวจว่า `passage` ทุกข้อมีอยู่จริงในไฟล์ที่อ้าง — ประโยคที่ agent แต่งขึ้นเองถูกปฏิเสธ
 *      (ไม่งั้น orchestrator จะส่งประโยคที่ไม่มีจริงกลับไปให้ทีมแก้)
 *   2. สแกนคำต้องห้ามที่ชัดเจนแบบ deterministic ซ้ำอีกชั้น (กันกรณี agent พลาด) — เฉพาะคำที่แทบไม่มี
 *      บริบทดีๆ ให้ใช้ในรายงานเพื่อการศึกษา
 *   3. ตรวจ disclaimer ใน entry_plan.invalidation_md ด้วยโค้ด
 *
 * แนวคิดจาก compliance-scan ของ plugin Claude for Financial Advisors: agent หาและชี้ สคริปต์เป็นคนตัดสินว่าผ่านไม่ผ่าน
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("Usage: node scripts/check-compliance.mjs <run-dir>");
  process.exit(1);
}

const SEVERITIES = ["fail", "flag", "note"];
// คำที่แทบไม่มีบริบทที่ยอมรับได้ในรายงานเพื่อการศึกษา (ตัดคำที่มีทั้งบริบทดี/ร้ายออก เช่น "แน่นอน" ซึ่งมี "ไม่แน่นอน")
const HARD_BANNED = [
  /รับประกัน(?!สินค้า|คุณภาพ|ผลิตภัณฑ์)/,
  /ไม่มีทางขาดทุน/,
  /ปลอดความเสี่ยง/,
  /ไม่มีความเสี่ยง(?!เลยที่|ในแง่)/,
  /ขึ้นแน่/,
  /ห้ามพลาด/,
  /ซื้อ(?:เลย|ทันที)/,
  /เข้าเต็มพอร์ต/,
  /\bguaranteed?\b/i,
  /\brisk[- ]free\b/i,
  /\bwill (?:outperform|definitely)\b/i,
  /\bsure (?:thing|win)\b/i,
];

const fail = (msg) => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

const readJson = (f) => {
  const p = join(dir, f);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
};

const report = readJson("compliance.json");
if (!report) fail(`ไม่พบ ${join(dir, "compliance.json")} — spawn agent stock-compliance ก่อน`);
if (!["pass", "fix-required"].includes(report.verdict)) fail("compliance.verdict ต้องเป็น pass | fix-required");

const files = {
  "analysis.json": readJson("analysis.json"),
  "theories.json": readJson("theories.json"),
};
if (!files["analysis.json"] || !files["theories.json"]) fail("ต้องมี analysis.json และ theories.json ใน run-dir");

// ข้อความทั้งหมดของแต่ละไฟล์ (normalize ช่องว่าง) สำหรับตรวจว่า passage มีอยู่จริง
const flatText = (v, out = []) => {
  if (v == null) return out;
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => flatText(x, out));
  else if (typeof v === "object") Object.values(v).forEach((x) => flatText(x, out));
  return out;
};
const corpus = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, norm(flatText(v).join("\n"))]));

const findings = Array.isArray(report.findings) ? report.findings : [];
const problems = [];
const counts = { fail: 0, flag: 0, note: 0 };
for (const f of findings) {
  if (!SEVERITIES.includes(f.severity)) {
    problems.push(`finding มี severity ไม่รู้จัก: ${f.severity}`);
    continue;
  }
  counts[f.severity]++;
  if (!corpus[f.file]) {
    problems.push(`finding อ้างไฟล์ที่ไม่มี: ${f.file}`);
    continue;
  }
  const p = norm(f.passage);
  if (p.length < 8) problems.push(`passage สั้นเกินจะระบุตำแหน่งได้: "${p}"`);
  else if (!corpus[f.file].includes(p))
    problems.push(`passage ไม่มีอยู่จริงใน ${f.file} (agent ต้องคัดลอกตรงตัว): "${p.slice(0, 80)}"`);
}

// ---- สแกนคำต้องห้ามซ้ำด้วยโค้ด ----
const hardHits = [];
for (const [file, obj] of Object.entries(files)) {
  for (const text of flatText(obj)) {
    for (const re of HARD_BANNED) {
      const m = text.match(re);
      if (m) {
        const i = text.indexOf(m[0]);
        hardHits.push({ file, hit: m[0], ctx: text.slice(Math.max(0, i - 40), i + m[0].length + 40).replace(/\n/g, " ") });
      }
    }
  }
}

// ---- disclaimer ใน invalidation_md ----
const inval = norm(files["theories.json"].entry_plan?.invalidation_md);
const hasDisclaimer = /การศึกษา/.test(inval) && /ไม่ใช่คำแนะนำ/.test(inval);

// ---- สรุป ----
const lines = [];
for (const f of findings)
  lines.push(`  [${f.severity}] ${f.file} › ${f.field ?? "?"} (กฎ ${f.rule ?? "?"}): "${norm(f.passage).slice(0, 90)}"\n       → ${f.why_md ?? ""}`);
if (lines.length) console.log(`ข้อค้นพบของ agent (${findings.length}):\n${lines.join("\n")}`);
for (const h of hardHits) console.log(`  [hard] ${h.file}: พบ "${h.hit}" … ${h.ctx}`);
if (!hasDisclaimer) console.log("  [hard] theories.json › entry_plan.invalidation_md ไม่มีข้อความว่าเป็นการศึกษา ไม่ใช่คำแนะนำการลงทุน");

for (const p of problems) console.error(`✖ ${p}`);
if (problems.length) fail("compliance.json ผิดรูป — ส่งกลับให้ agent stock-compliance แก้ (ห้ามข้าม)");

const blocking = counts.fail + hardHits.length + (hasDisclaimer ? 0 : 1);
if (blocking > 0 || report.verdict === "fix-required") {
  console.error(
    `✖ fix-required: fail ${counts.fail} · คำต้องห้าม ${hardHits.length} · disclaimer ${hasDisclaimer ? "ครบ" : "ขาด"}` +
      ` (flag ${counts.flag}, note ${counts.note}) — ส่งประโยคด้านบนกลับให้ analyst/theorist แก้ แล้วรัน stock-compliance ใหม่`
  );
  process.exit(1);
}
console.log(`✔ compliance pass: fail 0 · flag ${counts.flag} · note ${counts.note} · disclaimer ครบ`);
