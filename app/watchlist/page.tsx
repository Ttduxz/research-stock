import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { listStocksWithLatest, listLatestReviews } from "@/lib/cached";
import { listWatchTickers, watchlistAvailable } from "@/lib/watchlist";
import { PLAN_STATUS_LABEL } from "@/lib/plan-status";
import VerdictBadge from "@/components/VerdictBadge";
import WatchButton from "@/components/WatchButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "หุ้นที่ฉันติดตาม | Tee Stock Research",
  description: "หุ้นที่คุณกดติดตามไว้ พร้อมผลทบทวนล่าสุดของแต่ละตัว",
};

/**
 * หุ้นที่คนนี้กด ☆ ไว้ — รายการเป็นของแต่ละคน (อ่านสดจาก lib/watchlist.ts ไม่ผ่าน cache)
 * ส่วนข้อมูลหุ้น/ผลทบทวนเป็นของกลาง ใช้ query ที่ cache ร่วมกับหน้าอื่นได้
 *
 * ใช้คำว่า "แผนเดิมบอกว่า…" ไม่ใช่ "คุณต้องทำ…" — เว็บนี้เป็นคลังหุ้นรวมเพื่อการศึกษา
 * สิ่งที่แสดงคือสิ่งที่รายงานเขียนไว้ ไม่ใช่คำสั่งซื้อขายถึงคนอ่าน
 */
export default async function WatchlistPage() {
  const session = await auth();
  const email = session?.user?.email ?? null;

  const [tickers, stocks, reviews] = await Promise.all([
    email ? listWatchTickers(email) : Promise.resolve([] as string[]),
    listStocksWithLatest(),
    listLatestReviews(),
  ]);
  const stockBy = new Map(stocks.map((s) => [s.ticker, s]));
  const reviewBy = new Map(reviews.map((r) => [r.ticker, r]));
  // หุ้นที่ถูกลบออกจากระบบไปแล้วแต่ยังค้างในรายการติดตาม — ข้ามไป ไม่ทำให้หน้าพัง
  const items = tickers
    .map((t) => ({ stock: stockBy.get(t), review: reviewBy.get(t) ?? null }))
    .filter((x): x is { stock: NonNullable<typeof x.stock>; review: typeof x.review } => !!x.stock);

  return (
    <>
      <h1>หุ้นที่ฉันติดตาม</h1>
      <p className="subtitle">
        หุ้นที่คุณกด ☆ ไว้ พร้อมผลทบทวนล่าสุดของแต่ละตัว — รายการนี้เห็นเฉพาะคุณ
        เนื้อหามาจากแผนที่รายงานเขียนไว้ เพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน
      </p>

      {!watchlistAvailable ? (
        <div className="empty-state">ระบบติดตามหุ้นยังใช้ไม่ได้ในโหมดข้อมูลปัจจุบัน</div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          ยังไม่ได้ติดตามหุ้นตัวไหน — เปิดหน้าหุ้นที่สนใจแล้วกด <b>☆ ติดตาม</b> ข้างชื่อหุ้น
          <br />
          <Link href="/">ดูหุ้นทั้งหมด →</Link>
        </div>
      ) : (
        <div className="wl-list">
          {items.map(({ stock, review }) => (
            <article key={stock.ticker} className={`wl-card ps-${review?.plan_status ?? "none"}`}>
              <div className="wl-head">
                <Link href={`/stock/${stock.ticker}`} className="wl-ticker">
                  {stock.ticker}
                </Link>
                <span className="wl-name">{stock.name}</span>
                {stock.latest_verdict && <VerdictBadge verdict={stock.latest_verdict} />}
                <WatchButton ticker={stock.ticker} watching compact />
              </div>

              {review ? (
                <>
                  <div className="wl-plan">
                    แผนเดิมบอกว่า: {PLAN_STATUS_LABEL[review.plan_status ?? ""] ?? "สรุปจากรอบทบทวน"}
                  </div>
                  {review.action_md && <p className="wl-action">{review.action_md}</p>}
                  <div className="wl-meta">
                    <span>ทบทวนล่าสุด {review.review_date}</span>
                    {review.price_at_review != null && (
                      <span>
                        ราคา {review.price_at_review.toLocaleString()} {stock.currency}
                        {review.price_move_pct != null && (
                          <>
                            {" "}
                            ({review.price_move_pct > 0 ? "+" : ""}
                            {review.price_move_pct.toFixed(1)}% จากวันทำรายงาน)
                          </>
                        )}
                      </span>
                    )}
                    <Link href={`/stock/${stock.ticker}`}>อ่านรายงานเต็ม →</Link>
                  </div>
                </>
              ) : (
                <div className="wl-meta">
                  <span>ยังไม่มีรอบทบทวน{stock.latest_run_date ? ` · รายงานล่าสุด ${stock.latest_run_date}` : ""}</span>
                  <Link href={`/stock/${stock.ticker}`}>อ่านรายงานเต็ม →</Link>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
