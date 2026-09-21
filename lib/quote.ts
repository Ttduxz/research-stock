/**
 * ราคาตลาดสด — ใช้ 2 หน้า:
 *  - /best-price (getQuotes) คำนวณส่วนต่างถึงเป้าจากราคาปัจจุบัน + ราคาปิด ~2 ปีสำหรับ EMA
 *  - /watchlist (getLatestQuotes) ราคาล่าสุด + % วันนี้บนการ์ด ดึงช่วง 1 วันพอ
 *
 * แหล่ง: Yahoo Finance chart endpoint (ไม่ต้องใช้ API key)
 * เป็น endpoint ที่ไม่เป็นทางการ — ถ้าล่ม/โดน rate limit ต้องไม่ทำให้หน้าพัง
 * ผู้เรียกต้อง fallback เองเมื่อไม่มีราคาของ ticker นั้น (/best-price → price_at_run, /watchlist → price_at_review)
 */

export interface Quote {
  ticker: string;
  price: number;
  currency: string | null;
  /** % เปลี่ยนแปลงของวันนั้นตามที่ Yahoo คำนวณ (เทียบราคาปิดก่อนหน้า) */
  changePct: number | null;
  /** เวลาที่ราคานี้เป็นจริง (ISO) */
  asOf: string | null;
  /** ราคาปิดรายวัน ~2 ปี เรียงเก่า→ใหม่ (adjclose ถ้ามี ไม่งั้น close, filter null แล้ว) — null ถ้าดึง/parse ไม่ได้
   *  ยาว 2 ปีเพื่อให้ EMA200 warm-up พอ (ดู lib/indicators.ts) ไม่ใช่แค่ 1 ปี */
  closes: number[] | null;
}

const ENDPOINT = "https://query1.finance.yahoo.com/v8/finance/chart/";
const TIMEOUT_MS = 6000;
/** cache ฝั่ง server — ไม่ยิง Yahoo ใหม่ทุก request */
const REVALIDATE_SEC = 120;

async function fetchChart(ticker: string, range: string): Promise<Response> {
  return fetch(`${ENDPOINT}${encodeURIComponent(ticker)}?interval=1d&range=${range}`, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    next: { revalidate: REVALIDATE_SEC },
  });
}

function parseQuote(ticker: string, json: unknown): Quote | null {
  const result = (json as { chart?: { result?: unknown[] } })?.chart?.result?.[0] as
    | {
        meta?: {
          regularMarketPrice?: number;
          currency?: string;
          regularMarketChangePercent?: number;
          regularMarketTime?: number;
        };
        indicators?: { adjclose?: { adjclose?: (number | null)[] }[]; quote?: { close?: (number | null)[] }[] };
      }
    | undefined;
  const meta = result?.meta;
  const price = meta?.regularMarketPrice;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;

  const rawCloses =
    result?.indicators?.adjclose?.[0]?.adjclose ?? result?.indicators?.quote?.[0]?.close ?? null;
  const closes = rawCloses
    ? rawCloses.filter((c): c is number => typeof c === "number" && Number.isFinite(c) && c > 0)
    : null;

  return {
    ticker,
    price,
    currency: typeof meta?.currency === "string" ? meta.currency : null,
    changePct:
      typeof meta?.regularMarketChangePercent === "number" ? meta.regularMarketChangePercent / 100 : null,
    asOf: typeof meta?.regularMarketTime === "number" ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
    closes: closes && closes.length > 0 ? closes : null,
  };
}

async function fetchOne(ticker: string): Promise<Quote | null> {
  try {
    const res = await fetchChart(ticker, "2y");
    if (res.ok) {
      const parsed = parseQuote(ticker, await res.json());
      if (parsed) return parsed;
    }
  } catch {
    // ตกไป retry แบบ 1d ด้านล่าง — ราคาสดสำคัญกว่า history
  }
  try {
    const res = await fetchChart(ticker, "1d");
    if (!res.ok) return null;
    return parseQuote(ticker, await res.json());
  } catch {
    return null; // timeout / network / JSON พัง — ปล่อยให้ผู้เรียก fallback
  }
}

/** ดึงหลายตัวพร้อมกัน — ตัวที่ดึงไม่ได้จะไม่อยู่ใน Map */
async function fetchMany(tickers: string[], one: (t: string) => Promise<Quote | null>): Promise<Map<string, Quote>> {
  const unique = [...new Set(tickers)];
  const settled = await Promise.allSettled(unique.map(one));
  const out = new Map<string, Quote>();
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value) out.set(r.value.ticker, r.value);
  }
  return out;
}

/** ราคา + ราคาปิด ~2 ปี (EMA ของ /best-price) */
export async function getQuotes(tickers: string[]): Promise<Map<string, Quote>> {
  return fetchMany(tickers, fetchOne);
}

async function fetchLatest(ticker: string): Promise<Quote | null> {
  try {
    const res = await fetchChart(ticker, "1d");
    if (!res.ok) return null;
    const json = await res.json();
    const q = parseQuote(ticker, json);
    if (!q) return null;
    // บางตัว Yahoo ไม่ส่ง regularMarketChangePercent — ช่วง 1d นี้ chartPreviousClose = ราคาปิดวันก่อน คำนวณเองได้
    // (ใช้ได้เฉพาะ range=1d — ช่วงยาวกว่านี้ chartPreviousClose คือราคาก่อนต้นช่วง จึงไม่ใส่ไว้ใน parseQuote)
    if (q.changePct == null) {
      const prev = (json as { chart?: { result?: { meta?: { chartPreviousClose?: number } }[] } })?.chart?.result?.[0]
        ?.meta?.chartPreviousClose;
      if (typeof prev === "number" && Number.isFinite(prev) && prev > 0) q.changePct = q.price / prev - 1;
    }
    return { ...q, closes: null };
  } catch {
    return null; // timeout / network / JSON พัง — ผู้เรียก fallback เป็นราคาจากรอบทบทวน
  }
}

/** ราคาล่าสุดอย่างเดียว (closes = null) — ยิงช่วง 1 วัน เบากว่า getQuotes มาก ใช้กับหน้าที่ไม่ต้องใช้ history */
export async function getLatestQuotes(tickers: string[]): Promise<Map<string, Quote>> {
  return fetchMany(tickers, fetchLatest);
}
