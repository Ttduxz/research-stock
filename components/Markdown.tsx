import { marked } from "marked";

/** เรนเดอร์ markdown ที่ pipeline ของเราสร้างเอง */
export default function Markdown({ text }: { text: string | null }) {
  if (!text) return null;
  // escape ~ กัน GFM ตีความ "~46x" / "~4 ปี" (เครื่องหมายประมาณ) เป็น strikethrough
  const safe = text.replace(/~/g, "\\~");
  const html = marked.parse(safe, { async: false }) as string;
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}
