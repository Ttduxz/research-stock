import type { Metadata } from "next";
import QRCode from "qrcode";
import { buildPromptPayPayload, maskPromptPayId, normalizePromptPayId } from "@/lib/promptpay";
import "./donate.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Donate | Tee Stock Research",
};

/**
 * หน้าสนับสนุน — QR PromptPay แบบไม่ระบุยอด (สร้างจาก env PROMPTPAY_ID ฝั่ง server)
 * การ์ด QR ใช้คลาส donate-* / thaiqr-* ของ globals.css (พื้นขาวเสมอ แอปธนาคารสแกนติดง่าย) · เลย์เอาต์หน้าเป็น dn2-
 */
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
    <div className="dn2">
      <header className="dn2-head">
        <h1>สนับสนุนการทำงาน</h1>
        <p className="dn2-lead">
          รายงานทุกฉบับผลิตและทบทวนทุกสัปดาห์ด้วยระบบ AI ซึ่งมีค่าใช้จ่ายจริง ถ้ารายงานมีประโยชน์กับคุณ
          ร่วมสนับสนุนได้ตามสะดวก
        </p>
      </header>

      <div className="dn2-grid">
        <section className="donate-card dn2-card" aria-label="QR PromptPay">
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

        <section className="dn2-side">
          <h2 className="dn2-h2">วิธีโอน</h2>
          <ol className="dn2-steps">
            <li>
              <span className="dn2-step-n">1</span>
              <span>เปิดแอปธนาคารหรือ e-Wallet แล้วเลือก “สแกน QR”</span>
            </li>
            <li>
              <span className="dn2-step-n">2</span>
              <span>
                สแกน QR นี้ <span className="dn2-hint">บนมือถือ: บันทึกภาพหน้าจอ แล้วเลือกจากคลังรูป</span>
              </span>
            </li>
            <li>
              <span className="dn2-step-n">3</span>
              <span>ใส่จำนวนเงิน ตรวจชื่อผู้รับให้ตรง แล้วกดยืนยัน</span>
            </li>
          </ol>

          <p className="dn2-note">
            การสนับสนุนไม่มีผลต่อเนื้อหาการวิเคราะห์ใดๆ · รายงานทั้งหมดเป็นเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน
          </p>
        </section>
      </div>
    </div>
  );
}
