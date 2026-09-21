"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { createPersonalKey, revokeFamily, mcpAvailable } from "@/lib/mcp/store";

export interface KeyState {
  ok: boolean;
  message: string;
  /** key จริง — แสดงครั้งเดียวในหน้านี้ ไม่เก็บที่ไหนนอกจาก hash ใน DB */
  key?: string;
}

/** สร้าง API key ส่วนตัว — อีเมลจาก session เท่านั้น */
export async function createKey(_prev: KeyState | null, formData: FormData): Promise<KeyState> {
  const email = (await auth())?.user?.email;
  if (!email) return { ok: false, message: "ต้อง login ก่อน" };
  if (!mcpAvailable) return { ok: false, message: "ยังใช้ไม่ได้ในโหมดข้อมูลปัจจุบัน" };
  const label = String(formData.get("label") ?? "").trim().slice(0, 60) || "API key";
  try {
    const key = await createPersonalKey(email, label);
    revalidatePath("/connect");
    return { ok: true, message: `สร้าง "${label}" แล้ว — คัดลอกเก็บไว้ตอนนี้ ปิดหน้านี้แล้วจะดูอีกไม่ได้`, key };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "สร้างไม่สำเร็จ" };
  }
}

/** ถอนสิทธิ์การเชื่อมต่อ (OAuth หรือ key) — revokeFamily ตรวจว่าเป็นของอีเมลนี้เองใน SQL */
export async function revokeConnection(formData: FormData): Promise<void> {
  const email = (await auth())?.user?.email;
  if (!email) throw new Error("ต้อง login ก่อน");
  const family = String(formData.get("family") ?? "");
  if (!/^[a-f0-9]{24}$/.test(family)) throw new Error("ไม่พบการเชื่อมต่อนี้");
  await revokeFamily(email, family);
  revalidatePath("/connect");
}
