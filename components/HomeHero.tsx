import Link from "next/link";

export interface HeroStat {
  /** ตัวเลขใหญ่ */
  value: string;
  /** ป้ายใต้ตัวเลข — ทุกตัวเลขต้องมีป้าย (ผู้ใช้ไม่ชอบภาพ/ตัวเลขที่ต้องเดาความหมาย) */
  label: string;
  href?: string;
}

/**
 * หัวหน้าแรก: คนที่เพิ่งเข้ามาต้องรู้ในบรรทัดเดียวว่าเว็บนี้คืออะไร และต่างจากถาม chatbot ตรงไหน
 * (ตรวจคำทำนายของตัวเองทุกสัปดาห์ด้วยหลักฐาน) — ตัวเลขทุกตัวคำนวณจาก DB ใน app/page.tsx ไม่มีตัวเลขแต่ง
 * สั้นโดยตั้งใจ: ผู้ใช้บอกว่าข้อความเยอะ "ไม่น่าอ่าน"
 */
export default function HomeHero({ stats }: { stats: HeroStat[] }) {
  return (
    <section className="hm-hero" aria-labelledby="hm-hero-title">
      <h1 id="hm-hero-title" className="hm-hero-title">
        ทีมวิจัย AI ที่เขียนรายงานหุ้น แล้วกลับมา<span className="hm-hl">ตรวจคำทำนายของตัวเองทุกสัปดาห์</span>ด้วยหลักฐาน
      </h1>
      <p className="hm-hero-sub">
        ถูกหรือผิดก็เปิดให้ดู · <Link href="/track-record">ดูผลงานย้อนหลัง →</Link>
      </p>
      <div className="hm-stats">
        {stats.map((s) =>
          s.href ? (
            <Link key={s.label} href={s.href} className="hm-stat is-link">
              <b className="hm-stat-v">{s.value}</b>
              <span className="hm-stat-l">{s.label}</span>
            </Link>
          ) : (
            <div key={s.label} className="hm-stat">
              <b className="hm-stat-v">{s.value}</b>
              <span className="hm-stat-l">{s.label}</span>
            </div>
          )
        )}
      </div>
      <p className="hm-hero-note">เพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน</p>
    </section>
  );
}
