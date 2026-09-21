"use client";

import { useActionState } from "react";
import { createKey, type KeyState } from "@/app/connect/actions";
import CopyField from "@/components/CopyField";

/** สร้าง API key ส่วนตัว — key โผล่ครั้งเดียวหลังกดสร้าง (DB เก็บแค่ hash) */
export default function ConnectKeyForm() {
  const [state, formAction, pending] = useActionState<KeyState | null, FormData>(createKey, null);
  return (
    <form action={formAction} className="req-form">
      <div className="req-row">
        <input name="label" placeholder="ตั้งชื่อ เช่น agent ของฉัน" maxLength={60} aria-label="ชื่อ key" />
        <button type="submit" disabled={pending}>
          {pending ? "กำลังสร้าง…" : "สร้าง API key"}
        </button>
      </div>
      {state && (
        <p className={`req-msg ${state.ok ? "ok" : "err"}`} role="status">
          {state.message}
        </p>
      )}
      {state?.key && <CopyField value={state.key} label="API key ใหม่" />}
    </form>
  );
}
