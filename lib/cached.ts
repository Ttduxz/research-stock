import { unstable_cache } from "next/cache";
import * as db from "@/lib/db";

/**
 * query ที่หน้าเว็บใช้ ห่อด้วย cache 60 วินาที — หน้าเว็บ import จากไฟล์นี้ ไม่ใช่จาก lib/db.ts ตรงๆ
 *
 * ทำไม cache ได้: ข้อมูลเปลี่ยนเฉพาะตอนรัน pipeline / รอบทบทวน (ingest) ไม่ได้ต่างกันตามคนดู
 * แต่ทุกคลิกเดิมต้องวิ่ง Vercel (us-east) → Turso หลายรอบ + ดึงข้อมูลก้อนใหญ่ใหม่หมด
 * แลกกับ: หลัง ingest เว็บจริงเห็นข้อมูลใหม่ช้าสุด ~60 วินาที (เดิมทันที)
 *
 * แยกไฟล์ออกจาก lib/db.ts เพราะ unstable_cache ใช้ได้เฉพาะใน Next — สคริปต์/เทสต์ที่ import lib/db.ts ตรงๆ จะได้ไม่พัง
 * argument ของฟังก์ชัน (ticker / runId / slug) ถูกรวมเข้า cache key ให้อัตโนมัติ
 * access_logs ไม่อยู่ในนี้ตั้งใจ — หน้า /admin/logs ต้องเห็นของล่าสุดเสมอ
 */
const opts = { revalidate: 60, tags: ["db"] };

export const listStocksWithLatest = unstable_cache(db.listStocksWithLatest, ["db:listStocksWithLatest"], opts);
export const getStock = unstable_cache(db.getStock, ["db:getStock"], opts);
export const listRuns = unstable_cache(db.listRuns, ["db:listRuns"], opts);
export const getRunBundle = unstable_cache(db.getRunBundle, ["db:getRunBundle"], opts);
export const listHints = unstable_cache(db.listHints, ["db:listHints"], opts);
export const listStockSectors = unstable_cache(db.listStockSectors, ["db:listStockSectors"], opts);
export const getHint = unstable_cache(db.getHint, ["db:getHint"], opts);
export const listLatestSnapshots = unstable_cache(db.listLatestSnapshots, ["db:listLatestSnapshots"], opts);
export const listActiveItems = unstable_cache(db.listActiveItems, ["db:listActiveItems"], opts);
export const listReviews = unstable_cache(db.listReviews, ["db:listReviews"], opts);
export const listThesisChecks = unstable_cache(db.listThesisChecks, ["db:listThesisChecks"], opts);
export const listTrackRecordRows = unstable_cache(db.listTrackRecordRows, ["db:listTrackRecordRows"], opts);
