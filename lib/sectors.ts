/**
 * จัดกลุ่มหุ้นหน้าแรก — sector ใน DB เป็นข้อความอิสระที่ researcher เขียน (45 ตัว = 45 ข้อความไม่ซ้ำกัน
 * เช่น "Technology / Semiconductors (AI Accelerated Computing)") เอามาจัดกลุ่มตรงๆ ได้กลุ่มละตัวเดียว
 * ไฟล์นี้ยุบเป็นกลุ่มภาษาไทยที่คงที่ ~10 กลุ่มด้วย keyword · ไม่แก้ DB · หน้ารายละเอียดหุ้นยังโชว์ข้อความเต็ม
 *
 * ต่างจาก lib/segments.ts (ปุ่มกรอง /insights + track record) ตรงที่แยก "ชิป & ฮาร์ดแวร์" / "ซอฟต์แวร์ & คลาวด์" /
 * "อินเทอร์เน็ต & สื่อ" ออกจากกัน — หน้าแรกมีหุ้นเทคเกินครึ่ง รวมกลุ่มเดียวก็ยาวเกินจะไล่ดู
 *
 * ลำดับกฎมีผล (ใช้กฎแรกที่ match) เพราะ sector หลายตัวพูดหลายเรื่องในบรรทัดเดียว:
 * - ควอนตัมมาก่อนชิป: IONQ = "Quantum Computing / Technology Hardware & Semiconductors"
 * - สุขภาพมาก่อนการเงิน: UNH = "...Managed Care / Health Insurance"
 * - การเงินมาก่อนผู้บริโภค: O = "REIT - Retail/Net Lease" (REIT ไม่ใช่ค้าปลีก)
 * - พลังงานมาก่อนอุตสาหกรรม/ผู้บริโภค: GEV "(Industrials)", POWL "Industrial Machinery", NRG "Retail Energy"
 * - ชิปมาก่อนอุตสาหกรรม: AMAT = "Semiconductor Equipment & Materials" (materials ไม่ได้แปลว่าวัสดุอุตสาหกรรม)
 * - ผู้บริโภคมาก่อนซอฟต์แวร์: AMZN = "Consumer Discretionary / Cloud Infrastructure"
 * - TSLA "Clean Energy" ต้องไม่ติดกลุ่มพลังงาน — กฎพลังงานจึงไม่มีคำว่า energy เดี่ยวๆ
 */

export interface SectorGroup {
  key: string;
  /** ชื่อกลุ่มบนหัวข้อ/ชิปกรอง */
  label: string;
}

const RULES: (SectorGroup & { test: RegExp })[] = [
  { key: "quantum", label: "ควอนตัม", test: /quantum/i },
  { key: "health", label: "สุขภาพ", test: /health|pharma|biotech|managed care|medical/i },
  { key: "finance", label: "การเงิน & อสังหาฯ", test: /financ|payment|\bbank|credit|insurance|\breit\b|real estate/i },
  {
    key: "energy",
    label: "พลังงาน & สาธารณูปโภค",
    test: /utilit|power producer|renewable|nuclear|energy infrastructure|electrical equipment|\boil\b|\bgas\b/i,
  },
  {
    key: "chips",
    label: "ชิป & ฮาร์ดแวร์",
    test: /semiconduct|foundry|silicon|optical|technology hardware|consumer electronics|hardware/i,
  },
  {
    key: "industrial",
    label: "อุตสาหกรรม & อวกาศ",
    test: /aerospace|defen[cs]e|\bspace\b|industrial|automation|materials|metal|machinery/i,
  },
  {
    key: "internet",
    label: "อินเทอร์เน็ต & สื่อ",
    test: /communication services|interactive media|media|entertainment|streaming|internet|platform|transportation/i,
  },
  {
    key: "consumer",
    label: "ผู้บริโภค & ค้าปลีก",
    test: /consumer|retail|staples|grocery|automotive|automobile/i,
  },
  {
    key: "software",
    label: "ซอฟต์แวร์ & คลาวด์",
    test: /software|cloud|saas|cyber|\bdata\b|\bIT services|technology services|ai infrastructure/i,
  },
];

export const OTHER_GROUP: SectorGroup = { key: "other", label: "อื่นๆ" };

/** ลำดับแสดงบนหน้าแรก (ไม่ใช่ลำดับกฎ) — เทคก่อนเพราะเป็นกลุ่มที่มีหุ้นมากสุด "อื่นๆ" ท้ายสุดเสมอ */
export const SECTOR_GROUPS: SectorGroup[] = [
  "chips",
  "software",
  "quantum",
  "internet",
  "consumer",
  "finance",
  "health",
  "energy",
  "industrial",
]
  .map((k) => RULES.find((r) => r.key === k)!)
  .map(({ key, label }) => ({ key, label }))
  .concat(OTHER_GROUP);

/** sector ข้อความอิสระ → กลุ่มเดียว (ไม่มี/ไม่เข้ากฎไหน = "อื่นๆ") */
export function sectorGroup(sector: string | null | undefined): SectorGroup {
  const s = sector?.trim();
  if (!s) return OTHER_GROUP;
  const hit = RULES.find((r) => r.test.test(s));
  return hit ? { key: hit.key, label: hit.label } : OTHER_GROUP;
}

/** "USD (ADR; underlying reporting currency GBP)" → "USD" — ช่อง currency บางตัวมีคำอธิบายปน โชว์แค่รหัส */
export function currencyCode(currency: string | null | undefined): string {
  const m = (currency ?? "").trim().match(/^[A-Za-z]{3}\b/);
  return m ? m[0].toUpperCase() : "";
}
