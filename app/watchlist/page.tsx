import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { listStocksWithLatest, listLatestReviews } from "@/lib/cached";
import { listWatchTickers, watchlistAvailable } from "@/lib/watchlist";
import { PLAN_STATUS_LABEL } from "@/lib/plan-status";
import type { Review, StockOverview } from "@/lib/db";
import VerdictBadge from "@/components/VerdictBadge";
import WatchButton from "@/components/WatchButton";
import Chevron from "@/components/Chevron";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "หุ้นที่ฉันติดตาม | Tee Stock Research",
  description: "หุ้นที่คุณกดติดตามไว้ พร้อมผลทบทวนล่าสุดของแต่ละตัว",
};

/**
 * ลำดับกลุ่ม: ตัวที่รายงานบอกว่ามีความเคลื่อนไหวขึ้นก่อน — กลุ่มที่ "ไม่มีอะไรเปลี่ยน" (มักเป็นส่วนใหญ่) พับไว้
 * เดิมเป็นการ์ดเต็มทุกตัว ติดตามแค่ 10-20 ตัวก็ต้องเลื่อนยาว (ข้อความจากรอบทบทวนยาวได้ถึง 3 ประโยคต่อตัว)
 * ยังใช้คำว่า "แผนเดิมบอกว่า…" — จัดกลุ่มหุ้นที่คนนี้เลือกติดตามเอง ตามที่รายงานเขียนไว้ ไม่ใช่คำสั่งซื้อขาย
 */
// ทุกกลุ่มกางไว้เป็นค่าเริ่มต้น — เคยพับกลุ่ม "ยังไม่ต้องทำอะไร" ไว้ แต่หุ้นที่ผู้ใช้เลือกติดตามเองหายไปจากหน้าจนดูเหมือนพัง
// ความยาวหน้าคุมด้วยแถวย่อบรรทัดเดียวแล้ว ส่วนการพับกลุ่มเป็นทางเลือกของผู้ใช้เอง
const GROUPS: { key: string; open: boolean }[] = [
  { key: "plan-broken", open: true },
  { key: "plan-live", open: true },
  { key: "watch", open: true },
  { key: "no-action", open: true },
  { key: "none", open: true },
];

const groupLabel = (key: string) => (key === "none" ? "ยังไม่มีรอบทบทวน" : PLAN_STATUS_LABEL[key] ?? key);

/** แถวย่อหนึ่งบรรทัด กดแล้วกางข้อความจากรอบทบทวน — ปุ่ม ★ อยู่ในแถวแต่กดแล้วไม่กางแถว (WatchButton กัน default) */
function StockRow({ stock, review }: { stock: StockOverview; review: Review | null }) {
  const price = review?.price_at_review ?? stock.latest_price;
  return (
    <details className={`wl-row ps-${review?.plan_status ?? "none"}`}>
      <summary className="wl-sum">
        {/* ticker + ชื่อซ้อนกันเป็นก้อนเดียว — เดิมชื่อเป็นช่องแยกที่หดได้ตัวเดียวในแถว จอแคบลงนิดเดียวก็ถูกบีบจนหาย */}
        <span className="wl-id">
          <span className="wl-ticker">{stock.ticker}</span>
          <span className="wl-name">{stock.name}</span>
        </span>
        {stock.latest_verdict && <VerdictBadge verdict={stock.latest_verdict} />}
        {price != null && (
          <span className="wl-price">
            {price.toLocaleString()} {stock.currency}
            {review?.price_move_pct != null && (
              <span className={review.price_move_pct >= 0 ? "up" : "dn"}>
                {" "}
                {review.price_move_pct > 0 ? "+" : ""}
                {review.price_move_pct.toFixed(1)}%
              </span>
            )}
          </span>
        )}
        <WatchButton ticker={stock.ticker} watching compact />
        <span className="wl-chevron" aria-hidden="true">
          <Chevron />
        </span>
      </summary>

      <div className="wl-body">
        {review ? (
          <>
            {review.action_md && <p className="wl-action">{review.action_md}</p>}
            <div className="wl-meta">
              <span>ทบทวนล่าสุด {review.review_date}</span>
              <Link href={`/stock/${stock.ticker}`}>อ่านรายงานเต็ม →</Link>
            </div>
          </>
        ) : (
          <div className="wl-meta">
            <span>ยังไม่มีรอบทบทวน{stock.latest_run_date ? ` · รายงานล่าสุด ${stock.latest_run_date}` : ""}</span>
            <Link href={`/stock/${stock.ticker}`}>อ่านรายงานเต็ม →</Link>
          </div>
        )}
      </div>
    </details>
  );
}

/**
 * หุ้นที่คนนี้กด ☆ ไว้ — รายการเป็นของแต่ละคน (อ่านสดจาก lib/watchlist.ts ไม่ผ่าน cache)
 * ส่วนข้อมูลหุ้น/ผลทบทวนเป็นของกลาง ใช้ query ที่ cache ร่วมกับหน้าอื่นได้
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
    .filter((x): x is { stock: StockOverview; review: Review | null } => !!x.stock);

  const grouped = GROUPS.map((g) => ({
    ...g,
    items: items
      .filter((x) => (x.review?.plan_status ?? "none") === g.key || (g.key === "none" && !x.review))
      .sort((a, b) => a.stock.ticker.localeCompare(b.stock.ticker)),
  })).filter((g) => g.items.length > 0);
  // plan_status ที่ไม่รู้จัก (ถ้ามีในอนาคต) ไม่ให้หายไปจากหน้า — รวมไว้กลุ่มท้าย
  const known = new Set(GROUPS.map((g) => g.key));
  const unknown = items.filter((x) => x.review?.plan_status && !known.has(x.review.plan_status));
  if (unknown.length > 0) grouped.push({ key: "other", open: true, items: unknown });

  return (
    <>
      <h1>หุ้นที่ฉันติดตาม</h1>
      <p className="subtitle">
        หุ้นที่คุณกด ☆ ไว้ {items.length > 0 && <>{items.length} ตัว </>}จัดกลุ่มตามที่รอบทบทวนล่าสุดบอก — กดแถวเพื่อดูรายละเอียด
        รายการนี้เห็นเฉพาะคุณ · เพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน
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
        grouped.map((g) => (
          <details key={g.key} className={`wl-group ps-${g.key}`} open={g.open}>
            <summary className="wl-group-sum">
              <span className="wl-group-title">
                {g.key === "other" ? "สถานะอื่น" : groupLabel(g.key)}
              </span>
              <span className="sector-count">({g.items.length})</span>
              <span className="wl-chevron" aria-hidden="true">
                <Chevron />
              </span>
            </summary>
            <div className="wl-rows">
              {g.items.map(({ stock, review }) => (
                <StockRow key={stock.ticker} stock={stock} review={review} />
              ))}
            </div>
          </details>
        ))
      )}
    </>
  );
}
