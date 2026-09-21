import Link from "next/link";
import { listStocksWithLatest, listHints, listTrackRecordRows } from "@/lib/cached";
import { auth } from "@/auth";
import { listWatchTickers, watchlistAvailable } from "@/lib/watchlist";
import { getLatestQuotes, type Quote } from "@/lib/quote";
import { isActiveHint } from "@/lib/hint-status";
import { tally, isThesisClaim, outOf10, MIN_RESOLVED } from "@/lib/track-record";
import { sectorGroup, currencyCode, SECTOR_GROUPS } from "@/lib/sectors";
import StockBrowser, { type HomeStock } from "@/components/StockBrowser";
import HomeHero, { type HeroStat } from "@/components/HomeHero";
import HomeInsights from "@/components/HomeInsights";
import "./home.css";

export const dynamic = "force-dynamic";

/** ราคาสดต้องไม่ทำให้หน้าแรกช้า — รอไม่เกินนี้ ที่ยังไม่มาใช้ราคาจากรอบทบทวน/รายงานแทน */
const QUOTE_WAIT_MS = 2500;
/** "ทบทวนใน N วัน" ของหัวหน้า — รอบทบทวนเป็นรายสัปดาห์ เผื่อ 1 วันให้คิวที่ทำข้ามวัน */
const REVIEW_WINDOW_DAYS = 8;

/** วันที่ 'YYYY-MM-DD' → "18 ก.ย." */
const fmtDay = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("th-TH", { timeZone: "UTC", day: "numeric", month: "short" });

/** วันนี้ตามเวลาไทย ลบ n วัน → 'YYYY-MM-DD' (เทียบกับ review_date ที่เก็บเป็นวันที่ล้วน) */
function bangkokDaysAgo(n: number): string {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const t = new Date(today + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() - n);
  return t.toISOString().slice(0, 10);
}

export default async function HomePage() {
  // รายการ ☆ ติดตามเป็นของแต่ละคน — อ่านสด (ไม่ผ่าน cache) คู่ขนานกับข้อมูลหุ้นที่ cache ร่วมกัน
  const session = await auth();
  const email = session?.user?.email ?? null;
  const [stocks, hints, watched, trackRows] = await Promise.all([
    listStocksWithLatest(),
    listHints(),
    email ? listWatchTickers(email) : Promise.resolve([] as string[]),
    // สถิติของหัวหน้าเป็นแค่ส่วนประกอบ — query นี้พังต้องไม่ทำให้รายชื่อหุ้นหาย
    listTrackRecordRows().catch(() => []),
  ]);

  // ราคาสดเหมือน /watchlist แต่มีเพดานเวลา (หน้าแรกดึงทุกตัว) — ดึงไม่ทัน/ดึงไม่ได้ = ราคาจาก DB หน้าไม่พัง
  const empty = new Map<string, Quote>();
  const quotes =
    stocks.length > 0
      ? await Promise.race([
          getLatestQuotes(stocks.map((s) => s.ticker)).catch(() => empty),
          new Promise<Map<string, Quote>>((r) => setTimeout(() => r(empty), QUOTE_WAIT_MS)),
        ])
      : empty;

  const watchedSet = new Set(watched);
  const homeStocks: HomeStock[] = stocks.map((s) => {
    const q = quotes.get(s.ticker);
    // ราคาจาก DB: รอบทบทวนถ้าใหม่กว่ารายงานเต็มครั้งล่าสุด (ทบทวนไม่สร้าง run ใหม่)
    const reviewIsNewer = !!s.latest_review_date && (!s.latest_run_date || s.latest_review_date > s.latest_run_date);
    const dbPrice = reviewIsNewer ? (s.latest_review_price ?? s.latest_price) : s.latest_price;
    const dbDate = reviewIsNewer ? s.latest_review_date : s.latest_run_date;
    return {
      ticker: s.ticker,
      name: s.name,
      group: sectorGroup(s.sector).key,
      verdict: s.latest_verdict,
      price: q ? q.price : dbPrice,
      currency: currencyCode(q?.currency) || currencyCode(s.currency),
      move: q?.changePct != null ? q.changePct * 100 : null,
      asOf: !q && dbPrice != null && dbDate ? `ราคา ณ ${fmtDay(dbDate)}` : null,
      watched: watchedSet.has(s.ticker),
    };
  });
  homeStocks.sort((a, b) => a.ticker.localeCompare(b.ticker));

  // ---- ตัวเลขหัวหน้า (ทุกตัวมาจาก DB) ----
  const cutoff = bangkokDaysAgo(REVIEW_WINDOW_DAYS);
  const reviewedRecently = stocks.filter((s) => s.latest_review_date && s.latest_review_date >= cutoff).length;
  // สูตรเดียวกับการ์ด "ทฤษฎีของเราถูกบ่อยแค่ไหน?" หน้า /track-record: นับเฉพาะ assumption/catalyst ที่รู้ผลแล้ว (risk แยกเพราะความหมายกลับกัน)
  const thesis = tally(trackRows.filter(isThesisClaim));
  const stats: HeroStat[] = [
    { value: String(stocks.length), label: "หุ้นในระบบ" },
    { value: String(reviewedRecently), label: `ตัวทบทวนใน ${REVIEW_WINDOW_DAYS} วันล่าสุด` },
  ];
  if (thesis.confirmRate != null && thesis.resolved >= MIN_RESOLVED) {
    stats.push({
      value: `${outOf10(thesis.confirmRate)} ใน 10`,
      label: `ทฤษฎีที่รู้ผลแล้วทายถูก (${thesis.resolved} ข้อ)`,
      href: "/track-record",
    });
  } else if (thesis.total > 0) {
    stats.push({ value: String(thesis.total), label: "ข้อทำนายที่ถูกตรวจแล้ว", href: "/track-record" });
  }

  // insight: 3 เรื่องที่ impact สูงสุดที่ยังมีผลอยู่ (เรื่องที่ปิดแล้วดูได้ที่ /insights)
  const topHints = hints
    .filter((h) => isActiveHint(h.status))
    .sort((a, b) => (b.impact_score ?? 0) - (a.impact_score ?? 0) || b.run_date.localeCompare(a.run_date))
    .slice(0, 3);

  return (
    <div className="hm">
      <HomeHero stats={stats} />

      <section className="hm-all" aria-labelledby="hm-all-title">
        <div className="hm-sec-head">
          {/* ไม่ใช้ "หุ้นที่ติดตาม" — ชนกับเมนู "หุ้นที่ฉันติดตาม" (/watchlist) */}
          <h2 id="hm-all-title" className="hm-sec-title">
            หุ้นทั้งหมดในระบบ
          </h2>
          {stocks.length > 0 && (
            <Link href="/best-price" className="hm-sec-link">
              🏆 ราคาน่าสนใจที่สุดตอนนี้ →
            </Link>
          )}
        </div>

        {stocks.length === 0 ? (
          <div className="empty-state">
            ยังไม่มีข้อมูลหุ้นในระบบ — สั่ง research หุ้นตัวแรกผ่าน Claude Code ด้วยคำสั่ง{" "}
            <code>/research-stock &lt;TICKER&gt;</code>
          </div>
        ) : (
          <StockBrowser stocks={homeStocks} groups={SECTOR_GROUPS} canWatch={!!email && watchlistAvailable} />
        )}
      </section>

      <HomeInsights hints={topHints} total={hints.length} />
    </div>
  );
}
