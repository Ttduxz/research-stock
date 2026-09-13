import { marked } from "marked";

/** เรนเดอร์ markdown ที่ pipeline ของเราสร้างเอง */
export default function Markdown({ text }: { text: string | null }) {
  if (!text) return null;
  // escape ~ กัน GFM ตีความ "~46x" / "~4 ปี" (เครื่องหมายประมาณ) เป็น strikethrough
  const safe = text.replace(/~/g, "\\~");
  const html = marked.parse(safe, { async: false }) as string;
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** markdown แบบบรรทัดเดียว — ใช้กับข้อความสั้นที่ agent เขียนปนมาร์กอัปมา (เหตุผลของไม้, ข้อสมมุติ, หลักฐาน)
 *  ถ้าปล่อยเป็น text ธรรมดา ผู้อ่านจะเห็น ** และ [..](..) ดิบๆ ซึ่งดูเหมือนหน้าพัง */
export function InlineMarkdown({ text }: { text: string | null }) {
  if (!text) return null;
  const safe = text.replace(/~/g, "\~");
  const html = marked.parseInline(safe, { async: false }) as string;
  return <span className="md-inline" dangerouslySetInnerHTML={{ __html: html }} />;
}
