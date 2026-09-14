"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestStock } from "@/app/request/actions";
import type { RequestState } from "@/lib/stock-requests";

/**
 * ฟอร์มขอให้วิเคราะห์หุ้น — ใช้ท้ายหน้ารวมหุ้น และในผลค้นหาที่ไม่เจอ (เติม ticker ที่พิมพ์ค้นไว้ให้)
 * ข้อความตอบกลับมาจาก server action เสมอ (มีในระบบแล้ว / ส่งแล้ว / เคยขอแล้ว / ขอเกินกำหนด)
 */
export default function RequestStockForm({ defaultTicker = "" }: { defaultTicker?: string }) {
  const [state, formAction, pending] = useActionState<RequestState | null, FormData>(requestStock, null);

  return (
    <form action={formAction} className="req-form">
      <div className="req-row">
        <input
          name="ticker"
          defaultValue={defaultTicker}
          placeholder="Ticker เช่น AAPL"
          maxLength={15}
          required
          autoComplete="off"
          aria-label="ticker ที่อยากให้วิเคราะห์"
        />
        <input name="note" placeholder="ทำไมถึงสนใจ (ไม่ใส่ก็ได้)" maxLength={200} aria-label="เหตุผลที่สนใจ" />
        <button type="submit" disabled={pending}>
          {pending ? "กำลังส่ง…" : "ขอให้วิเคราะห์"}
        </button>
      </div>
      {state && (
        <p className={`req-msg ${state.ok ? "ok" : "err"}`} role="status">
          {state.message}
          {state.inSystem && state.ticker && (
            <>
              {" "}
              — <Link href={`/stock/${state.ticker}`}>ดูรายงาน →</Link>
            </>
          )}
        </p>
      )}
    </form>
  );
}
