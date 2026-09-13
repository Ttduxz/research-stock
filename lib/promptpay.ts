/**
 * สร้าง payload Thai QR Payment (PromptPay) ตามมาตรฐาน EMVCo — ไม่พึ่ง library
 * รองรับเบอร์โทร (10 หลัก), เลขบัตรประชาชน/เลขผู้เสียภาษี (13 หลัก), e-Wallet ID (15 หลัก)
 */

const PROMPTPAY_AID = "A000000677010111";

function tlv(id: string, value: string): string {
  return id + String(value.length).padStart(2, "0") + value;
}

/** CRC16-CCITT (poly 0x1021, init 0xFFFF) ตามที่ EMVCo กำหนด */
function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function normalizePromptPayId(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) return digits;
  if (digits.length === 13 || digits.length === 15) return digits;
  return null;
}

export function buildPromptPayPayload(rawId: string, amount?: number | null): string {
  const id = normalizePromptPayId(rawId);
  if (!id) throw new Error("PromptPay ID ไม่ถูกต้อง");

  // เบอร์โทร: ตัด 0 หน้า เติม 66 แล้ว pad เป็น 13 หลัก | บัตรประชาชน: tag 02 | e-Wallet: tag 03
  const account =
    id.length === 10
      ? tlv("01", ("66" + id.slice(1)).padStart(13, "0"))
      : id.length === 13
        ? tlv("02", id)
        : tlv("03", id);

  const hasAmount = amount != null && amount > 0;
  const body =
    tlv("00", "01") +
    tlv("01", hasAmount ? "12" : "11") + // 11 = static (ใส่ยอดเอง), 12 = dynamic (มียอดในตัว)
    tlv("29", tlv("00", PROMPTPAY_AID) + account) +
    tlv("58", "TH") +
    tlv("53", "764") +
    (hasAmount ? tlv("54", amount!.toFixed(2)) : "") +
    "6304";

  return body + crc16(body);
}

/** แสดงเบอร์แบบปิดบางส่วน เช่น 081-xxx-5678 */
export function maskPromptPayId(rawId: string): string {
  const id = normalizePromptPayId(rawId) ?? "";
  if (id.length === 10) return `${id.slice(0, 3)}-xxx-${id.slice(6)}`;
  return `${"x".repeat(Math.max(0, id.length - 4))}${id.slice(-4)}`;
}
