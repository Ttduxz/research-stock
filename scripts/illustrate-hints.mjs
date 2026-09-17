/**
 * เติม "ชั้นอ่านให้เข้าใจ" (ภาพประกอบ / ศัพท์ / สรุป 3 บรรทัด) ให้ hint ที่มีอยู่แล้วใน DB
 * hint ใหม่ hint-analyst เขียนมาเองตั้งแต่แรก (ดู .claude/agents/hint-analyst.md) — สคริปต์นี้สำหรับของเก่า
 *
 *   node scripts/illustrate-hints.mjs export <outDir> [--slug <slug>] [--all]
 *     → เขียน <outDir>/<slug>.json ทีละ hint: เนื้อหาเต็ม (title/dek/stats/content_md/opinion_md) ให้ agent hint-illustrator อ่าน
 *       ค่าเริ่มต้นเอาเฉพาะ hint ที่ยังไม่มี visuals; --all = ทำใหม่ทั้งหมด (ทับของเดิม)
 *
 *   node scripts/illustrate-hints.mjs apply <file.illustrated.json> [...]
 *     → ตรวจแล้วบันทึก { slug, visuals, glossary, tldr_md, content_md? }
 *       content_md ส่งกลับมาได้เฉพาะเพื่อแทรกบรรทัด [[visual:id]] — ตัด marker ออกแล้วต้องเท่าต้นฉบับทุกตัวอักษร
 *       ไฟล์ที่มีปัญหาแม้ข้อเดียวจะไม่ถูกบันทึกเลย (ไม่มี --force)
 *
 * ใช้เฉพาะข้อความที่มีใน DB — ไม่ค้นเว็บ ไม่เพิ่มตัวเลขใหม่ (ตัวตรวจอยู่ scripts/hint-visuals.mjs)
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { applySchema } from "./schema.mjs";
import { openDb } from "./db-client.mjs";
import { validateHintExtras, sameContentExceptMarkers, MARKER_RE } from "./hint-visuals.mjs";

const [cmd, ...rest] = process.argv.slice(2);

const db = openDb();
await applySchema(db);

try {
  if (cmd === "export") await exportHints();
  else if (cmd === "apply") await applyFiles();
  else {
    console.error(
      "Usage: node scripts/illustrate-hints.mjs export <outDir> [--slug <slug>] [--all]\n" +
        "       node scripts/illustrate-hints.mjs apply <file...>"
    );
    process.exitCode = 1;
  }
} finally {
  db.close();
}

async function exportHints() {
  const outDir = rest.find((a) => !a.startsWith("--"));
  if (!outDir) throw new Error("ต้องระบุ outDir");
  const si = rest.indexOf("--slug");
  const slug = si >= 0 ? rest[si + 1] : null;
  const all = rest.includes("--all");

  const where = [];
  const args = [];
  if (slug) {
    where.push("slug = ?");
    args.push(slug);
  } else if (!all) where.push("visuals_json IS NULL");
  const rs = await db.execute({
    sql: `SELECT slug, title, dek, direction, magnitude, run_date, stats_json, content_md, opinion_md, visuals_json, glossary_json, tldr_md
          FROM hints ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY run_date DESC, id DESC`,
    args,
  });
  if (!rs.rows.length) {
    console.log("ไม่มี hint ที่ต้องเติม");
    return;
  }
  await mkdir(outDir, { recursive: true });
  for (const r of rs.rows) {
    const out = {
      slug: r.slug,
      title: r.title,
      dek: r.dek,
      direction: r.direction,
      magnitude: r.magnitude,
      run_date: r.run_date,
      stats: parse(r.stats_json) ?? [],
      content_md: r.content_md,
      opinion_md: r.opinion_md,
      existing: { visuals: parse(r.visuals_json), glossary: parse(r.glossary_json), tldr_md: r.tldr_md },
    };
    const file = path.join(outDir, `${r.slug}.json`);
    await writeFile(file, JSON.stringify(out, null, 2), "utf8");
    console.log(`→ ${file}`);
  }
  console.log(`\nexport ${rs.rows.length} hint — ส่ง path ให้ agent hint-illustrator เขียน <slug>.illustrated.json แล้วรัน apply`);
}

async function applyFiles() {
  const files = rest.filter((a) => !a.startsWith("--"));
  if (!files.length) throw new Error("ต้องระบุไฟล์อย่างน้อย 1 ไฟล์");
  let failed = 0;
  for (const file of files) {
    const data = JSON.parse(await readFile(file, "utf8"));
    const problems = [];
    if (!data.slug) problems.push("ไม่มี slug");
    const rs = data.slug
      ? await db.execute({ sql: "SELECT title, dek, stats_json, content_md, opinion_md FROM hints WHERE slug = ?", args: [data.slug] })
      : { rows: [] };
    const row = rs.rows[0];
    if (data.slug && !row) problems.push(`ไม่พบ hint slug "${data.slug}" ใน DB`);

    let content = row?.content_md ?? "";
    if (row) {
      if (data.content_md != null) {
        if (!sameContentExceptMarkers(row.content_md, data.content_md))
          problems.push("content_md ถูกแก้นอกเหนือจากการแทรกบรรทัด [[visual:id]] — illustrator ห้ามแก้เนื้อหา");
        else content = data.content_md;
      }
      if (!Array.isArray(data.visuals) || data.visuals.length === 0) problems.push("ต้องมี visuals อย่างน้อย 1 ภาพ (ถ้าไม่มีอะไรควรวาดจริงๆ ให้ระบุ \"visuals\": [] พร้อม \"no_visual_reason\")");
      if (Array.isArray(data.visuals) && data.visuals.length === 0 && !data.no_visual_reason?.trim())
        problems.push("visuals ว่างต้องมี no_visual_reason");
      if (!data.tldr_md?.trim()) problems.push("ต้องมี tldr_md");
      if (!Array.isArray(data.glossary) || data.glossary.length < 1) problems.push("ต้องมี glossary อย่างน้อย 1 คำ (รายงาน hint ทุกฉบับมีศัพท์การเงินที่คนทั่วไปไม่รู้)");
      // ภาพที่ไม่มี marker ยังแสดงได้ (ต่อท้ายเนื้อหา) แต่ควรวางใกล้ย่อหน้าที่มันอธิบาย — เตือน ไม่บล็อก
      const placed = new Set([...content.matchAll(MARKER_RE)].map((m) => m[1]));
      for (const v of data.visuals ?? []) if (v?.id && !placed.has(v.id)) console.warn(`  ⚠ ${data.slug}: ภาพ "${v.id}" ไม่มี marker ในเนื้อหา จะไปต่อท้ายรายงาน`);
      problems.push(
        ...validateHintExtras({
          title: row.title,
          dek: row.dek,
          stats_json: row.stats_json,
          content_md: content,
          opinion_md: row.opinion_md,
          visuals: data.visuals,
          glossary: data.glossary,
          tldr_md: data.tldr_md,
        })
      );
    }
    // ตัวเลขที่ปรากฏเฉพาะใน opinion_md ถือว่า "มีในรายงาน" ด้วย แต่ภาพไม่ควรวาดความเห็น — เตือนถ้าตัวเลขไม่อยู่ในเนื้อหาหลัก
    if (problems.length) {
      failed++;
      console.error(`✘ ${file}`);
      for (const p of problems) console.error("  - " + p);
      continue;
    }
    await db.execute({
      sql: `UPDATE hints SET visuals_json = ?, glossary_json = ?, tldr_md = ?, content_md = ? WHERE slug = ?`,
      args: [JSON.stringify(data.visuals), JSON.stringify(data.glossary), data.tldr_md, content, data.slug],
    });
    console.log(`✔ ${data.slug}: ${data.visuals.length} ภาพ · ${data.glossary.length} ศัพท์`);
  }
  if (failed) {
    console.error(`\n${failed} ไฟล์ไม่ผ่าน — แก้แล้วรัน apply ใหม่`);
    process.exitCode = 1;
  }
}

function parse(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
