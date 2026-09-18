/**
 * ด่านตรวจคุณภาพข้อมูลก่อนส่งให้ analyst — อ่านผลของ agent `data-sanity` (sanity.json) แล้วตัดสินด้วยโค้ด
 *
 * Usage: node scripts/check-sanity.mjs <run-dir> [--coverage-only]
 *        node scripts/check-sanity.mjs --find-partial <TICKER>
 *   exit 0 = CLEAN/FLAGS (วิเคราะห์ต่อได้ โดย analyst ต้องอ่าน sanity.json)
 *   exit 1 = BLOCKING (ส่งกลับให้ researcher ก่อน) หรือไฟล์ผิดรูป
 *   exit 2 = PARTIAL (researcher ค้นไม่ครบ เช่นโควตาค้นเว็บหมด — หยุด pipeline แล้ว resume ใน session ใหม่)
 *   exit 3 = RESOLVE (มีข้อที่ค้นเพิ่มแล้วน่าจะหาย — ส่งกลับให้ researcher "โหมดค้นเพิ่ม" หนึ่งรอบ)
 *
 * แนวคิด: "หาไม่ได้" ที่ยังไม่ได้ลองหาจากต้นทางไม่ใช่ข้อจำกัดของการวิเคราะห์ มันคืองานที่ยังไม่เสร็จ
 * ด่านนี้จึงแยก 3 ชั้น — blocking (ข้อมูลใช้ไม่ได้), resolve (ไปหาต่อได้), flag (ข้อจำกัดจริง ต้องเตือน)
 *
 * นอกจากอ่านผล agent ยังตรวจ research.json ด้วยโค้ดซ้ำในข้อที่โค้ดตรวจได้แม่นกว่า:
 *   - coverage.status ต้องเป็น "complete" (partial → exit 2; ไม่มี field → flag)
 *   - price_at_run ต้องเป็นตัวเลข > 0
 *   - url ที่เป็นหน้าผลค้นหา/หน้ารวมข่าว (bing news search, google news, ฯลฯ) — importance ≥ 4 → resolve, อื่นๆ → flag
 *   - url ซ้ำใน research_items / item ที่ไม่มี url หรือ published_at / published_at ในอนาคต
 *   - details.segments: margin_pct ที่ป้ายบอกว่าเป็นสัดส่วนรายได้ (ไม่ใช่กำไร) → resolve;
 *     ไม่มี margin ทั้งชุดทั้งที่มี item หมวด filing และไม่มีที่ไหนบอกว่า "ไม่เปิดเผย" → resolve
 *   - notes_md ผลักงานไป "รอบถัดไป" → resolve
 *   - pl_history: จำนวน years ต้องเท่ากับจำนวน values ทุกแถว
 * ธงจากโค้ดถูกเติมเข้าไปในผลลัพธ์ที่พิมพ์ (ไม่แก้ sanity.json) เพื่อให้ orchestrator เห็นครบในที่เดียว
 * ถ้า coverage.resolve_round ≥ 1 (ค้นเพิ่มมาแล้วหนึ่งรอบ) ธง resolve ที่ยังเหลือถูกลดเป็น flag — ไม่วนซ้ำไม่รู้จบ
 *
 * แนวคิดจาก holdings-sanity ของ plugin Claude for Financial Advisors: ตรวจก่อนคำนวณ ธงต้องบอกว่าปนเปื้อนอะไร
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const usage = () => {
  console.error("Usage: node scripts/check-sanity.mjs <run-dir> [--coverage-only]\n       node scripts/check-sanity.mjs --find-partial <TICKER>");
  process.exit(1);
};

const AGGREGATOR_RE =
  /^(https?:\/\/)?(www\.)?(bing\.com\/(news\/)?search|news\.google\.[a-z.]+|google\.[a-z.]+\/search|duckduckgo\.com|search\.yahoo\.com|news\.search\.yahoo\.com|search\.brave\.com|yandex\.[a-z]+\/search)/i;
const isAggregator = (url) => AGGREGATOR_RE.test(String(url ?? "").trim());
const NOT_DISCLOSED_RE = /ไม่เปิดเผย|ไม่แยก|ไม่ระบุ|not disclosed|n\/a|ไม่มี.*(segment|เซกเมนต์)/i;
const SHARE_LABEL_RE = /สัดส่วน|ส่วนแบ่ง|share|% of|percent of/i;
// ผลักงานไปรอบถัดไป: ต้องมีกริยาเลื่อน (ควร/ต้อง/ตรวจสอบ/ยืนยัน/หากมีโอกาส ...) นำหน้า "รอบถัดไป" — คำว่า "ครั้งถัดไป" เฉยๆ (เช่น "วันที่ earnings ครั้งถัดไป") ไม่นับ
const DEFER_RE = /(ควร|ต้อง|ค่อย|รอ|ติดตาม|ตรวจสอบ|ยืนยัน|เช็ค|หากมีโอกาส|ถ้ามีโอกาส)[^.\n]{0,120}รอบ(ทบทวน|ติดตาม)?(ถัดไป|หน้า)|next (round|review|cycle)/i;

// ---- โหมด --find-partial <TICKER>: หา directory ล่าสุดที่ research.json ยังไม่ complete (ใช้กับ /research-stock --resume) ----
if (argv[0] === "--find-partial") {
  const ticker = String(argv[1] ?? "").toUpperCase();
  if (!ticker) usage();
  const base = "pipeline/output";
  const dirs = readdirSync(base)
    .filter((d) => d.startsWith(`${ticker}-`) && !d.includes("-review-") && existsSync(join(base, d, "research.json")))
    .sort()
    .reverse();
  for (const d of dirs) {
    try {
      const r = JSON.parse(readFileSync(join(base, d, "research.json"), "utf8"));
      const cov = r.coverage ?? {};
      if (cov.status && cov.status !== "complete") {
        console.log(join(base, d));
        console.log(`  status=${cov.status} reason=${cov.reason ?? "-"}`);
        console.log(`  done: ${(cov.done ?? []).join(", ") || "-"}`);
        console.log(`  missing: ${(cov.missing ?? []).join(" · ") || "-"}`);
        process.exit(0);
      }
    } catch {
      /* ข้ามไฟล์พัง */
    }
  }
  console.log(`ไม่มีงานค้างของ ${ticker} — รัน /research-stock ${ticker} ปกติได้`);
  process.exit(0);
}

const dir = argv[0];
if (!dir || dir.startsWith("--")) usage();
const coverageOnly = argv.includes("--coverage-only");

const CHECKS = ["staleness", "contradiction", "aggregation", "magnitude", "completeness", "duplication", "sourcing"];
const SEVERITIES = ["blocking", "resolve", "flag"];
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

// ---- coverage: งานค้นครบไหม (ตรวจก่อนทุกอย่าง — ไฟล์ partial ไม่ควรถูกส่งต่อแม้ sanity.json จะสวย) ----
const coverage = research.coverage ?? null;
const resolveRound = Number(coverage?.resolve_round ?? 0) || 0;
if (coverage && coverage.status && coverage.status !== "complete") {
  console.error(`✖ PARTIAL — researcher ค้นไม่ครบ (status=${coverage.status}, reason=${coverage.reason ?? "-"})`);
  console.error(`  ทำแล้ว: ${(coverage.done ?? []).join(", ") || "-"}`);
  console.error(`  ยังขาด: ${(coverage.missing ?? []).join(" · ") || "-"}`);
  console.error(`  → หยุด pipeline ห้าม spawn analyst · เปิด session ใหม่แล้วรัน /research-stock ${research.stock?.ticker ?? "<TICKER>"} --resume`);
  process.exit(2);
}
if (coverageOnly) {
  console.log(`coverage: ${coverage?.status ?? "(ไม่มี field coverage)"} resolve_round=${resolveRound}`);
  process.exit(0);
}

const report = readJson("sanity.json");
if (!report) fail(`ไม่พบ ${join(dir, "sanity.json")} — spawn agent data-sanity ก่อน`);
if (!["CLEAN", "FLAGS", "RESOLVE", "BLOCKING"].includes(report.verdict)) fail("sanity.verdict ต้องเป็น CLEAN | FLAGS | RESOLVE | BLOCKING");

const flags = Array.isArray(report.flags) ? report.flags : [];
const problems = [];
for (const f of flags) {
  if (!CHECKS.includes(f.check)) problems.push(`flag มี check ไม่รู้จัก: ${f.check}`);
  if (!SEVERITIES.includes(f.severity)) problems.push(`flag "${f.check}" severity ต้องเป็น blocking | resolve | flag`);
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
const today = new Date().toISOString().slice(0, 10);

if (!coverage)
  codeFlags.push({ severity: "flag", check: "completeness", scope: "coverage", found: "research.json ไม่มี field coverage — researcher ไม่ได้ยืนยันว่าค้นครบ", contaminates: "ไม่รู้ว่ารายงานนี้ทำจากข้อมูลครบหรือครึ่งเดียว" });
if (!(typeof research.price_at_run === "number" && research.price_at_run > 0))
  codeFlags.push({ severity: "blocking", check: "completeness", scope: "price_at_run", found: `price_at_run = ${JSON.stringify(research.price_at_run)}`, contaminates: "ทุกช่วงราคาใน entry_plan และเป้า scenario" });

const seen = new Map();
items.forEach((it, i) => {
  const scope = `research_items[${i}]`;
  if (!it.url) codeFlags.push({ severity: "flag", check: "completeness", scope, found: "ไม่มี url", contaminates: "ตรวจย้อนแหล่งที่มาไม่ได้" });
  else {
    if (isAggregator(it.url))
      codeFlags.push({
        severity: Number(it.importance) >= 4 ? "resolve" : "flag",
        check: "sourcing",
        scope,
        found: `url เป็นหน้าผลค้นหา/หน้ารวมข่าว (importance ${it.importance ?? "?"}): "${it.title ?? ""}" → ${it.url}`,
        contaminates: "ข้อเท็จจริงใน item นี้ตรวจย้อนถึงต้นทางไม่ได้ — ต้องหาบทความ/เอกสารต้นทางมาแทน",
      });
    if (seen.has(it.url)) codeFlags.push({ severity: "flag", check: "duplication", scope, found: `url ซ้ำกับ [${seen.get(it.url)}]`, contaminates: "น้ำหนักข่าวนี้ถูกนับซ้ำ" });
    else seen.set(it.url, i);
  }
  if (!it.published_at) codeFlags.push({ severity: "flag", check: "completeness", scope, found: "ไม่มี published_at", contaminates: "แยกของใหม่/เก่าในรอบทบทวนไม่ได้" });
  else if (it.published_at > today) codeFlags.push({ severity: "flag", check: "staleness", scope, found: `published_at ${it.published_at} อยู่ในอนาคต`, contaminates: "ลำดับเวลาของข่าว" });
});

// valuation ต้องสอดคล้องกันเอง: P/E TTM ≈ market cap ÷ net income TTM (ต่างเกิน 3% = ชุดตัวเลขมาจากคนละแหล่ง/คนละวัน → researcher ต้องไปเอาจากต้นทางชุดเดียว)
const stats = Array.isArray(research.details?.stats) ? research.details.stats : [];
const parseMoney = (v) => {
  const m = String(v ?? "").replace(/,/g, "").match(/(-?\d+(?:\.\d+)?)\s*([TBMK])?/i);
  if (!m) return null;
  const mult = { T: 1e12, B: 1e9, M: 1e6, K: 1e3 }[(m[2] ?? "").toUpperCase()] ?? 1;
  return Number(m[1]) * mult;
};
const findStat = (re) => stats.find((s) => re.test(String(s.label ?? "")));
const peStat = findStat(/P\/E/i);
const capStat = findStat(/market\s*cap/i);
const niStat = findStat(/net\s*income|กำไรสุทธิ/i);
if (peStat && capStat && niStat && /TTM/i.test(`${peStat.label} ${peStat.note ?? ""}`) && /TTM/i.test(`${niStat.label} ${niStat.note ?? ""}`)) {
  const pe = parseMoney(peStat.value);
  const cap = parseMoney(capStat.value);
  const ni = parseMoney(niStat.value);
  if (pe > 0 && cap > 0 && ni > 0) {
    const implied = cap / ni;
    const diff = Math.abs(implied / pe - 1);
    if (diff > 0.03)
      codeFlags.push({
        severity: "resolve",
        check: "contradiction",
        scope: "details.stats (P/E TTM vs Market Cap ÷ Net Income TTM)",
        found: `P/E TTM ระบุ ${pe.toFixed(1)}x แต่ ${capStat.value} ÷ ${niStat.value} = ${implied.toFixed(1)}x ต่าง ${(diff * 100).toFixed(1)}% — ตัวเลขสามตัวนี้มาจากคนละชุด`,
        contaminates: "P/E ในตาราง stats และการเทียบ valuation กับกลุ่ม — ต้องเอาจำนวนหุ้น (หน้าปก 10-Q) + net income (งบ) จากต้นทางชุดเดียวมาคำนวณ ไม่ใช่ให้ analyst ใช้เป็นช่วง",
      });
  }
}

// segments: margin_pct ต้องเป็นกำไร ไม่ใช่สัดส่วนรายได้ และถ้ามี filing ต้องมีกำไรต่อเซกเมนต์หรือบอกว่าไม่เปิดเผย
const segments = Array.isArray(research.details?.segments) ? research.details.segments : [];
const notes = String(research.notes_md ?? "");
const hasFiling = items.some((it) => it.category === "filing");
segments.forEach((s, i) => {
  if (typeof s.margin_pct === "number" && SHARE_LABEL_RE.test(String(s.margin_label ?? "")) && !/margin|กำไร/i.test(String(s.margin_label ?? "")))
    codeFlags.push({
      severity: "resolve",
      check: "aggregation",
      scope: `details.segments[${i}] (${s.name ?? "?"})`,
      found: `margin_pct=${s.margin_pct} แต่ margin_label="${s.margin_label}" คือสัดส่วนรายได้ ไม่ใช่กำไร`,
      contaminates: "ตาราง segment บนหน้าเว็บจะโชว์สัดส่วนรายได้เป็น margin — ต้องเอากำไรต่อเซกเมนต์จาก segment note ของ filing มาแทน",
    });
});
if (segments.length && hasFiling) {
  const anyMargin = segments.some((s) => typeof s.margin_pct === "number" && !SHARE_LABEL_RE.test(String(s.margin_label ?? "")));
  const saidNotDisclosed = segments.some((s) => NOT_DISCLOSED_RE.test(String(s.margin_label ?? ""))) || NOT_DISCLOSED_RE.test(notes);
  if (!anyMargin && !saidNotDisclosed)
    codeFlags.push({
      severity: "resolve",
      check: "completeness",
      scope: "details.segments",
      found: `มี ${segments.length} segment แต่ไม่มีกำไรต่อเซกเมนต์เลย ทั้งที่มี item หมวด filing และ notes_md ไม่ได้บอกว่าดู segment note แล้วไม่เปิดเผย`,
      contaminates: "วิเคราะห์ไม่ได้ว่าเซกเมนต์ไหนทำกำไรดีกว่ากัน — ข้อมูลนี้ปกติอยู่ใน segment note ของ 10-Q/10-K",
    });
}

if (DEFER_RE.test(notes))
  codeFlags.push({
    severity: "resolve",
    check: "completeness",
    scope: "notes_md",
    found: `notes_md ผลักงานไปรอบถัดไป: "${(notes.match(new RegExp(`.{0,60}${DEFER_RE.source}.{0,40}`, "i")) ?? [""])[0].replace(/\s+/g, " ")}"`,
    contaminates: "สิ่งที่ถูกผลักไปคือช่องโหว่ของรายงานรอบนี้ — ต้องทำตอนนี้ หรือบันทึกว่าค้นที่ไหนแล้วไม่มี",
  });

const pl = research.details?.pl_history;
if (pl?.years && Array.isArray(pl.rows)) {
  for (const row of pl.rows)
    if (Array.isArray(row.values) && row.values.length !== pl.years.length)
      codeFlags.push({ severity: "flag", check: "aggregation", scope: "details.pl_history", found: `แถว "${row.label}" มี ${row.values.length} ค่า แต่ years มี ${pl.years.length}`, contaminates: "ตาราง 5 ปีและกราฟรายได้/margin" });
}

// ---- สรุป ----
let all = [...flags.map((f) => ({ ...f, from: "agent" })), ...codeFlags.map((f) => ({ ...f, from: "code" }))];
// ค้นเพิ่มมาแล้วหนึ่งรอบ → resolve ที่เหลือกลายเป็น flag (researcher ต้องบันทึกแล้วว่าค้นที่ไหนไม่เจอ)
if (resolveRound >= 1) all = all.map((f) => (f.severity === "resolve" ? { ...f, severity: "flag", found: `${f.found} (ค้นเพิ่มแล้ว ${resolveRound} รอบ ยังไม่หาย — analyst ต้องเขียนว่าค้นจากที่ไหนแล้วไม่มี)` } : f));

console.log(`sanity: ${report.verdict} — ${report.summary ?? ""}${resolveRound ? ` (หลังค้นเพิ่ม ${resolveRound} รอบ)` : ""}`);
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
const resolve = all.filter((f) => f.severity === "resolve");
if (resolve.length) {
  console.error(`✖ RESOLVE ${resolve.length} ข้อ — ค้นเพิ่มแล้วน่าจะหาย ส่งรายการ [resolve] ข้างบนให้ stock-researcher "โหมดค้นเพิ่ม" หนึ่งรอบ (agent ตั้ง coverage.resolve_round = 1) แล้วรัน data-sanity + สคริปต์นี้ใหม่`);
  process.exit(3);
}
console.log(`✔ sanity ${all.length ? `FLAGS ${all.length} ข้อ — analyst ต้องอ่าน sanity.json และใส่คำเตือนใน "ข้อจำกัดของการวิเคราะห์"` : "CLEAN"}`);
