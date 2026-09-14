import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { listMyRequests, requestsAvailable, MAX_OPEN_REQUESTS_PER_USER } from "@/lib/stock-requests";
import RequestStockForm from "@/components/RequestStockForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ขอให้วิเคราะห์หุ้น | Tee Stock Research",
  description: "ส่ง ticker ของหุ้นที่ยังไม่มีในระบบให้ทีมพิจารณาวิเคราะห์",
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
    <>
      <h1>ขอให้วิเคราะห์หุ้น</h1>
      <p className="subtitle">
        ไม่เจอหุ้นที่สนใจในระบบ? ส่ง ticker มาได้ ทีมจะเลือกวิเคราะห์ตามจำนวนคนที่ขอ — ไม่รับประกันว่าจะทำทุกตัว
        และใช้เวลาเป็นวันไม่ใช่ทันที · ขอค้างไว้ได้สูงสุด {MAX_OPEN_REQUESTS_PER_USER} ตัว
      </p>

      {!requestsAvailable ? (
        <div className="empty-state">ระบบคำขอยังใช้ไม่ได้ในโหมดข้อมูลปัจจุบัน</div>
      ) : (
        <>
          {/* key = ticker ที่เติมมา: กดลิงก์จากผลค้นหาตัวใหม่แล้วฟอร์มเริ่มใหม่ ไม่ค้างข้อความของคำขอก่อน */}
          <RequestStockForm key={prefill} defaultTicker={prefill} />

          <h2 className="sector-heading">
            คำขอของคุณ <span className="sector-count">({mine.length})</span>
          </h2>
          {mine.length === 0 ? (
            <p className="req-empty">ยังไม่เคยส่งคำขอ</p>
          ) : (
            <ul className="req-mine">
              {[...waiting, ...done].map((r) => (
                <li key={r.ticker} className={r.in_system ? "done" : ""}>
                  <span className="req-ticker">{r.ticker}</span>
                  {r.in_system ? (
                    <Link href={`/stock/${r.ticker}`} className="req-state done">
                      มีรายงานแล้ว →
                    </Link>
                  ) : (
                    <span className="req-state">รอวิเคราะห์</span>
                  )}
                  <span className="req-date">ขอเมื่อ {r.created_at.slice(0, 10)}</span>
                  {r.note && <span className="req-note">{r.note}</span>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
