"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestStock } from "@/app/request/actions";
import type { RequestState } from "@/lib/stock-requests";

/**
 * ฟอร์มขอให้วิเคราะห์หุ้น (หน้า /request) — ผลค้นหาที่ไม่เจอลิงก์มาพร้อม ?ticker= ให้เติมไว้
 * ข้อความตอบกลับมาจาก server action เสมอ (มีในระบบแล้ว / ส่งแล้ว / เคยขอแล้ว / ขอเกินกำหนด)
 * ชื่อช่อง (ticker / note) + maxLength ต้องตรงกับที่ app/request/actions.ts อ่าน
 */
export default function RequestStockForm({ defaultTicker = "" }: { defaultTicker?: string }) {
  const [state, formAction, pending] = useActionState<RequestState | null, FormData>(requestStock, null);

  return (
    <form action={formAction} className="rq2-form">
      <div className="rq2-fields">
        <label className="rq2-field rq2-field-ticker">
          <span>ชื่อย่อหุ้น</span>
          <input
            name="ticker"
            defaultValue={defaultTicker}
            placeholder="เช่น AAPL"
            maxLength={15}
            required
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
        </label>
        <label className="rq2-field rq2-field-note">
          <span>
            ทำไมถึงสนใจ <em>ไม่บังคับ</em>
          </span>
          <input name="note" placeholder="เช่น ถือไว้อยู่ อยากรู้แนวโน้ม" maxLength={200} />
        </label>
        <button type="submit" disabled={pending} className="rq2-submit">
          {pending ? "กำลังส่ง…" : "ส่งคำขอ"}
        </button>
      </div>
      {state && (
        <p className={`rq2-msg ${state.ok ? "ok" : "err"}`} role="status">
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
