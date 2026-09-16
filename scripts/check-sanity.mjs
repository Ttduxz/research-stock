/**
 * ด่านตรวจคุณภาพข้อมูลก่อนส่งให้ analyst — อ่านผลของ agent `data-sanity` (sanity.json) แล้วตัดสินด้วยโค้ด
 *
 * Usage: node scripts/check-sanity.mjs <run-dir>
 *   exit 0 = CLEAN/FLAGS (วิเคราะห์ต่อได้ โดย analyst ต้องอ่าน sanity.json)
 *   exit 1 = BLOCKING (ส่งกลับให้ researcher ก่อน) หรือไฟล์ผิดรูป
 *
 * นอกจากอ่านผล agent ยังตรวจ research.json ด้วยโค้ดซ้ำในข้อที่โค้ดตรวจได้แม่นกว่า:
 *   - price_at_run ต้องเป็นตัวเลข > 0
 *   - url ซ้ำใน research_items
 *   - item ที่ไม่มี url / published_at
 *   - pl_history: จำนวน years ต้องเท่ากับจำนวน values ทุกแถว
 *   - published_at ที่อยู่ในอนาคต (มักเป็นวันที่พิมพ์ผิด)
 * ธงจากโค้ดถูกเติมเข้าไปในผลลัพธ์ที่พิมพ์ (ไม่แก้ sanity.json) เพื่อให้ orchestrator เห็นครบในที่เดียว
 *
 * แนวคิดจาก holdings-sanity ของ plugin Claude for Financial Advisors: ตรวจก่อนคำนวณ ธงต้องบอกว่าปนเปื้อนอะไร
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("Usage: node scripts/check-sanity.mjs <run-dir>");
  process.exit(1);
}
const CHECKS = ["staleness", "contradiction", "aggregation", "magnitude", "completeness", "duplication", "sourcing"];
const fail = (msg) => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};
const readJson = (f) => {
  const p = join(dir, f);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
};

const research = readJson("research.json");
if (!research) fail(`ไม่พบ ${join(dir, "research.json")}`);
const report = readJson("sanity.json");
if (!report) fail(`ไม่พบ ${join(dir, "sanity.json")} — spawn agent data-sanity ก่อน`);
if (!["CLEAN", "FLAGS", "BLOCKING"].includes(report.verdict)) fail("sanity.verdict ต้องเป็น CLEAN | FLAGS | BLOCKING");

const flags = Array.isArray(report.flags) ? report.flags : [];
const problems = [];
for (const f of flags) {
  if (!CHECKS.includes(f.check)) problems.push(`flag มี check ไม่รู้จัก: ${f.check}`);
  if (!["blocking", "flag"].includes(f.severity)) problems.push(`flag "${f.check}" severity ต้องเป็น blocking | flag`);
  if (!String(f.contaminates ?? "").trim())
    problems.push(`flag "${f.check}" (${f.scope ?? "?"}) ไม่มี contaminates — ธงที่ไม่บอกว่ากระทบอะไรใช้ไม่ได้`);
}
const passed = Array.isArray(report.checks_passed) ? report.checks_passed : [];
const covered = new Set([...flags.map((f) => f.check), ...passed]);
const uncovered = CHECKS.filter((c) => !covered.has(c));
if (uncovered.length) problems.push(`ไม่ได้รายงานผลการตรวจข้อ: ${uncovered.join(", ")} (ต้องอยู่ใน flags หรือ checks_passed)`);

// ---- ตรวจซ้ำด้วยโค้ด ----
const codeFlags = [];
const items = Array.isArray(research.research_items) ? research.research_items : [];
if (!(typeof research.price_at_run === "number" && research.price_at_run > 0))
  codeFlags.push({ severity: "blocking", check: "completeness", found: `price_at_run = ${JSON.stringify(research.price_at_run)}`, contaminates: "ทุกช่วงราคาใน entry_plan และเป้า scenario" });
const seen = new Map();
items.forEach((it, i) => {
  if (!it.url) codeFlags.push({ severity: "flag", check: "completeness", found: `research_items[${i}] ไม่มี url`, contaminates: "ตรวจย้อนแหล่งที่มาไม่ได้" });
  else if (seen.has(it.url)) codeFlags.push({ severity: "flag", check: "duplication", found: `research_items[${i}] url ซ้ำกับ [${seen.get(it.url)}]`, contaminates: "น้ำหนักข่าวนี้ถูกนับซ้ำ" });
  else seen.set(it.url, i);
  if (!it.published_at) codeFlags.push({ severity: "flag", check: "completeness", found: `research_items[${i}] ไม่มี published_at`, contaminates: "แยกของใหม่/เก่าในรอบทบทวนไม่ได้" });
  else if (it.published_at > new Date().toISOString().slice(0, 10))
    codeFlags.push({ severity: "flag", check: "staleness", found: `research_items[${i}] published_at ${it.published_at} อยู่ในอนาคต`, contaminates: "ลำดับเวลาของข่าว" });
});
const pl = research.details?.pl_history;
if (pl?.years && Array.isArray(pl.rows)) {
  for (const row of pl.rows)
    if (Array.isArray(row.values) && row.values.length !== pl.years.length)
      codeFlags.push({ severity: "flag", check: "aggregation", found: `pl_history แถว "${row.label}" มี ${row.values.length} ค่า แต่ years มี ${pl.years.length}`, contaminates: "ตาราง 5 ปีและกราฟรายได้/margin" });
}

// ---- สรุป ----
const all = [...flags.map((f) => ({ ...f, from: "agent" })), ...codeFlags.map((f) => ({ ...f, from: "code" }))];
console.log(`sanity: ${report.verdict} — ${report.summary ?? ""}`);
for (const f of all)
  console.log(`  [${f.severity}${f.from === "code" ? "·code" : ""}] ${f.check} › ${f.scope ?? ""} ${f.found}\n       ปนเปื้อน: ${f.contaminates}`);
if (passed.length) console.log(`  ผ่าน: ${passed.join(", ")}`);

for (const p of problems) console.error(`✖ ${p}`);
if (problems.length) fail("sanity.json ผิดรูป — ส่งกลับให้ agent data-sanity แก้");

const blocking = all.filter((f) => f.severity === "blocking");
if (blocking.length || report.verdict === "BLOCKING") {
  console.error(`✖ BLOCKING ${blocking.length} ข้อ — ส่งกลับให้ stock-researcher แก้เฉพาะจุดที่ระบุ แล้วรัน data-sanity ใหม่`);
  process.exit(1);
}
console.log(`✔ sanity ${all.length ? `FLAGS ${all.length} ข้อ — analyst ต้องอ่าน sanity.json และใส่คำเตือนใน "ข้อจำกัดของการวิเคราะห์"` : "CLEAN"}`);
