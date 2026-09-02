const DIR_CLASS: Record<string, string> = {
  positive: "dir-positive",
  negative: "dir-negative",
  mixed: "dir-mixed",
};

const LABEL: Record<string, Record<string, string>> = {
  positive: {
    high: "โอกาสสูง",
    mid: "โอกาสปานกลาง",
    low: "โอกาส (ผลกระทบจำกัด)",
  },
  negative: {
    high: "ความเสี่ยงสูง",
    mid: "ความเสี่ยงปานกลาง",
    low: "ความเสี่ยง (ผลกระทบจำกัด)",
  },
  mixed: {
    high: "ผลกระทบผสม (สูง)",
    mid: "ผลกระทบผสม (ปานกลาง)",
    low: "ผลกระทบผสม (จำกัด)",
  },
};

/** badge สำหรับ hint — hint ไม่ใช่แค่ความเสี่ยง อาจเป็นโอกาสหรือผลกระทบผสมก็ได้ */
export default function HintBadge({
  direction,
  magnitude,
}: {
  direction: string | null;
  magnitude: string | null;
}) {
  if (!direction) return null;
  const cls = DIR_CLASS[direction] ?? "dir-mixed";
  const label = LABEL[direction]?.[magnitude ?? ""] ?? LABEL[direction]?.mid ?? direction;
  return <span className={`badge ${cls}`}>{label}</span>;
}
