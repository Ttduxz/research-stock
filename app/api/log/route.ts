import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { logAccess } from "@/lib/access-log";

export const dynamic = "force-dynamic";

/** รับ page view จาก PageViewLogger — ตัวตนเอาจาก session ฝั่ง server เท่านั้น ไม่เชื่อ body */
export async function POST(req: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return new NextResponse(null, { status: 401 });

  const path = (await req.text()).slice(0, 500);
  if (!path.startsWith("/")) return new NextResponse(null, { status: 400 });

  const h = req.headers;
  await logAccess({
    email,
    name: session.user?.name,
    event: "view",
    path,
    // ไม่เก็บ IP (privacy) — ดู lib/access-log.ts
    userAgent: h.get("user-agent"),
  });
  return new NextResponse(null, { status: 204 });
}
