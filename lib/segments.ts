/**
 * จัดกลุ่มอุตสาหกรรม (segment) สำหรับใช้กรองหน้า /insights
 *
 * ตาราง hints ไม่มีคอลัมน์ segment — แต่ทุก hint บันทึกไว้ว่าเจอระหว่าง research หุ้นตัวไหน
 * (`discovered_from`) จึงอนุมาน segment จาก `sector` ของหุ้นต้นทางแทน ไม่ต้องแก้ schema
 * และ hint เก่าทุกอันได้ segment ทันทีโดยไม่ต้อง re-ingest
 *
 * field `sector` ในตาราง stocks เป็นข้อความอิสระ (เช่น "Utilities / Independent Power Producer (Nuclear)")
 * ยาวเกินจะเอามาทำปุ่มกรองตรงๆ จึงยุบเป็นกลุ่มใหญ่ไม่กี่กลุ่มด้วย regex
 *
 * ลำดับสำคัญ — ใช้กลุ่มแรกที่ match: sector หลายอันพูดถึงหลายเรื่องในบรรทัดเดียว
 * เช่น TSLA = "Consumer Discretionary / Automobiles (EV, Energy, AI & Robotics)" ต้องได้ "อุปโภคบริโภค"
 * ไม่ใช่ "พลังงาน" ส่วน GEV = "Electrical Equipment / Energy Infrastructure (Industrials)"
 * ต้องได้ "พลังงาน" ไม่ใช่ "อุตสาหกรรม"
 */
export const SEGMENTS: { key: string; label: string; test: RegExp }[] = [
  { key: "quantum", label: "ควอนตัม", test: /quantum/i },
  { key: "health", label: "สุขภาพ", test: /health|pharma|biotech|biopharma/i },
  { key: "finance", label: "การเงิน", test: /financial|payment|bank|insurance/i },
  { key: "consumer", label: "อุปโภคบริโภค & ค้าปลีก", test: /consumer|retail|staples|discretionary/i },
  { key: "comm", label: "สื่อสาร & บันเทิง", test: /communication|entertainment|streaming|media/i },
  { key: "semi", label: "เซมิคอนดักเตอร์ & ฮาร์ดแวร์", test: /semiconduct|foundry|optical|hardware/i },
  { key: "energy", label: "พลังงาน & สาธารณูปโภค", test: /utilit|energy|power|electrical|grid/i },
  { key: "industrial", label: "อุตสาหกรรม & การบิน", test: /aerospace|defense|industrial|automation|materials|metal/i },
  { key: "tech", label: "เทคโนโลยี & ซอฟต์แวร์", test: /technology|software|data|cyber/i },
];

export const OTHER_SEGMENT = { key: "other", label: "อื่นๆ" };

export function segmentLabel(key: string): string {
  return SEGMENTS.find((s) => s.key === key)?.label ?? OTHER_SEGMENT.label;
}

/** sector หนึ่งบรรทัด → key ของกลุ่มเดียว */
export function segmentOf(sector: string | null | undefined): string {
  if (!sector) return OTHER_SEGMENT.key;
  return SEGMENTS.find((s) => s.test.test(sector))?.key ?? OTHER_SEGMENT.key;
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
