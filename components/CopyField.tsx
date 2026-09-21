"use client";

import { useState } from "react";

/** ช่องแสดงค่าที่ต้องคัดลอกไปวาง (URL ของ MCP / API key / คำสั่ง) + ปุ่มคัดลอก */
export default function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard ถูกบล็อก (http / iframe) — ผู้ใช้ยังเลือกข้อความเองได้
    }
  };
  return (
    <div className="copy-field">
      <code aria-label={label}>{value}</code>
      <button type="button" onClick={copy}>
        {copied ? "คัดลอกแล้ว ✓" : "คัดลอก"}
      </button>
    </div>
  );
}
