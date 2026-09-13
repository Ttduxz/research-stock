import type { Metadata } from "next";
import QRCode from "qrcode";
import { buildPromptPayPayload, maskPromptPayId, normalizePromptPayId } from "@/lib/promptpay";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Donate | Tee Stock Research",
};

export default async function DonatePage() {
  const promptPayId = process.env.PROMPTPAY_ID ?? "";
  const recipientName = process.env.PROMPTPAY_NAME;
  const valid = !!normalizePromptPayId(promptPayId);

  // QR แบบไม่ระบุจำนวนเงิน — ผู้สนับสนุนใส่ยอดเองในแอปธนาคาร
  const qrSvg = valid
    ? await QRCode.toString(buildPromptPayPayload(promptPayId), {
        type: "svg",
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#0b1a33", light: "#ffffff" },
      })
    : null;

  return (
    <div className="donate">
      <header className="donate-head">
        <span className="eyebrow">Support</span>
        <h1>เลี้ยงกาแฟคนทำระบบ</h1>
        <p className="donate-lede">
          รายงานทุกฉบับมาจากทีม AI agent ที่ค้นข้อมูล วิเคราะห์ และติดตามหุ้นทุกสัปดาห์ ค่ารันโมเดลกับ server
          มีต้นทุนจริง ถ้ารายงานเหล่านี้มีประโยชน์กับคุณ ร่วมสนับสนุนได้ตามสะดวก
        </p>
      </header>

      <div className="donate-grid">
        <section className="donate-card">
          <div className="thaiqr-strip">
            <span className="thaiqr-title">THAI QR PAYMENT</span>
            <span className="thaiqr-pp">PromptPay</span>
          </div>

          {qrSvg ? (
            <div className="donate-qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          ) : (
            <div className="donate-qr donate-qr-missing">ยังไม่ได้ตั้งค่า PROMPTPAY_ID</div>
          )}

          <div className="donate-amount">
            <span className="donate-amount-free">ระบุจำนวนเงินในแอปธนาคาร</span>
          </div>

          {valid && (
            <p className="donate-recipient">
              {recipientName ? `${recipientName} · ` : ""}PromptPay {maskPromptPayId(promptPayId)}
            </p>
          )}
        </section>

        <section className="donate-side">
          <h2>วิธีสนับสนุน</h2>
          <ol className="donate-steps">
            <li>เปิดแอปธนาคารหรือ e-Wallet ใดก็ได้ แล้วเลือก “สแกน QR”</li>
            <li>สแกน QR ด้านซ้าย (บนมือถือ: บันทึกภาพหน้าจอแล้วเลือกจากคลังรูป)</li>
            <li>ใส่จำนวนเงินตามสะดวก ตรวจชื่อผู้รับให้ตรงก่อนกดยืนยัน</li>
          </ol>

          <p className="donate-note">
            การสนับสนุนไม่มีผลต่อเนื้อหาการวิเคราะห์ใดๆ และรายงานทั้งหมดยังเป็นเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน
          </p>
        </section>
      </div>
    </div>
  );
}
