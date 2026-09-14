import Link from "next/link";
import { listStocksWithLatest, listHints } from "@/lib/cached";
import { auth } from "@/auth";
import { listWatchTickers } from "@/lib/watchlist";
import StockBrowser from "@/components/StockBrowser";
import HintCard from "@/components/HintCard";
import { isActiveHint } from "@/lib/hint-status";

export const dynamic = "force-dynamic";

const UNKNOWN_SECTOR = "ไม่ระบุกลุ่มอุตสาหกรรม";

// sector ใน DB เป็นข้อความละเอียด (เช่น "Technology — Cybersecurity (Software Infrastructure)")
// หน้าแรกจับกลุ่มกว้างๆ จาก keyword แทน ส่วนหน้ารายละเอียดหุ้นยังโชว์ข้อความเต็ม
// พลังงาน/ยูทิลิตี้ต้องมาก่อน retail เพราะ sector บางตัว (เช่น NRG "...& Retail Energy") มีคำว่า retail ปนอยู่
// แต่โดยธุรกิจจริงควรจัดกลุ่มพลังงานด้วยกัน ไม่ใช่ retail ทั่วไป — ลำดับในอาเรย์นี้มีผล (แมตช์อันแรกที่เจอ)
const BROAD_SECTORS: [string, RegExp][] = [
  ["พลังงาน / สาธารณูปโภค (Energy & Utilities)", /utilit|power producer|power generation|energy infrastructure|electrical equipment|renewable power|nuclear/i],
  ["ยา / สุขภาพ (Healthcare)", /health|biopharma|pharma/i],
  ["การเงิน / เครือข่ายชำระเงิน (Payments & Financials)", /payment|financial/i],
  ["สื่อ / บันเทิง (Media & Entertainment)", /media|entertainment|streaming/i],
  ["ค้าปลีก / สินค้าจำเป็น (Retail & Staples)", /retail|consumer staples|grocery/i],
  ["วัสดุ / ชิ้นส่วนอุตสาหกรรม (Materials & Components)", /component|forged|fastener|materials|specialty metal/i],
  ["การบินและอวกาศ (Aerospace & Space)", /aerospace|defense|satellite|space/i],
  ["ยานยนต์ / สินค้าผู้บริโภค (Automotive & Consumer)", /automob|automotive|consumer discretionary/i],
  ["เทคโนโลยี (Technology)", /tech|semiconductor|software|communication services|internet/i],
];

function broadSector(sector: string | null): string {
  const s = sector?.trim();
  if (!s) return UNKNOWN_SECTOR;
  for (const [label, re] of BROAD_SECTORS) {
    if (re.test(s)) return label;
  }
  return s;
}

export default async function HomePage() {
  // รายการ ☆ ติดตามเป็นของแต่ละคน — อ่านสด (ไม่ผ่าน cache) คู่ขนานกับข้อมูลหุ้นที่ cache ร่วมกัน
  const session = await auth();
  const email = session?.user?.email ?? null;
  const [stocks, hints, watched] = await Promise.all([
    listStocksWithLatest(),
    listHints(),
    email ? listWatchTickers(email) : Promise.resolve([] as string[]),
  ]);
  // หน้าแรกโชว์แค่ 3 อันดับที่ impact สูงสุด (ไม่ใช่ 3 อันล่าสุด) — เรียงตาม impact_score แล้วค่อย tie-break ด้วยความใหม่
  // เรื่องที่ทบทวนแล้วว่าจบ/ถูกหักล้างไม่ขึ้นหน้าแรก (ยังเปิดดูได้ที่ /insights)
  const topHints = hints
    .filter((h) => isActiveHint(h.status))
    .sort((a, b) => (b.impact_score ?? 0) - (a.impact_score ?? 0) || b.run_date.localeCompare(a.run_date))
    .slice(0, 3);

  const sectors = new Map<string, typeof stocks>();
  for (const s of stocks) {
    const key = broadSector(s.sector);
    const group = sectors.get(key);
    if (group) group.push(s);
    else sectors.set(key, [s]);
  }
  const sorted = [...sectors.entries()].sort(([a], [b]) => {
    if (a === UNKNOWN_SECTOR) return 1;
    if (b === UNKNOWN_SECTOR) return -1;
    return a.localeCompare(b);
  });
  const sections = sorted.map(([sector, group]) => ({ sector, stocks: group }));

  return (
    <>
      {hints.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
            <h2 className="sector-heading" style={{ marginTop: 0 }}>งานวิจัยพิเศษ / Insights — impact สูงสุด</h2>
            <Link href="/insights" style={{ fontSize: 13 }}>ดูทั้งหมด ({hints.length}) →</Link>
          </div>
          <div className="stock-grid">
            {topHints.map((h) => (
              <HintCard key={h.slug} hint={h} featured />
            ))}
          </div>
        </section>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1>หุ้นที่ติดตาม</h1>
        {stocks.length > 0 && (
          <Link href="/best-price" style={{ fontSize: 13 }}>🏆 5 หุ้นที่ราคาน่าสนใจที่สุดตอนนี้ →</Link>
        )}
      </div>
      <p className="subtitle">
        ทุกรายงานผ่าน 3 ขั้น: ค้นข้อมูล → วิเคราะห์ → ตั้งทฤษฎีและวางแผนสะสม
      </p>

      {stocks.length === 0 ? (
        <div className="empty-state">
          ยังไม่มีข้อมูลหุ้นในระบบ — สั่ง research หุ้นตัวแรกผ่าน Claude Code ด้วยคำสั่ง{" "}
          <code>/research-stock &lt;TICKER&gt;</code>
        </div>
      ) : (
        <StockBrowser sections={sections} watched={watched} />
      )}    </>
  );
}
