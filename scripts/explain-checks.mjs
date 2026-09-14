/**
 * เติมคำอธิบาย 4 ช่อง (if_md / then_md / because_md / so_md) ให้ผลตัดสินเก่าใน thesis_checks
 * ที่บันทึกไว้ก่อนมีช่องเหล่านี้ — รอบทบทวนใหม่ reviewer เขียนมาเองตั้งแต่แรก (ดู .claude/agents/stock-reviewer.md)
 *
 *   node scripts/explain-checks.mjs export <outDir> [--batches 6]
 *     → เขียน <outDir>/batch-<n>.json: ข้อที่ยังไม่มีคำอธิบาย + ทฤษฎีต้นทาง (thesis_md/scenarios) จัดกลุ่มตาม ticker
 *
 *   node scripts/explain-checks.mjs apply <file.explained.json> [...]
 *     → ตรวจแล้วบันทึก { "explanations": [{ "id", "if_md", "then_md", "because_md", "so_md" }] }
 *       ไฟล์ที่มีปัญหาแม้ข้อเดียวจะไม่ถูกบันทึกเลยทั้งไฟล์ (ไม่มี --force)
 *
 * ใช้เฉพาะข้อความที่มีใน DB — ไม่ค้นเว็บ ไม่เพิ่มข้อเท็จจริง และไม่แตะ claim / status / evidence_md เดิม
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { applySchema } from "./schema.mjs";
import { openDb } from "./db-client.mjs";

const [cmd, ...rest] = process.argv.slice(2);
const MAX_LEN = 400; // ตั้งใจให้ ~200 — เกินนี้ไม่ใช่ "ประโยคเดียวอ่านจบ" แล้ว
const IMPACTS = ["good", "bad", "mixed"];
const SOFT_LEN = 250;

const db = openDb();
await applySchema(db);

try {
  if (cmd === "export") await exportBatches();
  else if (cmd === "export-impact") await exportImpact();
  else if (cmd === "apply") await applyFiles();
  else {
    console.error(
      "Usage: node scripts/explain-checks.mjs export <outDir> [--batches N]\n" +
        "       node scripts/explain-checks.mjs export-impact <outDir>\n" +
        "       node scripts/explain-checks.mjs apply <file...>   (explanations[] หรือ impacts[])"
    );
    process.exitCode = 1;
  }
} finally {
  db.close();
}

async function exportBatches() {
  const outDir = rest.find((a) => !a.startsWith("--"));
  if (!outDir) throw new Error("ต้องระบุ outDir");
  const bi = rest.indexOf("--batches");
  const batchCount = Math.max(1, Number(bi >= 0 ? rest[bi + 1] : 6) || 6);

  const rows = (
    await db.execute(`
      SELECT c.id, c.ticker, s.name, c.claim_type, c.status, c.claim, c.evidence_md,
             c.origin_run_id, c.theory_title, t.thesis_md, t.scenarios
      FROM thesis_checks c
      LEFT JOIN stocks s ON s.ticker = c.ticker
      LEFT JOIN theories t ON t.run_id = c.origin_run_id AND t.title = c.theory_title
      WHERE c.if_md IS NULL
      ORDER BY c.ticker, c.id
    `)
  ).rows;
  if (rows.length === 0) {
    console.log("ไม่มีข้อที่ต้องเติมคำอธิบายแล้ว");
    return;
  }

  // จัด ticker ลง batch แบบ greedy ตามจำนวนข้อ — ticker เดียวต้องอยู่ batch เดียว (ใช้ทฤษฎีชุดเดียวกัน)
  const byTicker = new Map();
  for (const r of rows) byTicker.set(r.ticker, [...(byTicker.get(r.ticker) ?? []), r]);
  const bins = Array.from({ length: Math.min(batchCount, byTicker.size) }, () => ({ n: 0, rows: [] }));
  for (const group of [...byTicker.values()].sort((a, b) => b.length - a.length)) {
    const bin = bins.reduce((m, b) => (b.n < m.n ? b : m));
    bin.rows.push(...group);
    bin.n += group.length;
  }

  await mkdir(outDir, { recursive: true });
  for (const [i, bin] of bins.entries()) {
    // ทฤษฎีแยกเก็บครั้งเดียวต่อ key — หลายข้อมาจากทฤษฎีเดียวกัน ไม่ต้องแปะ thesis_md ซ้ำทุกข้อ
    const theories = {};
    const items = bin.rows.map((r) => {
      const key = `${r.origin_run_id}|${r.theory_title}`;
      if (!theories[key]) {
        let scenarios = null;
        try {
          scenarios = r.scenarios ? JSON.parse(r.scenarios) : null;
        } catch {}
        theories[key] = { ticker: r.ticker, title: r.theory_title, thesis_md: r.thesis_md, scenarios };
      }
      return {
        id: Number(r.id),
        ticker: r.ticker,
        name: r.name,
        claim_type: r.claim_type,
        status: r.status,
        claim: r.claim,
        evidence_md: r.evidence_md,
        theory_key: key,
      };
    });
    const file = path.join(outDir, `batch-${i + 1}.json`);
    await writeFile(file, JSON.stringify({ theories, items }, null, 1));
    console.log(`${file}  ${items.length} ข้อ · ${[...new Set(items.map((x) => x.ticker))].join(",")}`);
  }
  console.log(`รวม ${rows.length} ข้อ ใน ${bins.length} batch`);
}

/**
 * ข้อที่รู้ผลแล้วแต่ยังไม่มี impact — ส่งแค่ข้อความที่เขียนไว้แล้ว (claim + because_md + so_md)
 * agent แค่ติดป้ายว่าผลนี้ดี/ร้าย/ปนกันต่อหุ้น ไม่ได้ตัดสินอะไรใหม่
 */
async function exportImpact() {
  const outDir = rest.find((a) => !a.startsWith("--"));
  if (!outDir) throw new Error("ต้องระบุ outDir");
  const rows = (
    await db.execute(`
      SELECT c.id, c.ticker, c.claim_type, c.status, c.theory_title, c.claim, c.if_md, c.then_md, c.because_md, c.so_md
      FROM thesis_checks c
      WHERE c.status != 'too-early' AND c.impact IS NULL
      ORDER BY c.ticker, c.id
    `)
  ).rows.map((r) => ({ ...r, id: Number(r.id), claim: String(r.claim).slice(0, 400) }));
  await mkdir(outDir, { recursive: true });
  const file = path.join(outDir, "impact.json");
  await writeFile(file, JSON.stringify({ items: rows }, null, 1));
  console.log(`${file}  ${rows.length} ข้อ`);
}

async function applyFiles() {
  if (rest.length === 0) throw new Error("ต้องระบุไฟล์อย่างน้อย 1 ไฟล์");
  const known = new Map(
    (await db.execute("SELECT id, status FROM thesis_checks")).rows.map((r) => [Number(r.id), r.status])
  );

  let failed = 0;
  for (const file of rest) {
    const data = JSON.parse(await readFile(file, "utf8"));

    if (data.impacts) {
      const problems = [];
      const seen = new Set();
      for (const e of data.impacts) {
        const id = Number(e.id);
        const status = known.get(id);
        if (status === undefined) problems.push(`id ${e.id}: ไม่มีใน thesis_checks`);
        else if (status === "too-early") problems.push(`id ${e.id}: ยังไม่รู้ผล ไม่ควรมี impact`);
        if (!IMPACTS.includes(e.impact)) problems.push(`id ${e.id}: impact ต้องเป็น ${IMPACTS.join(" / ")}`);
        if (seen.has(id)) problems.push(`id ${e.id}: ซ้ำในไฟล์`);
        seen.add(id);
      }
      if (problems.length > 0) {
        failed++;
        console.error(`✖ ${file} — ไม่บันทึก (${problems.length} ปัญหา)`);
        for (const p of problems.slice(0, 30)) console.error(`   ${p}`);
        continue;
      }
      await db.batch(
        data.impacts.map((e) => ({ sql: "UPDATE thesis_checks SET impact = ? WHERE id = ?", args: [e.impact, Number(e.id)] })),
        "write"
      );
      console.log(`✓ ${file} — บันทึก impact ${data.impacts.length} ข้อ`);
      continue;
    }

    const list = data.explanations ?? [];
    const problems = [];
    const warnings = [];
    const seen = new Set();

    for (const e of list) {
      const id = Number(e.id);
      const status = known.get(id);
      const tag = `id ${e.id}`;
      if (status === undefined) {
        problems.push(`${tag}: ไม่มีใน thesis_checks`);
        continue;
      }
      if (seen.has(id)) problems.push(`${tag}: ซ้ำในไฟล์`);
      seen.add(id);
      const required = ["if_md", "then_md", "because_md", ...(status === "too-early" ? [] : ["so_md"])];
      for (const f of required) if (!String(e[f] ?? "").trim()) problems.push(`${tag}: ${f} ว่าง`);
      for (const f of ["if_md", "then_md", "because_md", "so_md"]) {
        const len = String(e[f] ?? "").length;
        if (len > MAX_LEN) problems.push(`${tag}: ${f} ยาว ${len} ตัวอักษร (เกิน ${MAX_LEN})`);
        else if (len > SOFT_LEN) warnings.push(`${tag}: ${f} ยาว ${len} (ควร ≤200)`);
      }
    }

    if (problems.length > 0) {
      failed++;
      console.error(`✖ ${file} — ไม่บันทึก (${problems.length} ปัญหา)`);
      for (const p of problems.slice(0, 30)) console.error(`   ${p}`);
      continue;
    }
    for (const w of warnings.slice(0, 10)) console.error(`⚠ ${w}`);

    await db.batch(
      list.map((e) => ({
        sql: "UPDATE thesis_checks SET if_md = ?, then_md = ?, because_md = ?, so_md = ? WHERE id = ?",
        args: [e.if_md.trim(), e.then_md.trim(), e.because_md.trim(), e.so_md?.trim() || null, Number(e.id)],
      })),
      "write"
    );
    console.log(`✓ ${file} — บันทึก ${list.length} ข้อ`);
  }

  const left = (await db.execute("SELECT COUNT(*) AS n FROM thesis_checks WHERE if_md IS NULL")).rows[0].n;
  const noImpact = (
    await db.execute("SELECT COUNT(*) AS n FROM thesis_checks WHERE status != 'too-early' AND impact IS NULL")
  ).rows[0].n;
  console.log(`เหลือข้อที่ยังไม่มีคำอธิบาย ${left} ข้อ · รู้ผลแล้วแต่ยังไม่มี impact ${noImpact} ข้อ`);
  if (failed > 0) process.exitCode = 1;
}
