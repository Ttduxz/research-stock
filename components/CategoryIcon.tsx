import type { ReactNode } from "react";

/** ไอคอนเส้นเล็กๆ ต่อหมวดข่าวดิบ — ให้กวาดตาแยกประเภทได้เร็วกว่าอ่านข้อความ badge ทุกอัน */
const ICONS: Record<string, ReactNode> = {
  news: (
    <>
      <rect x="3" y="3" width="14" height="14" rx="1.5" />
      <line x1="6" y1="7" x2="14" y2="7" />
      <line x1="6" y1="10.5" x2="14" y2="10.5" />
      <line x1="6" y1="14" x2="11" y2="14" />
    </>
  ),
  financials: (
    <>
      <line x1="4" y1="16" x2="4" y2="11" />
      <line x1="10" y1="16" x2="10" y2="5" />
      <line x1="16" y1="16" x2="16" y2="9" />
    </>
  ),
  filing: (
    <>
      <path d="M6 3h6l4 4v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M12 3v4h4" />
    </>
  ),
  industry: (
    <>
      <path d="M3 17V8l4 3V8l4 3V8l4 3v6" />
      <line x1="3" y1="17" x2="17" y2="17" />
    </>
  ),
  sentiment: <path d="M3 4h14v9H9l-3.5 3v-3H3Z" />,
  other: <circle cx="10" cy="10" r="1.6" fill="currentColor" stroke="none" />,
};

export default function CategoryIcon({ category }: { category: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flex: "none" }}
    >
      {ICONS[category] ?? ICONS.other}
    </svg>
  );
}
