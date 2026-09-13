"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** ส่ง page view ทุกครั้งที่ URL เปลี่ยนจริง (รวมการกด Link) — prefetch ไม่ trigger effect นี้ */
export default function PageViewLogger() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qs = searchParams.toString();
    const path = pathname + (qs ? `?${qs}` : "");
    try {
      if (!navigator.sendBeacon?.("/api/log", path)) {
        fetch("/api/log", { method: "POST", body: path, keepalive: true }).catch(() => {});
      }
    } catch {}
  }, [pathname, searchParams]);

  return null;
}
