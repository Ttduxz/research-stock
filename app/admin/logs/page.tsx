import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/admin";
import { listAccessSummary, listRecentAccess } from "@/lib/access-log";

export const dynamic = "force-dynamic";

const EVENT_LABEL: Record<string, string> = { login: "เข้าสู่ระบบ", logout: "ออกจากระบบ", view: "เปิดหน้า" };

/** DB เก็บเวลาเป็น UTC — แสดงเป็นเวลาไทย */
function thTime(utc: string): string {
  const d = new Date(utc.replace(" ", "T") + "Z");
  return d.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });
}

export default async function AccessLogsPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  // middleware กันไว้แล้ว เช็คซ้ำอีกชั้นเผื่อ matcher เปลี่ยน
  const session = await auth();
  if (!isAdmin(session?.user?.email)) notFound();

  const { email } = await searchParams;
  const [summary, recent] = await Promise.all([listAccessSummary(), listRecentAccess(300, email)]);

  return (
    <div className="admin-logs">
      <h1>Log การเข้าใช้งาน</h1>
      <p className="login-sub">
        ผู้ใช้ทั้งหมด {summary.length} คน · เวลาแสดงเป็นเวลาไทย
      </p>

      <h2>สรุปรายคน</h2>
      <div className="table-scroll">
        <table className="log-table">
          <thead>
            <tr>
              <th>ผู้ใช้</th>
              <th>เข้าครั้งแรก</th>
              <th>ล่าสุด</th>
              <th className="num">Login</th>
              <th className="num">เปิดหน้า</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((u) => (
              <tr key={u.email}>
                <td>
                  <Link href={`/admin/logs?email=${encodeURIComponent(u.email)}`}>{u.email}</Link>
                  {u.name && <div className="log-dim">{u.name}</div>}
                </td>
                <td>{thTime(u.first_seen)}</td>
                <td>{thTime(u.last_seen)}</td>
                <td className="num">{u.logins}</td>
                <td className="num">{u.views}</td>
              </tr>
            ))}
            {summary.length === 0 && (
              <tr>
                <td colSpan={5} className="log-dim">ยังไม่มี log (หรือโหมด snapshot ที่เขียน DB ไม่ได้)</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2>
        กิจกรรมล่าสุด {email && <>ของ {email} · <Link href="/admin/logs">ดูทุกคน</Link></>}
      </h2>
      <div className="table-scroll">
        <table className="log-table">
          <thead>
            <tr>
              <th>เวลา</th>
              <th>ผู้ใช้</th>
              <th>เหตุการณ์</th>
              <th>หน้า</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((r) => (
              <tr key={r.id}>
                <td>{thTime(r.created_at)}</td>
                <td>{r.email}</td>
                <td>{EVENT_LABEL[r.event] ?? r.event}</td>
                <td className="log-path">{r.path ?? "—"}</td>
                <td className="log-dim">{r.ip ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
