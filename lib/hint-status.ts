/** สถานะของ insight หลังรอบทบทวน (ทีม hint-reviewer) — ใช้ร่วมกันทั้งการ์ดและหน้ารายงาน */
export const HINT_STATUS_LABEL: Record<string, string> = {
  active: "ยังมีผลอยู่",
  "played-out": "เกิดขึ้นครบแล้ว",
  invalidated: "ถูกหักล้างแล้ว",
};

export const isActiveHint = (status: string | null | undefined) => (status ?? "active") === "active";
