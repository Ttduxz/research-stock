"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getStock } from "@/lib/db";
import { setWatch } from "@/lib/watchlist";

/**
 * กด ☆ ติดตาม / เลิกติดตาม — อีเมลเอาจาก session ฝั่ง server เท่านั้น ไม่รับจาก client
 * (ไม่งั้นใครก็แก้รายการติดตามของคนอื่นได้ด้วยการส่งอีเมลปลอมมา)
 */
export async function toggleWatch(ticker: string, on: boolean): Promise<void> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new Error("ต้อง login ก่อน");

  const t = String(ticker ?? "").toUpperCase();
  if (!/^[A-Z0-9.\-]{1,15}$/.test(t) || !(await getStock(t))) throw new Error("ไม่พบหุ้นนี้ในระบบ");

  await setWatch(email, t, Boolean(on));
  revalidatePath("/watchlist");
  revalidatePath(`/stock/${t}`);
}
