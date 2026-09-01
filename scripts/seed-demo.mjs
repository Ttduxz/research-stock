/** Seed ข้อมูลตัวอย่าง (ticker: DEMO) เพื่อทดสอบระบบ */
import { spawnSync } from "node:child_process";

const r = spawnSync(
  process.execPath,
  ["scripts/ingest.mjs", "pipeline/examples/demo-bundle.json"],
  { stdio: "inherit" }
);
process.exit(r.status ?? 0);
