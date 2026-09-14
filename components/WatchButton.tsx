"use client";

import { useOptimistic, useTransition } from "react";
import { toggleWatch } from "@/app/watchlist/actions";

/**
 * ปุ่ม ☆ ติดตาม — เปลี่ยนสถานะบนจอทันที (useOptimistic) แล้วค่อยบันทึกเบื้องหลัง
 * ถ้าบันทึกไม่สำเร็จ React คืนสถานะเดิมให้เอง (ค่า watching จาก server ไม่เปลี่ยน)
 */
export default function WatchButton({
  ticker,
  watching,
  compact = false,
}: {
  ticker: string;
  watching: boolean;
  /** แสดงแค่ดาว ไม่มีข้อความ — ใช้ในการ์ดหน้า /watchlist */
  compact?: boolean;
}) {
  const [shown, setShown] = useOptimistic(watching);
  const [pending, startTransition] = useTransition();

  const label = shown ? `เลิกติดตาม ${ticker}` : `ติดตาม ${ticker}`;

  return (
    <button
      type="button"
      className={`watch-btn ${shown ? "on" : ""} ${compact ? "compact" : ""}`}
      aria-pressed={shown}
      aria-label={label}
      title={label}
      data-pending={pending ? "" : undefined}
      onClick={(e) => {
        // ปุ่มนี้อยู่ในแถวที่กดกางได้ (<summary> หน้า /watchlist) — กัน default ไม่ให้กด ★ แล้วแถวกาง/หุบไปด้วย
        e.preventDefault();
        startTransition(async () => {
          setShown(!shown);
          await toggleWatch(ticker, !shown);
        });
      }}
    >
      <span className="watch-star" aria-hidden="true">
        {shown ? "★" : "☆"}
      </span>
      {!compact && <span>{shown ? "ติดตามแล้ว" : "ติดตาม"}</span>}
    </button>
  );
}
