/**
 * ราคาตลาดสด — ใช้เฉพาะหน้า /best-price เพื่อคำนวณส่วนต่างถึงเป้าจากราคาปัจจุบัน
 *
 * แหล่ง: Yahoo Finance chart endpoint (ไม่ต้องใช้ API key)
 * เป็น endpoint ที่ไม่เป็นทางการ — ถ้าล่ม/โดน rate limit ต้องไม่ทำให้หน้าพัง
 * ผู้เรียกต้อง fallback ไปใช้ price_at_run เองเมื่อไม่มีราคาของ ticker นั้น
 */

export interface Quote {
  ticker: string;
  price: number;
  currency: string | null;
  /** % เปลี่ยนแปลงของวันนั้นตามที่ Yahoo คำนวณ (เทียบราคาปิดก่อนหน้า) */
  changePct: number | null;
  /** เวลาที่ราคานี้เป็นจริง (ISO) */
  asOf: string | null;
}

const ENDPOINT = "https://query1.finance.yahoo.com/v8/finance/chart/";
const TIMEOUT_MS = 6000;
/** cache ฝั่ง server — ไม่ยิง Yahoo ใหม่ทุก request */
const REVALIDATE_SEC = 120;

async function fetchOne(ticker: string): Promise<Quote | null> {
  try {
    const res = await fetch(
      `${ENDPOINT}${encodeURIComponent(ticker)}?interval=1d&range=1d`,
      {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        next: { revalidate: REVALIDATE_SEC },
      }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;
    return {
      ticker,
      price,
      currency: typeof meta.currency === "string" ? meta.currency : null,
      changePct:
        typeof meta.regularMarketChangePercent === "number"
          ? meta.regularMarketChangePercent / 100
          : null,
      asOf:
        typeof meta.regularMarketTime === "number"
          ? new Date(meta.regularMarketTime * 1000).toISOString()
          : null,
    };
  } catch {
    return null; // timeout / network / JSON พัง — ปล่อยให้ผู้เรียก fallback
  }
}

/** ดึงราคาหลายตัวพร้อมกัน — ตัวที่ดึงไม่ได้จะไม่อยู่ใน Map */
export async function getQuotes(tickers: string[]): Promise<Map<string, Quote>> {
  const unique = [...new Set(tickers)];
  const settled = await Promise.allSettled(unique.map(fetchOne));
  const out = new Map<string, Quote>();
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value) out.set(r.value.ticker, r.value);
  }
  return out;
}
