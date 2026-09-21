"use client";

import { useRef } from "react";

/**
 * การ์ดหน้า /watchlist: หน้าการ์ดกดแล้วเปิดหน้าต่างรายละเอียด (<dialog>) — เดิมเป็น <details> กางในที่
 * ผู้ใช้บอกว่ากางแล้ว "การเรียงหน้าแปลก" (การ์ดกระโดดไปเต็มแถว ตารางจัดใหม่ทั้งหน้า) และ "ไม่มี ui บอกว่าพับกลับได้"
 * หน้าต่างมีปุ่ม ✕ (ผู้ใช้ขอไม่ต้องมีคำว่า "ปิด") + Esc + กดพื้นหลังเพื่อปิด · มือถือเป็น bottom sheet (CSS)
 * เนื้อหาทั้งหน้าการ์ดและรายละเอียด render ฝั่ง server แล้วส่งเข้ามาเป็น props
 */
export default function WatchCard({
  className,
  plan,
  ticker,
  name,
  face,
  detail,
}: {
  className: string;
  plan: string;
  ticker: string;
  name: string;
  face: React.ReactNode;
  detail: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = () => ref.current?.showModal();
  const close = () => ref.current?.close();

  return (
    <div className={className} data-plan={plan}>
      <div
        className="wc-sum"
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-label={`ดูรายละเอียด ${ticker}`}
        onClick={(e) => {
          // ปุ่ม ★ ในหน้าการ์ดกัน default ไว้แล้ว (WatchButton) — กดดาวต้องไม่เปิดหน้าต่าง
          if (!e.defaultPrevented) open();
        }}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
            e.preventDefault();
            open();
          }
        }}
      >
        {face}
      </div>
      <dialog
        ref={ref}
        className="wc-dialog"
        aria-label={`รายละเอียด ${ticker}`}
        onClick={(e) => {
          // กดพื้นหลัง (::backdrop) = คลิกโดนตัว dialog เอง ไม่ใช่เนื้อหาข้างใน
          if (e.target === ref.current) close();
        }}
      >
        <div className="wc-dlg">
          <div className="wc-dlg-head">
            <div className="wc-dlg-id">
              <span className="wc-ticker">{ticker}</span>
              <span className="wc-name">{name}</span>
            </div>
            <button type="button" className="wc-close" onClick={close} aria-label="ปิด" title="ปิด" autoFocus>
              ✕
            </button>
          </div>
          {detail}
        </div>
      </dialog>
    </div>
  );
}
