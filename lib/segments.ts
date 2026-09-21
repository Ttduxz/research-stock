import { OTHER_GROUP, SECTOR_GROUPS, sectorGroup, type SectorGroup } from "@/lib/sectors";

/**
 * จัดกลุ่มอุตสาหกรรม (segment) สำหรับใช้กรองหน้า /insights
 *
 * ตาราง hints ไม่มีคอลัมน์ segment — แต่ทุก hint บันทึกไว้ว่าเจอระหว่าง research หุ้นตัวไหน
 * (`discovered_from`) จึงอนุมาน segment จาก `sector` ของหุ้นต้นทางแทน ไม่ต้องแก้ schema
 * และ hint เก่าทุกอันได้ segment ทันทีโดยไม่ต้อง re-ingest
 *
 * field `sector` ในตาราง stocks เป็นข้อความอิสระ — ยุบเป็นกลุ่มด้วยกฎใน lib/sectors.ts (ลำดับกฎ + เหตุผลอยู่ที่นั่น)
 */
// ใช้ชุดกลุ่มเดียวกับหน้าแรก (lib/sectors.ts) ทั้งเว็บ — เดิมไฟล์นี้มีกฎของตัวเองที่หยาบกว่า (เทคทั้งหมดเป็นกลุ่มเดียว)
// ทำให้หุ้นตัวเดียวกันอยู่คนละชื่อกลุ่มระหว่างหน้าแรก กับ /insights และ /track-record (รวมเป็นชุดเดียว 2026-09-21)
export const SEGMENTS: SectorGroup[] = SECTOR_GROUPS;

export const OTHER_SEGMENT = OTHER_GROUP;

export function segmentLabel(key: string): string {
  return SECTOR_GROUPS.find((s) => s.key === key)?.label ?? OTHER_GROUP.label;
}

/** sector หนึ่งบรรทัด → key ของกลุ่มเดียว */
export function segmentOf(sector: string | null | undefined): string {
  return sectorGroup(sector).key;
}

/**
 * hint หนึ่งอัน → key ของกลุ่มทั้งหมดที่เกี่ยวข้อง
 * `discovered_from` เก็บได้หลาย ticker คั่นด้วย comma (เช่น "RGTI,QBTS") hint เดียวจึงอยู่ได้หลายกลุ่ม
 */
export function segmentsOfHint(
  discoveredFrom: string | null | undefined,
  sectorOf: (ticker: string) => string | null | undefined
): string[] {
  const tickers = (discoveredFrom ?? "")
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
  if (tickers.length === 0) return [OTHER_SEGMENT.key];
  const keys = [...new Set(tickers.map((t) => segmentOf(sectorOf(t))))];
  return keys.length > 0 ? keys : [OTHER_SEGMENT.key];
}
