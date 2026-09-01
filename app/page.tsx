import Link from "next/link";
import { listStocksWithLatest } from "@/lib/db";
import VerdictBadge from "@/components/VerdictBadge";

export const dynamic = "force-dynamic";

const UNKNOWN_SECTOR = "ไม่ระบุกลุ่มอุตสาหกรรม";

// sector ใน DB เป็นข้อความละเอียด (เช่น "Technology — Cybersecurity (Software Infrastructure)")
// หน้าแรกจับกลุ่มกว้างๆ จาก keyword แทน ส่วนหน้ารายละเอียดหุ้นยังโชว์ข้อความเต็ม
const BROAD_SECTORS: [string, RegExp][] = [
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
  const stocks = await listStocksWithLatest();

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

  return (
    <>
      <Link href="/research/ai-financing-web" className="card" style={{ display: "block", borderLeft: "3px solid var(--accent)", marginBottom: 28 }}>
        <div className="card-title-row">
          <h3>🕸️ งานวิจัยพิเศษ: โครงข่ายการเงิน AI — Nvidia × Blackstone</h3>
          <span className="badge risk-high">ความเสี่ยงฟองสบู่</span>
        </div>
        <p style={{ margin: "6px 0 0", color: "var(--text-dim)", fontSize: 14 }}>
          วิเคราะห์เชิงลึกดีล SPV มูลค่า $500,000 ล้าน ของ Nvidia กับ Blackstone และสถาบันการเงินอื่น
          พร้อมประเมินความเสี่ยงเชิงระบบหากกลายเป็นฟองสบู่ — อ่านรายงานฉบับเต็ม →
        </p>
      </Link>

      <h1>หุ้นที่ติดตาม</h1>
      <p className="subtitle">
        ผลจาก pipeline: research team → analyze team → theorie team
      </p>

      {stocks.length === 0 ? (
        <div className="empty-state">
          ยังไม่มีข้อมูลหุ้นในระบบ — สั่ง research หุ้นตัวแรกผ่าน Claude Code ด้วยคำสั่ง{" "}
          <code>/research-stock &lt;TICKER&gt;</code>
        </div>
      ) : (
        sorted.map(([sector, group]) => (
          <section key={sector}>
            <h2 className="sector-heading">
              {sector} <span className="sector-count">({group.length})</span>
            </h2>
            <div className="stock-grid">
              {group.map((s) => (
                <Link key={s.ticker} href={`/stock/${s.ticker}`} className="stock-card">
                  <div className="ticker">{s.ticker}</div>
                  <div className="name">{s.name}</div>
                  <div className="meta">
                    <VerdictBadge verdict={s.latest_verdict} />
                    <span>
                      {s.latest_price != null && (
                        <>
                          {s.latest_price.toLocaleString()} {s.currency} ·{" "}
                        </>
                      )}
                      {s.latest_run_date ?? "ยังไม่มี run"}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}
