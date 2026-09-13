/**
 * technical indicator ล้วนๆ จาก closing price รายวัน — ไม่มี I/O
 * ทุกฟังก์ชันคืน null เมื่อข้อมูลไม่พอ (ห้าม throw — ผู้เรียกต้อง fallback เป็นกลาง ไม่ใช่ทำหน้าพัง)
 */

/** ค่าเฉลี่ยเคลื่อนที่แบบ exponential — seed ด้วย SMA ของ n แท่งแรกแล้ววนน้ำหนักลดทอนจนแท่งสุดท้าย
 *  ต้องมี closes >= n แท่ง ไม่งั้นน้ำหนักของ seed ยังค้างอยู่มาก (ดูเหตุผลที่ lib/quote.ts ดึง 2 ปี ไม่ใช่ 1 ปี) */
export function ema(closes: number[], n: number): number | null {
  if (closes.length < n) return null;
  const k = 2 / (n + 1);
  let value = closes.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let i = n; i < closes.length; i++) value = closes[i] * k + value * (1 - k);
  return value;
}

/** สูง/ต่ำสุดของ n แท่งล่าสุด — null ถ้าประวัติไม่พอ */
export function priceRange(closes: number[], n: number): { high: number; low: number } | null {
  if (closes.length < n) return null;
  const tail = closes.slice(-n);
  return { high: Math.max(...tail), low: Math.min(...tail) };
}

export type TrendState = "strong_up" | "up" | "mixed" | "down";

/** จัดโครงเทรนด์จากลำดับ EMA 50/100/200 — ดูโครงสร้าง ไม่ใช่ระยะห่างเป็น % */
export function emaTrend(price: number, ema50: number, ema100: number, ema200: number): TrendState {
  if (price > ema50 && ema50 > ema100 && ema100 > ema200) return "strong_up";
  if (ema50 > ema100 && ema100 > ema200) return "up";
  if (ema50 < ema100 && ema100 < ema200) return "down";
  return "mixed";
}

/** ตำแหน่งราคาในกรอบสูง-ต่ำ — pos 0 = ชนขอบล่าง, 1 = ชนขอบบน */
export function rangePosition(
  price: number,
  high: number,
  low: number
): { pos: number; mid: number; distFromMidPct: number } {
  const mid = (high + low) / 2;
  const pos = high === low ? 0.5 : (price - low) / (high - low);
  return { pos, mid, distFromMidPct: price / mid - 1 };
}
