/**
 * โครงหน้าระหว่างรอข้อมูล — แสดงทันทีที่กดลิงก์ (หัวเว็บ + แถบเมนูยังอยู่)
 * เดิมไม่มีไฟล์นี้: กดแล้วหน้าจอค้างอยู่ที่หน้าเดิม 1-2 วินาทีโดยไม่มีสัญญาณอะไร เลยรู้สึกว่าเว็บหน่วง
 * ใช้ร่วมทุกหน้าที่อยู่ใต้ root layout (/, /best-price, /insights, /track-record, /stock/..., ...)
 */
export default function Loading() {
  return (
    <div className="page-loading" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">กำลังโหลด…</span>
      <div className="sk sk-title" />
      <div className="sk sk-line" />
      <div className="sk sk-line sk-short" />
      <div className="sk-grid">
        <div className="sk sk-card" />
        <div className="sk sk-card" />
        <div className="sk sk-card" />
      </div>
      <div className="sk sk-block" />
    </div>
  );
}
