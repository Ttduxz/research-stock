import { signIn } from "@/auth";
import { listStocksWithLatest, listTrackRecordRows } from "@/lib/cached";
import { tally, isThesisClaim, MIN_RESOLVED } from "@/lib/track-record";
import "./login.css";

export const dynamic = "force-dynamic";

/**
 * หน้า landing สำหรับคนที่ยังไม่ login — โทนสำนักวิจัย เรียบและตรวจสอบได้
 * รอบแรกเป็นหัวข้อ "ต่างจากถาม ChatGPT ครั้งเดียวยังไง" + ป้าย "จำได้/มีด่านตรวจ/เปิดผลงาน" + "7/10"
 * ผู้ใช้บอกว่า "ตลกไป ดูไม่ professional สุดๆ" → ตัดการเทียบกับเครื่องมืออื่นและคำเล่นๆ ออก
 * ตัวเลขทุกตัวมีนิยาม + วันที่ของข้อมูลกำกับ (ตัวเลขลอยๆ ไม่มีบริบทคือสิ่งที่ทำให้ดูไม่น่าเชื่อ)
 *
 * ตัวเลขเป็นยอดรวมจาก cache ชุดเดียวกับหน้าเว็บ ไม่มีอีเมล ชื่อหุ้น หรือข้อความรายงาน — เนื้อหายังต้อง login เหมือนเดิม
 * query ไหนพังให้ตัดแถวนั้นทิ้ง หน้า login ต้องขึ้นได้เสมอแม้ DB ล่ม
 */
interface Row {
  label: string;
  value: string;
}

async function loadLedger(): Promise<Row[]> {
  const out: Row[] = [];
  try {
    const stocks = await listStocksWithLatest();
    const covered = stocks.filter((s) => s.latest_run_id != null && s.ticker !== "DEMO").length;
    if (covered > 0) out.push({ label: "บริษัทที่ครอบคลุม", value: covered.toLocaleString() });
  } catch {}
  try {
    const rows = await listTrackRecordRows();
    if (rows.length > 0) out.push({ label: "ข้อสรุปที่อยู่ระหว่างติดตามผล", value: rows.length.toLocaleString() });
    // คิดแบบเดียวกับหน้า /track-record: เฉพาะสมมุติฐาน + ปัจจัยกระตุ้นที่มีหลักฐานตัดสินแล้ว (ไม่นับความเสี่ยง)
    const thesis = tally(rows.filter(isThesisClaim));
    if (thesis.confirmRate != null && thesis.resolved >= MIN_RESOLVED) {
      out.push({ label: "สมมุติฐานที่มีหลักฐานตัดสินแล้ว", value: thesis.resolved.toLocaleString() });
      out.push({ label: "สัดส่วนที่หลักฐานยืนยัน", value: `${(thesis.confirmRate * 100).toFixed(1)}%` });
    }
  } catch {}
  return out;
}

const STEPS: { t: string; d: string }[] = [
  { t: "รวบรวมข้อมูล", d: "งบการเงิน เอกสารบริษัท และข่าวจากแหล่งต้นทาง" },
  { t: "ตรวจความถูกต้อง", d: "ตรวจความใหม่ ความขัดแย้ง และคุณภาพแหล่งข้อมูลก่อนวิเคราะห์" },
  { t: "วิเคราะห์", d: "ประเมินพื้นฐาน ความเสี่ยง และตั้งสมมุติฐานที่พิสูจน์ได้ว่าผิด" },
  { t: "ตรวจถ้อยคำ", d: "ไม่มีคำรับประกันผลตอบแทนหรือคำสั่งซื้อขาย ก่อนเผยแพร่" },
  { t: "ทบทวนรายสัปดาห์", d: "ตัดสินสมมุติฐานเดิมด้วยหลักฐานใหม่ พร้อมลิงก์อ้างอิง" },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;
  // รับเฉพาะ path ภายในเว็บ กัน open redirect
  const redirectTo = callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/";
  const ledger = await loadLedger();
  const asOf = new Date().toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="lg">
      <section className="lg-top">
        <div className="lg-intro">
          <p className="lg-eyebrow">Tee Stock Research · บทวิเคราะห์หุ้นสหรัฐฯ ภาษาไทย</p>
          <h1 className="lg-title">งานวิจัยหุ้นที่บันทึกทุกข้อสรุป และตรวจผลย้อนหลังทุกสัปดาห์</h1>
          <p className="lg-lead">
            ทุกรายงานผ่านการตรวจข้อมูลและถ้อยคำก่อนเผยแพร่ แล้วถูกทบทวนด้วยหลักฐานใหม่ทุกสัปดาห์
            ผลการตรวจทั้งที่ถูกและผิดเปิดให้สมาชิกดูได้
          </p>

          <div className="lg-cta">
            {error && <p className="login-error">เข้าสู่ระบบไม่สำเร็จ ({error}) กรุณาลองใหม่อีกครั้ง</p>}
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo });
              }}
            >
              <button type="submit" className="lg-btn">
                <svg className="lg-g" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 2.9-2.2 5.4-4.7 7.1l7.6 5.9c4.4-4.1 6.9-10.1 6.9-17.5z" />
                  <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
                  <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
                </svg>
                เข้าสู่ระบบด้วย Google
              </button>
            </form>
            <p className="lg-cta-note">สำหรับสมาชิก · ไม่มีค่าใช้จ่าย</p>
          </div>
        </div>

        {ledger.length > 0 && (
          <aside className="lg-ledger" aria-label="สถิติการตรวจสอบ">
            <div className="lg-ledger-head">
              <span>สถิติการตรวจสอบ</span>
              <span>ณ {asOf}</span>
            </div>
            <dl>
              {ledger.map((r) => (
                <div key={r.label} className="lg-ledger-row">
                  <dt>{r.label}</dt>
                  <dd>{r.value}</dd>
                </div>
              ))}
            </dl>
            <p className="lg-ledger-note">
              นับเฉพาะสมมุติฐานและปัจจัยกระตุ้นที่มีหลักฐานตัดสินแล้ว ไม่รวมข้อที่ยังรอผล ช่วงเก็บข้อมูลยังสั้น ตัวเลขจึงเปลี่ยนแปลงได้มาก
            </p>
          </aside>
        )}
      </section>

      <section className="lg-process" aria-labelledby="lg-process-title">
        <h2 id="lg-process-title" className="lg-h2">
          กระบวนการจัดทำรายงาน
        </h2>
        <ol className="lg-steps">
          {STEPS.map((s, i) => (
            <li key={s.t}>
              <span className="lg-step-n">{String(i + 1).padStart(2, "0")}</span>
              <b>{s.t}</b>
              <span className="lg-step-d">{s.d}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
