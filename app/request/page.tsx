import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { listMyRequests, requestsAvailable, MAX_OPEN_REQUESTS_PER_USER } from "@/lib/stock-requests";
import RequestStockForm from "@/components/RequestStockForm";
import "./request.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ขอให้วิเคราะห์หุ้น | Tee Stock Research",
  description: "ส่ง ticker ของหุ้นที่ยังไม่มีในระบบให้ทีมพิจารณาวิเคราะห์",
};

/** created_at เป็น UTC "YYYY-MM-DD HH:MM:SS" → วันที่ไทยสั้น (21 ก.ย.) */
const fmtDate = (utc: string) => {
  const d = new Date(utc.replace(" ", "T") + (utc.includes("Z") ? "" : "Z"));
  return Number.isNaN(d.getTime())
    ? utc.slice(0, 10)
    : d.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "2-digit" });
};

/**
 * เมนู "ขอให้วิเคราะห์หุ้น" — ฟอร์มขอ + คำขอของคนนี้เองพร้อมสถานะ
 * ผลค้นหาที่ไม่เจอบนหน้ารวมหุ้นลิงก์มาที่นี่พร้อม ?ticker= ให้เติมไว้ในฟอร์ม
 * รายการเป็นของแต่ละคน อ่านสดจาก lib/stock-requests.ts (ไม่ผ่าน cache)
 */
export default async function RequestPage({ searchParams }: { searchParams: Promise<{ ticker?: string }> }) {
  const session = await auth();
  const email = session?.user?.email ?? null;
  const { ticker: rawTicker } = await searchParams;
  // เติมในฟอร์มเฉพาะค่าที่หน้าตาเป็น ticker — กันข้อความแปลกๆ จาก URL ไปโผล่ในช่องกรอก
  const prefill = /^[A-Za-z0-9.\-]{1,15}$/.test(rawTicker ?? "") ? rawTicker!.toUpperCase() : "";

  const mine = email ? await listMyRequests(email) : [];
  const waiting = mine.filter((r) => !r.in_system);
  const done = mine.filter((r) => r.in_system);

  return (
    <div className="rq2">
      <header className="rq2-head">
        <h1>ขอให้วิเคราะห์หุ้น</h1>
        <p className="rq2-lead">ไม่เจอหุ้นที่สนใจ? ส่งชื่อย่อหุ้นมาได้ ทีมจะเลือกวิเคราะห์ตัวที่มีคนขอมากก่อน</p>
      </header>

      {!requestsAvailable ? (
        <div className="rq2-none">ระบบคำขอยังใช้ไม่ได้ในตอนนี้</div>
      ) : (
        <>
          <section className="rq2-card" aria-label="ส่งคำขอ">
            {/* key = ticker ที่เติมมา: กดลิงก์จากผลค้นหาตัวใหม่แล้วฟอร์มเริ่มใหม่ ไม่ค้างข้อความของคำขอก่อน */}
            <RequestStockForm key={prefill} defaultTicker={prefill} />
            <ul className="rq2-facts">
              <li>ใช้เวลาเป็นวัน ไม่ใช่ทันที</li>
              <li>ไม่รับประกันว่าจะวิเคราะห์ทุกตัว</li>
              <li>ขอค้างไว้ได้สูงสุด {MAX_OPEN_REQUESTS_PER_USER} ตัว</li>
            </ul>
          </section>

          <section className="rq2-mine">
            <div className="rq2-mine-head">
              <h2 className="rq2-h2">คำขอของคุณ</h2>
              {mine.length > 0 && (
                <span className="rq2-tally">
                  <span className="rq2-tally-wait">
                    รอวิเคราะห์ <b>{waiting.length}</b>/{MAX_OPEN_REQUESTS_PER_USER}
                  </span>
                  <span className="rq2-tally-done">
                    มีรายงานแล้ว <b>{done.length}</b>
                  </span>
                </span>
              )}
            </div>
            {mine.length === 0 ? (
              <p className="rq2-empty">ยังไม่เคยส่งคำขอ</p>
            ) : (
              <ul className="rq2-list">
                {[...waiting, ...done].map((r) => (
                  <li key={r.ticker} className={r.in_system ? "is-done" : "is-wait"}>
                    <span className="rq2-ticker">{r.ticker}</span>
                    {r.in_system ? (
                      <Link href={`/stock/${r.ticker}`} className="rq2-state done">
                        มีรายงานแล้ว →
                      </Link>
                    ) : (
                      <span className="rq2-state">รอวิเคราะห์</span>
                    )}
                    <span className="rq2-date">{fmtDate(r.created_at)}</span>
                    {r.note && <span className="rq2-note">{r.note}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
