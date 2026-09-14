/**
 * ลูกศรกดกาง/พับ วาดเป็นเส้น SVG ขนาดคงที่
 * เดิมใช้ตัวอักษร ▸ ซึ่งเป็น "สามเหลี่ยมเล็ก" โดยตัวมันเอง — ขยาย font-size เท่าไหร่ก็ยังดูจิ๋ว และแต่ละฟอนต์วาดไม่เท่ากัน
 * สีตาม currentColor ของกล่องที่ห่อ (.wl-chevron / .trk-chevron) ส่วนการหมุนตอนกางทำที่กล่องนั้นด้วย CSS
 */
export default function Chevron({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
