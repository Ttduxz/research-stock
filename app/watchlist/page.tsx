import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/auth";
import {
  listStocksWithLatest,
  listLatestReviews,
  listHints,
  listLatestRunInsightSlugs,
  listLatestSnapshots,
} from "@/lib/cached";
import { listWatchTickers, watchlistAvailable } from "@/lib/watchlist";
import { getBriefBaseline, getWatchBrief } from "@/lib/watch-brief";
import { isActiveHint } from "@/lib/hint-status";
import { getLatestQuotes, type Quote } from "@/lib/quote";
import type { Review, StockOverview } from "@/lib/db";
import WatchlistSeen from "@/components/WatchlistSeen";
import { parseTranches, zoneInfo } from "@/components/PlanZone";
import WatchFilter from "@/components/WatchFilter";
import { Card, PLAN_ORDER, PLAN_SHORT, changeTags, type WatchRow } from "./views";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "หุ้นที่ฉันติดตาม | Tee Stock Research",
  description: "หุ้นที่คุณกดติดตามไว้ อะไรใหม่ตั้งแต่ครั้งก่อน และราคาเทียบแผนของแต่ละตัว",
};

/**
 * หน้านี้ต้องสแกนได้ในไม่กี่วินาที — ผู้ใช้บอกว่าแบบแถว+ประโยค "ตัวหนังสือ overload ไม่น่าอ่าน"
 * ข้อความยาว (action_md ของรอบทบทวน, insight) อยู่ตอนกดเท่านั้น · หุ้นแต่ละตัวอยู่ที่เดียวบนหน้า
 * การ์ดอยู่ app/watchlist/views.tsx · ชิปสถานะด้านบนกดกรองได้ (components/WatchFilter.tsx)
 */

/** เวลาเก็บเป็น UTC ('YYYY-MM-DD HH:MM:SS') — แสดงเป็นเวลาไทย */
const fmtSince = (since: string) =>
  new Date(since.replace(" ", "T") + "Z").toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/** วันที่ 'YYYY-MM-DD' → "21 ก.ย." */
const fmtDay = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("th-TH", { timeZone: "UTC", day: "numeric", month: "short" });

/** เวลาของราคาสด (เวลาไทย) — วันเดียวกันบอกแค่เวลา ถ้าเป็นราคาปิดของวันก่อน (ตลาดปิด) บอกวันที่แทน */
function fmtQuoteTime(asOf: string | null): string | null {
  if (!asOf) return null;
  const t = new Date(asOf);
  if (Number.isNaN(t.getTime())) return null;
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  return day(t) === day(new Date())
    ? t.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" })
    : t.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short" });
}

/**
 * รายการติดตามเป็นของแต่ละคน (อ่านสดจาก lib/watchlist.ts + lib/watch-brief.ts ไม่ผ่าน cache)
 * ส่วนข้อมูลหุ้น/ผลทบทวน/แผนเป็นของกลาง ใช้ query ที่ cache ร่วมกับหน้าอื่นได้
 */
export default async function WatchlistPage() {
  const session = await auth();
  const email = session?.user?.email ?? null;

  const [tickers, stocks, reviews, hints, insightSlugs, snapshots, baseline] = await Promise.all([
    email ? listWatchTickers(email) : Promise.resolve([] as string[]),
    listStocksWithLatest(),
    listLatestReviews(),
    listHints(),
    listLatestRunInsightSlugs(),
    listLatestSnapshots(),
    email && watchlistAvailable ? getBriefBaseline(email) : Promise.resolve(null),
  ]);
  const stockBy = new Map(stocks.map((s) => [s.ticker, s]));
  const reviewBy = new Map(reviews.map((r) => [r.ticker, r]));
  const planBy = new Map(snapshots.map((s) => [s.stock.ticker, s.run.entry_plan_json]));
  const activeHints = hints.filter((h) => isActiveHint(h.status));
  // หุ้นที่ถูกลบออกจากระบบไปแล้วแต่ยังค้างในรายการติดตาม — ข้ามไป ไม่ทำให้หน้าพัง
  const items = tickers
    .map((t) => ({ stock: stockBy.get(t), review: reviewBy.get(t) ?? null }))
    .filter((x): x is { stock: StockOverview; review: Review | null } => !!x.stock);

  // ราคาสดยิงพร้อมกับ brief — ดึงไม่ได้/ช้าเกิน timeout ของ lib/quote.ts = ตัวนั้น fallback เป็นราคาจากรอบทบทวน หน้าไม่พัง
  const watched = items.map((x) => x.stock.ticker);
  const [brief, quotes] = await Promise.all([
    baseline ? getWatchBrief(watched, baseline, insightSlugs) : Promise.resolve(null),
    watched.length > 0 ? getLatestQuotes(watched).catch(() => new Map<string, Quote>()) : Promise.resolve(new Map<string, Quote>()),
  ]);
  const changeBy = new Map((brief?.entries ?? []).map((e) => [e.ticker, e]));

  const rows: WatchRow[] = items.map(({ stock, review }) => {
    // ราคาสดใช้แค่แสดงราคา + ตำแหน่งบนแถบไม้ — สถานะแผนยังมาจาก plan_status ของรอบทบทวนเท่านั้น
    const quote = quotes.get(stock.ticker) ?? null;
    const fallback = review?.price_at_review ?? stock.latest_price;
    const price = quote ? quote.price : fallback;
    const fallbackDate = review?.price_at_review != null ? review.review_date : stock.latest_run_date;
    const priceLabel = quote
      ? { text: `ราคา ${fmtQuoteTime(quote.asOf) ?? "ล่าสุด"}`, live: true }
      : fallback != null && fallbackDate
        ? { text: `ราคา ณ ${review?.price_at_review != null ? "ทบทวน" : "รายงาน"} ${fmtDay(fallbackDate)}`, live: false }
        : null;
    const change = changeBy.get(stock.ticker) ?? null;
    const slugs = new Set(insightSlugs[stock.ticker] ?? []);
    const tranches = parseTranches(planBy.get(stock.ticker) ?? null);
    return {
      stock,
      review,
      plan: review?.plan_status ?? "none",
      price,
      move: quote ? (quote.changePct != null ? quote.changePct * 100 : null) : (review?.price_move_pct ?? null),
      moveTitle: quote ? "เปลี่ยนแปลงวันนี้" : "เทียบราคาวันที่ทำรายงาน",
      priceLabel,
      tranches,
      zone: price != null ? zoneInfo(tranches, price) : null,
      change,
      tags: change ? changeTags(change) : [],
      insights: activeHints.filter((h) => slugs.has(h.slug)),
    };
  });
  const rowBy = new Map(rows.map((r) => [r.stock.ticker, r]));
  const rank = (p: string) => PLAN_ORDER.indexOf(p) + 1 || 9;
  // มีเรื่องใหม่: เรียงตามความสำคัญของสิ่งที่เปลี่ยน (lib/watch-brief.ts) · ที่เหลือ: ตามสถานะแผน แล้วตามตัวอักษร
  const fresh = (brief?.entries ?? []).map((e) => rowBy.get(e.ticker)!).filter(Boolean);
  const rest = rows
    .filter((r) => !r.change)
    .sort((a, b) => rank(a.plan) - rank(b.plan) || a.stock.ticker.localeCompare(b.stock.ticker));
  const counts = PLAN_ORDER.map((plan) => ({ plan, label: PLAN_SHORT[plan] ?? plan, n: rows.filter((r) => r.plan === plan).length })).filter(
    (c) => c.n > 0
  );
  const sinceText = brief ? (brief.firstVisit ? "ใน 7 วันที่ผ่านมา" : `ตั้งแต่ ${fmtSince(brief.since)}`) : null;

  return (
    <>
      <h1>หุ้นที่ฉันติดตาม</h1>
      <p className="subtitle">เห็นเฉพาะคุณ · เพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน</p>

      {!watchlistAvailable ? (
        <div className="empty-state">ระบบติดตามหุ้นยังใช้ไม่ได้ในโหมดข้อมูลปัจจุบัน</div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          ยังไม่ได้ติดตามหุ้นตัวไหน — เปิดหน้าหุ้นที่สนใจแล้วกด <b>☆ ติดตาม</b> ข้างชื่อหุ้น
          <br />
          <Link href="/">ดูหุ้นทั้งหมด →</Link>
        </div>
      ) : (
        <>
          <WatchlistSeen />
          <WatchFilter counts={counts}>
            <section className="wl-sec">
              <div className="wl-sec-head">
                <h2 className="wl-sec-title">มีเรื่องใหม่</h2>
                {sinceText && <span className="wl-sec-note">{sinceText}</span>}
              </div>
              {fresh.length > 0 ? (
                <div className="wl-grid">
                  {fresh.map((r) => (
                    <Card key={r.stock.ticker} row={r} />
                  ))}
                </div>
              ) : (
                <p className="wl-none">ไม่มีอะไรใหม่ — สัปดาห์ส่วนใหญ่เป็นแบบนี้</p>
              )}
            </section>
            {rest.length > 0 && (
              <section className="wl-sec">
                <div className="wl-sec-head">
                  <h2 className="wl-sec-title">ที่เหลือ</h2>
                  <span className="wl-sec-note">ไม่มีอะไรใหม่ · กดการ์ดเพื่ออ่านรอบทบทวนล่าสุด</span>
                </div>
                <div className="wl-grid">
                  {rest.map((r) => (
                    <Card key={r.stock.ticker} row={r} />
                  ))}
                </div>
              </section>
            )}
          </WatchFilter>

          <p className="wl-foot">
            &quot;ไม้&quot; = ช่วงราคาในแผนสะสมแบ่งไม้ของรายงาน · สถานะแผนมาจากรอบทบทวนล่าสุด
            {brief && brief.otherNewInsights > 0 && (
              <>
                {" "}
                · <Link href="/insights">insight ใหม่อีก {brief.otherNewInsights} เรื่อง →</Link>
              </>
            )}
          </p>
        </>
      )}
    </>
  );
}
