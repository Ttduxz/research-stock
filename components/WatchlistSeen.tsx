"use client";

import { useEffect } from "react";
import { markSeen } from "@/app/watchlist/actions";

/**
 * บันทึกว่าเปิดหน้า /watchlist แล้ว — ทำหลัง mount ฝั่ง browser เท่านั้น
 * ถ้าบันทึกตอน render ฝั่ง server, prefetch ของ production จะขยับจุดตั้งต้นทั้งที่ผู้ใช้ยังไม่ได้เห็นหน้า
 */
export default function WatchlistSeen() {
  useEffect(() => {
    markSeen().catch(() => {});
  }, []);
  return null;
}
