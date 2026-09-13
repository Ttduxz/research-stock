/**
 * ราคาตลาดสดสำหรับสคริปต์ฝั่ง node (คู่กับ lib/quote.ts ที่ใช้ในเว็บ)
 * แหล่ง: Yahoo Finance chart endpoint — ไม่เป็นทางการ ถ้าล่มต้องไม่ทำให้ทั้งรอบพัง
 * ตัวที่ดึงไม่ได้จะไม่อยู่ใน Map ผู้เรียกต้อง fallback เอง
 */
const ENDPOINT = "https://query1.finance.yahoo.com/v8/finance/chart/";
const TIMEOUT_MS = 8000;

async function fetchOne(ticker) {
  try {
    const res = await fetch(`${ENDPOINT}${encodeURIComponent(ticker)}?interval=1d&range=1mo`, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;
    return {
      ticker,
      price,
      currency: meta.currency ?? null,
      asOf: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
    };
  } catch {
    return null;
  }
}

export async function getQuotes(tickers) {
  const unique = [...new Set(tickers)];
  const out = new Map();
  // ยิงทีละก้อนกัน rate limit เวลาเช็คหุ้นหลายสิบตัวพร้อมกัน
  for (let i = 0; i < unique.length; i += 8) {
    const batch = unique.slice(i, i + 8);
    const settled = await Promise.allSettled(batch.map(fetchOne));
    for (const r of settled) if (r.status === "fulfilled" && r.value) out.set(r.value.ticker, r.value);
  }
  return out;
}

/** แปลงช่วงราคาแบบข้อความ ("$190-205", "$1,190–1,250") เป็น { low, high } — คืน null ถ้าอ่านไม่ออก */
export function parseRange(text) {
  if (!text) return null;
  const nums = String(text)
    .replace(/,/g, "")
    .match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return null;
  const vals = nums.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (vals.length === 0) return null;
  return { low: Math.min(...vals), high: Math.max(...vals) };
}
