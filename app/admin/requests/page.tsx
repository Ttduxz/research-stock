import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/admin";
import { listRequestSummary, requestsAvailable } from "@/lib/stock-requests";

export const dynamic = "force-dynamic";

/**
 * คำขอให้วิเคราะห์หุ้น (เฉพาะ ADMIN_EMAILS) — แสดงจำนวนคนขอราย ticker ไม่แสดงว่าใครขอ
 * สั่งวิเคราะห์จริงใน Claude Code ด้วย /research-stock <TICKER> (ดูคิวแบบ JSON ด้วย node scripts/list-requests.mjs)
 */
export default async function StockRequestsPage() {
  // middleware กันไว้แล้ว เช็คซ้ำอีกชั้นเผื่อ matcher เปลี่ยน
  const session = await auth();
  if (!isAdmin(session?.user?.email)) notFound();

  const rows = await listRequestSummary();
  const pending = rows.filter((r) => !r.in_system);
  const done = rows.filter((r) => r.in_system);

  return (
    <div className="admin-logs">
      <h1>คำขอวิเคราะห์หุ้น</h1>
      <p className="login-sub">
        รอวิเคราะห์ {pending.length} ตัว · วิเคราะห์แล้ว {done.length} ตัว · แสดงจำนวนคนขอ ไม่แสดงอีเมล · สั่งวิเคราะห์ใน
        Claude Code ด้วย <code>/research-stock &lt;TICKER&gt;</code>
      </p>

      {!requestsAvailable ? (
        <div className="empty-state">ระบบคำขอใช้ไม่ได้ในโหมดข้อมูลปัจจุบัน</div>
      ) : rows.length === 0 ? (
        <div className="empty-state">ยังไม่มีใครส่งคำขอ</div>
      ) : (
        <div className="table-scroll">
          <table className="log-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>คนขอ</th>
                <th>ขอล่าสุด</th>
                <th>เหตุผลที่ให้มา</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {[...pending, ...done].map((r) => (
                <tr key={r.ticker}>
                  <td className="req-ticker">{r.ticker}</td>
                  <td>{r.requesters}</td>
                  <td className="log-dim">{r.last_requested.slice(0, 10)}</td>
                  <td className="req-notes">
                    {r.notes.length === 0 ? (
                      <span className="log-dim">—</span>
                    ) : (
                      r.notes.map((n, i) => <div key={i}>{n}</div>)
                    )}
                  </td>
                  <td>
                    {r.in_system ? (
                      <Link href={`/stock/${r.ticker}`}>มีรายงานแล้ว →</Link>
                    ) : (
                      <span className="log-dim">รอวิเคราะห์</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
