"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getStock } from "@/lib/db";
import {
  addRequest,
  countOpenRequests,
  requestsAvailable,
  MAX_OPEN_REQUESTS_PER_USER,
  type RequestState,
} from "@/lib/stock-requests";

/**
 * ส่งคำขอให้วิเคราะห์หุ้น — อีเมลเอาจาก session ฝั่ง server เท่านั้น ไม่รับจาก form
 * ใช้กับ useActionState: คืนข้อความให้ฟอร์มแสดง ไม่ throw (ผู้ใช้ต้องเห็นว่าทำไมส่งไม่ได้)
 */
export async function requestStock(_prev: RequestState | null, formData: FormData): Promise<RequestState> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return { ok: false, message: "ต้อง login ก่อน" };
  if (!requestsAvailable) return { ok: false, message: "ระบบคำขอยังใช้ไม่ได้ในโหมดข้อมูลปัจจุบัน" };

  const ticker = String(formData.get("ticker") ?? "")
    .trim()
    .toUpperCase()
    .replace(/^\$/, "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 200) || null;

  if (!/^[A-Z0-9.\-]{1,15}$/.test(ticker))
    return { ok: false, message: "รูปแบบ ticker ไม่ถูกต้อง — ใช้ตัวอักษรภาษาอังกฤษ/ตัวเลข เช่น AAPL, BRK.B" };

  if (await getStock(ticker)) return { ok: true, ticker, inSystem: true, message: `${ticker} มีรายงานในระบบแล้ว` };

  if ((await countOpenRequests(email)) >= MAX_OPEN_REQUESTS_PER_USER)
    return {
      ok: false,
      message: `ขอค้างไว้ได้สูงสุด ${MAX_OPEN_REQUESTS_PER_USER} ตัว — รอให้ตัวที่ขอไว้ถูกวิเคราะห์ก่อนนะ`,
    };

  const result = await addRequest(email, ticker, note);
  revalidatePath("/admin/requests");
  return {
    ok: true,
    ticker,
    message:
      result === "added"
        ? `ส่งคำขอ ${ticker} แล้ว — ถ้าถูกเลือกวิเคราะห์จะขึ้นในรายการหุ้นทั้งหมด`
        : `คุณเคยขอ ${ticker} ไว้แล้ว`,
  };
}
