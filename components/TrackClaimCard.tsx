"use client";

import { useRef } from "react";

/**
 * การ์ด/แถวของหน้า /track-record ที่กดแล้วเปิดรายละเอียดเป็น <dialog> — แบบเดียวกับ components/WatchCard.tsx
 * (ผู้ใช้ไม่ชอบ <details> กางในที่ เพราะการ์ดกระโดด + ไม่มีปุ่มพับกลับ) ปุ่มปิดเป็น ✕ อย่างเดียว + Esc + กดพื้นหลัง
 * หน้าการ์ดและรายละเอียด render ฝั่ง server แล้วส่งเข้ามาเป็น props — ไม่ต้องส่ง markdown parser ไป browser
 * data-group / data-ticker ใช้ให้ ClaimFeed ซ่อน/แสดงตามตัวกรอง
 */
export default function TrackClaimCard({
  className,
  ticker,
  title,
  face,
  detail,
  group,
  hidden,
}: {
  className: string;
  ticker: string;
  /** บรรทัดรองในหัวหน้าต่าง เช่น ผล + ประเภท */
  title: React.ReactNode;
  face: React.ReactNode;
  detail: React.ReactNode;
  group?: string;
  hidden?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = () => ref.current?.showModal();
  const close = () => ref.current?.close();

  return (
    <div className={className} data-group={group} data-ticker={group ? ticker : undefined} hidden={hidden}>
      <div
        className="tr2-open"
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-label={`ดูรายละเอียดผลตรวจ ${ticker}`}
        onClick={open}
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
        className="wc-dialog tr2-dialog"
        aria-label={`ผลตรวจ ${ticker}`}
        onClick={(e) => {
          // กดพื้นหลัง (::backdrop) = คลิกโดนตัว dialog เอง ไม่ใช่เนื้อหาข้างใน
          if (e.target === ref.current) close();
        }}
      >
        <div className="wc-dlg">
          <div className="wc-dlg-head">
            <div className="wc-dlg-id">
              <span className="wc-ticker">{ticker}</span>
              <span className="tr2-dlg-sub">{title}</span>
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
