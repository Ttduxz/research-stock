import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/admin";

/**
 * บังคับ login ทั้งเว็บ + กัน /admin ให้เฉพาะ ADMIN_EMAILS
 * runtime nodejs (Next 15.5+) — auth.ts import libsql ผ่าน events
 */
export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const email = req.auth?.user?.email ?? null;

  if (pathname === "/login") {
    return email ? NextResponse.redirect(new URL("/", req.nextUrl)) : NextResponse.next();
  }

  if (!email) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = new URL("/login", req.nextUrl);
    url.searchParams.set("callbackUrl", pathname + search);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/admin") && !isAdmin(email)) {
    return new NextResponse("Not found", { status: 404 });
  }

  // การเปิดหน้าไม่ได้ log ที่นี่ — production prefetch ลิงก์ในจอผ่าน middleware ด้วยและแยกไม่ออก
  // (header prefetch ถูกตัดก่อนถึง middleware) → log จากฝั่ง browser แทน ดู components/PageViewLogger.tsx
  return NextResponse.next();
});

export const config = {
  runtime: "nodejs",
  // ไม่ผ่าน middleware: ไฟล์ static, route ของ Auth.js เอง, health check
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth|api/health|.*\\.(?:png|jpg|jpeg|svg|ico|webp|txt|xml)$).*)"],
};
