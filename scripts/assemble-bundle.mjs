/**
 * ประกอบผลจาก 3 ทีม (research.json + analysis.json + theories.json) เป็น bundle.json
 * Usage: node scripts/assemble-bundle.mjs <run-dir> [run_date]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("Usage: node scripts/assemble-bundle.mjs <run-dir> [run_date]");
  process.exit(1);
}
const runDate = process.argv[3] ?? new Date().toISOString().slice(0, 10);

const read = (f) => JSON.parse(readFileSync(join(dir, f), "utf8"));
const readOptional = (f) => {
  try {
    return read(f);
  } catch {
    return null;
  }
};
const research = read("research.json");
const analysis = read("analysis.json");
const theoriesFile = read("theories.json");
// แผนแบ่งไม้จาก theorie team — ไฟล์แยก (optional)
const entryPlan = readOptional("entry_plan.json") ?? theoriesFile.entry_plan ?? null;

const bundle = {
  stock: research.stock,
  run: {
    run_date: runDate,
    price_at_run: research.price_at_run ?? null,
    summary_md: theoriesFile.summary_md ?? null,
    details: research.details ?? null,
    entry_plan: entryPlan,
  },
  research_items: research.research_items ?? [],
  analysis,
  theories: theoriesFile.theories ?? [],
};

const out = join(dir, "bundle.json");
writeFileSync(out, JSON.stringify(bundle, null, 2));
console.log(
  `✔ assembled ${out}: ${bundle.research_items.length} items, ` +
    `${bundle.theories.length} theories, details=${bundle.run.details ? "yes" : "no"}`
);
