import Link from "next/link";
import type { Metadata } from "next";
import Markdown from "@/components/Markdown";

export const metadata: Metadata = {
  title: "โครงข่ายการเงิน AI: Nvidia, Blackstone และคำถามเรื่องฟองสบู่ | Tee Stock Research",
  description:
    "งานวิจัยพิเศษ: วิเคราะห์เชิงลึกดีล SPV มูลค่า 500,000 ล้านดอลลาร์ของ Nvidia-Blackstone เส้นทางเงินหมุนเวียนในอุตสาหกรรม AI และความเสี่ยงเชิงระบบหากกลายเป็นฟองสบู่ที่แตก",
};

const TOC = [
  { id: "deal", label: "01 ดีล SPV คืออะไร" },
  { id: "loop", label: "02 วงจรเงินหมุนเวียน" },
  { id: "bubble", label: "03 เป็นฟองสบู่จริงหรือไม่" },
  { id: "risk", label: "04 ใครถือความเสี่ยงจริง" },
  { id: "contagion", label: "05 ช่องทางแพร่กระจาย" },
  { id: "impact", label: "06 ใครโดนบ้างถ้าแตก" },
  { id: "signals", label: "07 สัญญาณเตือน" },
  { id: "synthesis", label: "08 บทสรุป" },
  { id: "deepdive", label: "09 วิเคราะห์ระดับลึกสุด" },
  { id: "opinion", label: "10 ความเห็นส่วนตัว" },
  { id: "sources", label: "แหล่งข้อมูล" },
];

export default function AIFinancingWebPage() {
  return (
    <>
      <div className="crumbs">
        <Link href="/">← หน้าแรก</Link>
      </div>

      <div className="stock-head">
        <h1>โครงข่ายการเงิน AI: Nvidia, Blackstone และคำถามเรื่องฟองสบู่</h1>
      </div>
      <p className="subtitle">
        งานวิจัยพิเศษ · 1 กันยายน 2026 ·{" "}
        <span className="badge risk-high">ความเสี่ยงเชิงระบบกำลังก่อตัว</span>
      </p>
      <p className="subtitle">
        ไม่ใช่การวิเคราะห์รายหุ้น — รวบรวมและวิเคราะห์โครงสร้างดีล SPV ของ Nvidia กับ Blackstone,
        Apollo, KKR, BlackRock, Brookfield และ Goldman Sachs เส้นทางเงินหมุนเวียนในอุตสาหกรรม AI
        และความเสี่ยงเชิงระบบหากการลงทุนนี้กลายเป็นฟองสบู่ที่แตก
      </p>

      <div className="rail">
        <div className="stat">
          <div className="stat-k">เป้าระดมทุน SPV</div>
          <div className="stat-v">$500B</div>
          <div className="stat-n">Nvidia + 6 สถาบันการเงิน</div>
        </div>
        <div className="stat">
          <div className="stat-k">หนี้นอกงบดุล</div>
          <div className="stat-v">$2.13T</div>
          <div className="stat-n">5 hyperscaler รวมกัน</div>
        </div>
        <div className="stat">
          <div className="stat-k">Capex hyperscaler 2026</div>
          <div className="stat-v">~$770B</div>
          <div className="stat-n">สูงกว่ายุค dot-com แล้ว</div>
        </div>
        <div className="stat">
          <div className="stat-k">เครดิต Oracle</div>
          <div className="stat-v dn">BBB-</div>
          <div className="stat-n">เหนือ junk ขั้นเดียว</div>
        </div>
        <div className="stat">
          <div className="stat-k">มูลค่าเสี่ยงหากแตก</div>
          <div className="stat-v dn">$33T</div>
          <div className="stat-n">ประเมินโดย WEF/Oliver Wyman</div>
        </div>
      </div>

      <nav className="toc" aria-label="หัวข้อในหน้า">
        {TOC.map((t) => (
          <a key={t.id} href={`#${t.id}`}>
            {t.label}
          </a>
        ))}
      </nav>

      {/* ---------------- 01 ---------------- */}
      <h2 id="deal">01 · ดีล SPV มูลค่า 500,000 ล้านดอลลาร์คืออะไรกันแน่</h2>
      <div className="card">
        <Markdown
          text={`วันที่ 10 สิงหาคม 2026 Nvidia ประกาศ MOU กับ Apollo, BlackRock, Blackstone, Brookfield, Goldman Sachs และ KKR เพื่อสร้าง "แพลตฟอร์มการเงิน" 6 แห่งแยกกัน ระดมทุนจากบุคคลที่สามให้ลูกค้าของ Nvidia นำไปสร้างศูนย์ข้อมูลและซื้อชิป

หัวใจของดีลนี้ไม่ใช่การที่ Nvidia จะควักเงินเอง แต่คือการให้**สถาบันการเงินทั้ง 6 แห่งไปหาเงินจาก "บุคคลที่สาม"** — กองทุนบำนาญ บริษัทประกัน กองทุนความมั่งคั่งแห่งชาติ และนักลงทุนสถาบัน — แล้วนำเงินนั้นมาปล่อยกู้ให้ hyperscaler, AI lab และองค์กรต่างๆ ไปซื้อชิป Nvidia และสร้างศูนย์ข้อมูล โดยใช้**กำลังประมวลผล (compute) เป็นหลักประกัน** ในลักษณะเดียวกับที่โครงสร้างพื้นฐานพลังงานหรืออสังหาริมทรัพย์เชิงพาณิชย์ถูกใช้ค้ำประกันสินเชื่อโครงการมาแต่ไหนแต่ไร

กลไกที่ใช้คือ **SPV (Special Purpose Vehicle)** หรือนิติบุคคลเฉพาะกิจ ตั้งขึ้นเพื่อถือครองศูนย์ข้อมูล/ชิปโดยเฉพาะ แยกออกจากงบดุลของทั้ง Nvidia และบริษัทผู้เช่า จากนั้น SPV จะออกหุ้นกู้เอกชน (มักผ่านช่องทาง 144A) มูลค่าหลักหมื่นล้านดอลลาร์ต่อครั้ง นำเงินไปซื้อ/สร้างสินทรัพย์ แล้วให้ hyperscaler หรือ AI lab เช่ากลับ กระแสเงินค่าเช่าระยะยาวถูกใช้ผ่อนชำระหนี้ก้อนนั้น ผลลัพธ์คือทุกฝ่ายสามารถขยายกำลังการผลิตได้มหาศาลโดย**ไม่ต้องบันทึกหนี้ก้อนใหญ่ไว้ในงบดุลของตัวเอง**

### ตัวอย่างที่เกิดขึ้นแล้วก่อนดีล 500,000 ล้าน

โครงสร้างแบบนี้ไม่ใช่เรื่องใหม่ — มันคือแม่แบบที่ดีล 500,000 ล้านดอลลาร์กำลังจะขยายให้ใหญ่ขึ้นอีกหลายเท่า`}
        />

        <div className="tbl-scroll">
          <table className="fin-tbl">
            <caption>ตัวอย่างดีล SPV ที่เกิดขึ้นแล้วในอุตสาหกรรม AI</caption>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>ดีล</th>
                <th>มูลค่า</th>
                <th style={{ textAlign: "left" }}>โครงสร้าง</th>
                <th style={{ textAlign: "left" }}>ผู้ค้ำประกันความเสี่ยง</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ textAlign: "left" }}>
                  <b>Meta &quot;Hyperion&quot;</b>
                  <br />
                  <span className="src">ต.ค. 2025, ลุยเซียนา</span>
                </td>
                <td className="col-now">$30B</td>
                <td style={{ textAlign: "left", whiteSpace: "normal" }}>
                  หนี้ ~$27B จาก Pimco, BlackRock, Apollo + ทุน $3B จาก Blue Owl — SPV เป็นเจ้าของศูนย์ข้อมูลแล้วให้ Meta เช่า
                </td>
                <td style={{ textAlign: "left", whiteSpace: "normal" }}>
                  Meta ไม่บันทึกหนี้ในงบดุล; ผู้ถือหนี้รับความเสี่ยงจากมูลค่าคงเหลือของอาคาร/อุปกรณ์
                </td>
              </tr>
              <tr>
                <td style={{ textAlign: "left" }}>
                  <b>Anthropic × Apollo × Blackstone</b>
                  <br />
                  <span className="src">มิ.ย. 2026</span>
                </td>
                <td className="col-now">$35B</td>
                <td style={{ textAlign: "left", whiteSpace: "normal" }}>
                  สินเชื่อ 3 ชั้น (tranche) ค้ำด้วยชิปที่ให้เช่า เป้าหมาย 20GW ภายในปี 2028
                </td>
                <td style={{ textAlign: "left", whiteSpace: "normal" }}>
                  <b>Broadcom</b> รับประกันมูลค่าคงเหลือ (residual value) ของชิปหากเสื่อมสภาพเร็วกว่าคาด
                </td>
              </tr>
              <tr>
                <td style={{ textAlign: "left" }}>
                  <b>Blackstone Data Center REIT (BDIT/BREIT)</b>
                </td>
                <td className="col-now">
                  $185B
                  <br />
                  <span className="src">(จาก $130B ต้นปี 2026)</span>
                </td>
                <td style={{ textAlign: "left", whiteSpace: "normal" }}>
                  สัดส่วนศูนย์ข้อมูลใน BREIT เพิ่มเป็น 27% ของสินทรัพย์รวม; เตรียมตั้งบริษัทมหาชนเพื่อซื้อศูนย์ข้อมูลโดยเฉพาะ
                </td>
                <td style={{ textAlign: "left", whiteSpace: "normal" }}>
                  กระจุกตัวในผู้เช่าระดับ investment-grade กลุ่มเล็ก — ความเสี่ยงตกอยู่กับผู้ถือหน่วยลงทุน BREIT
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="note">
          <b>จุดสังเกต</b> — ดีล Anthropic ใช้ชิป <b>Broadcom</b> ไม่ใช่ Nvidia เป็นหลักประกัน สะท้อนว่าโมเดล
          &quot;SPV ค้ำด้วยกำลังประมวลผล&quot; ไม่ได้ผูกกับ Nvidia รายเดียว แต่กำลังกลายเป็น
          <b> มาตรฐานใหม่ของการเงินทั้งอุตสาหกรรม AI</b>
        </div>
      </div>

      {/* ---------------- 02 ---------------- */}
      <h2 id="loop">02 · วงจรการเงินแบบหมุนกลับ (Circular Financing)</h2>
      <div className="card">
        <div className="chart-card">
          <div className="chart-scroll">
            <svg viewBox="0 0 640 360" role="img" aria-label="แผนภาพวงจรเงินหมุนเวียน AI">
              <defs>
                <marker id="arrowA" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
                </marker>
              </defs>
              <g>
                <rect x="240" y="20" width="160" height="60" rx="8" fill="none" stroke="var(--border)" strokeWidth="1.4" />
                <text x="320" y="45" textAnchor="middle" fill="var(--text)" fontSize="14" fontWeight="700">Nvidia</text>
                <text x="320" y="64" textAnchor="middle" fill="var(--text-dim)" fontSize="11">ผู้ผลิตชิป GPU</text>

                <rect x="30" y="264" width="200" height="70" rx="8" fill="none" stroke="var(--border)" strokeWidth="1.4" />
                <text x="130" y="292" textAnchor="middle" fill="var(--text)" fontSize="14" fontWeight="700">AI Lab</text>
                <text x="130" y="311" textAnchor="middle" fill="var(--text-dim)" fontSize="11">OpenAI · xAI · Anthropic</text>

                <rect x="410" y="264" width="200" height="70" rx="8" fill="none" stroke="var(--border)" strokeWidth="1.4" />
                <text x="510" y="292" textAnchor="middle" fill="var(--text)" fontSize="14" fontWeight="700">ผู้ให้บริการคลาวด์</text>
                <text x="510" y="311" textAnchor="middle" fill="var(--text-dim)" fontSize="11">Oracle · CoreWeave · Azure · AWS</text>

                <path d="M255,80 C170,140 120,190 120,262" fill="none" stroke="var(--accent)" strokeWidth="1.4" markerEnd="url(#arrowA)" />
                <text x="60" y="175" fontSize="11.5" fill="var(--accent)" fontWeight="600">ลงทุน/ค้ำประกัน</text>
                <text x="60" y="190" fontSize="11.5" fill="var(--accent)" fontWeight="600">เงินกู้ สูงสุด $100B+</text>

                <path d="M232,299 L408,299" fill="none" stroke="var(--accent)" strokeWidth="1.4" markerEnd="url(#arrowA)" />
                <text x="320" y="289" textAnchor="middle" fontSize="11.5" fill="var(--accent)" fontWeight="600">สัญญาเช่า compute</text>
                <text x="320" y="318" textAnchor="middle" fontSize="10.5" fill="var(--text-dim)">เช่น $300B → Oracle, $250B → Azure</text>

                <path d="M470,262 C440,190 400,140 340,82" fill="none" stroke="var(--accent)" strokeWidth="1.4" markerEnd="url(#arrowA)" />
                <text x="435" y="175" fontSize="11.5" fill="var(--accent)" fontWeight="600">ซื้อชิป Nvidia</text>
                <text x="435" y="190" fontSize="11.5" fill="var(--accent)" fontWeight="600">กลับมาเป็นรายได้</text>
              </g>
            </svg>
          </div>
          <div className="fig-caption">
            เงินลงทุนของ Nvidia ไหลเป็นวงกลม: ลงทุน/ค้ำประกัน → AI lab จ่ายค่าเช่า compute → ผู้ให้บริการคลาวด์นำรายได้ไปซื้อชิป Nvidia กลับมา
          </div>
        </div>

        <Markdown
          text={`ตัวอย่างที่ชัดที่สุดคือ **OpenAI** ซึ่งประกาศพันธะสัญญาการใช้จ่ายระยะยาวไว้แล้วอย่างน้อย **$250B** กับ Microsoft Azure, **$300B** กับ Oracle, **$138B** กับ Amazon AWS, **$22.4B** กับ CoreWeave, สูงสุดถึง **$100B** จากเงินลงทุนของ Nvidia และ **$10B** กับ Broadcom — รวมพันธะที่ผูกไว้ถึงปี 2035 กว่า **1.1 ล้านล้านดอลลาร์** ทั้งที่ OpenAI เองยังขาดทุนและคาดว่าจะขาดทุนราว **$14,000 ล้าน** ในปี 2026 (เกือบ 3 เท่าของปี 2025) ยิ่งไปกว่านั้น มีรายงานว่า Nvidia เคยพิจารณาข้อเสนอค้ำประกันการชำระค่าเช่าศูนย์ข้อมูลของ OpenAI สูงสุด **$250B** บวกการซื้อชิปอีก **$350B** — เท่ากับผู้ขายชิปกำลังค้ำประกันหนี้ให้ลูกค้าซื้อของจากตัวเอง`}
        />

        <div className="quote">
          &quot;เงินสดออกจากงบดุลของผู้ผลิตชิปในฐานะ &apos;การลงทุน&apos; แล้ววนกลับมาที่งบกำไรขาดทุนในฐานะ &apos;รายได้&apos; หลังผ่าน AI lab และผู้ให้บริการคลาวด์เพียงหนึ่งหรือสองทอด&quot;
          <cite>— สรุปกลไก circular financing ที่ Bloomberg และนักวิเคราะห์หลายสำนักตั้งข้อสังเกตร่วมกัน, 2026</cite>
        </div>

        <Markdown
          text={`ธนาคารเพื่อการชำระหนี้ระหว่างประเทศ (BIS) ระบุในรายงานประจำปี 2026 ว่าดีลลักษณะนี้ **"แทบไม่เคยถูกเปิดเผยครบถ้วนในงบการเงิน"** ทำให้หน่วยงานกำกับดูแลประเมินขนาดความเสี่ยงที่แท้จริงได้ยาก และจัดให้ "การล่มสลายของวงจรการเงินหมุนเวียน" เป็นหนึ่งใน 3 ความเสี่ยงหลักต่อเสถียรภาพการเงินโลก`}
        />
      </div>

      {/* ---------------- 03 ---------------- */}
      <h2 id="bubble">03 · เป็นฟองสบู่จริงหรือไม่</h2>
      <div className="card">
        <p className="prose-block">
          ทั้งสองฝั่งมีตัวเลขสนับสนุนตัวเอง — ประเด็นจึงไม่ใช่ว่าใครถูก แต่คือกลไกไหนพังก่อนถ้าสมมติฐานฝั่งใดฝั่งหนึ่งผิด
        </p>
        <div className="two">
          <div className="panel">
            <h3 style={{ color: "var(--green)" }}>◆ ฝั่งเชื่อว่าไม่ใช่ฟองสบู่</h3>
            <ul className="pill-list">
              <li><b>Jensen Huang (CEO Nvidia):</b> โลกยังลงทุนไปเพียง &quot;ไม่กี่แสนล้านดอลลาร์&quot; จากที่ต้องการอีก &quot;หลายล้านล้านดอลลาร์&quot; ในโครงสร้างพื้นฐาน AI</li>
              <li>ชิปรุ่นใหม่ขายหมดสต็อกต่อเนื่อง สะท้อนดีมานด์จริงที่ยังเกินอุปทาน</li>
              <li>ต่างจาก dot-com ตรงที่ capex ส่วนใหญ่มาจาก<b> กระแสเงินสดจากการดำเนินงานจริง</b> ของบริษัทที่กำไรอยู่แล้ว</li>
              <li>Huang ย้ำว่า AI &quot;ทำกำไรได้มหาศาล&quot; และตัวเขาเองก็ยินดีจ่ายเงินหลายร้อยล้านดอลลาร์เพื่อใช้ AI</li>
            </ul>
          </div>
          <div className="panel">
            <h3 style={{ color: "var(--red)" }}>◆ ฝั่งเชื่อว่าเป็นฟองสบู่</h3>
            <ul className="pill-list risks">
              <li><b>Michael Burry:</b> อายุใช้งานจริงของ GPU อยู่ที่ 2–3 ปี แต่บันทึกค่าเสื่อมราคา 5–6 ปี ทำให้กำไรอุตสาหกรรมสูงเกินจริงรวม ~$176,000 ล้าน (2026–2028)</li>
              <li>capex-to-sales ของ hyperscaler ปี 2026 อยู่ที่ ~34% คาดแตะ 37% ปี 2028 — <b>สูงกว่าจุดพีคยุค dot-com ที่ ~32%</b></li>
              <li>อุตสาหกรรม AI ลงทุน <b>$8–10</b> ทุกๆ รายได้จริง <b>$1</b></li>
              <li>Burry เปรียบเทียบว่าเหมือน &quot;การสร้างโครงข่ายโทรคมนาคมเกินจำเป็นปลายยุค 1990s&quot; มากกว่า dot-com — ปัญหาคือ<b> สินทรัพย์ล้นเกิน</b></li>
            </ul>
          </div>
        </div>

        <Markdown
          text={`Nvidia ตอบโต้ Burry ด้วยเอกสารลับ 7 หน้าถึงนักวิเคราะห์ Wall Street ยืนยันว่าลูกค้าตัดค่าเสื่อมราคา 4–6 ปีตามอายุใช้งานจริง ไม่ใช่ตัวเลขที่แต่งขึ้น — สะท้อนว่าแม้แต่ผู้เล่นหลักก็ยอมรับว่าเรื่อง**อายุขัยของ GPU คือจุดเปราะบางที่สุดของสมมติฐานกำไรทั้งอุตสาหกรรม** เพราะถ้า GPU เสื่อมสภาพเร็วกว่าที่บันทึกบัญชีไว้จริง มูลค่าหลักประกันของ SPV ทุกดีลที่ค้ำด้วย "compute" ก็จะลดฮวบเร็วกว่าที่นักลงทุนตั้งราคาไว้เช่นกัน

**สิ่งที่ต่างจากฟองสบู่ครั้งก่อนจริงๆ:** ผู้ลงทุนหลักรอบนี้เป็นบริษัทกำไรจริง ไม่ใช่ dot-com สตาร์ตอัปเก็งกำไร แต่ความเข้มข้นของ capex-to-sales สูงกว่ายุค dot-com แล้ว และการเงินแบบ vendor financing/circular deal ก็เป็นสัญญาณเตือนแบบเดียวกัน จุดใหม่ที่ไม่เคยมีมาก่อนคือการใช้ SPV นอกงบดุลผลักความเสี่ยงจากงบดุลบริษัทเทคฯ ที่แข็งแรง ไปอยู่ในมือกองทุนบำนาญ บริษัทประกัน และนักลงทุนรายย่อยที่ไม่รู้ตัว`}
        />
      </div>

      {/* ---------------- 04 ---------------- */}
      <h2 id="risk">04 · ใครถือความเสี่ยงจริง เมื่อหนี้ไม่อยู่ในงบดุลใคร</h2>
      <div className="card">
        <div className="chart-card">
          <div className="chart-scroll">
            <svg viewBox="0 0 700 460" role="img" aria-label="แผนภาพห่วงโซ่ความเสี่ยงหนี้ศูนย์ข้อมูล AI">
              <defs>
                <marker id="arrowB" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
                </marker>
              </defs>
              <g>
                <rect x="210" y="16" width="280" height="54" rx="8" fill="none" stroke="var(--border)" strokeWidth="1.4" />
                <text x="350" y="38" textAnchor="middle" fill="var(--text)" fontSize="13.5" fontWeight="700">AI Lab / Hyperscaler</text>
                <text x="350" y="57" textAnchor="middle" fill="var(--text-dim)" fontSize="11">เช่า compute ระยะยาว 10–20 ปี</text>

                <line x1="350" y1="70" x2="350" y2="104" stroke="var(--accent)" strokeWidth="1.4" markerEnd="url(#arrowB)" />
                <text x="368" y="91" fontSize="11" fill="var(--accent)">ค่าเช่าผ่อนหนี้</text>

                <rect x="210" y="106" width="280" height="54" rx="8" fill="none" stroke="var(--border)" strokeWidth="1.4" />
                <text x="350" y="128" textAnchor="middle" fill="var(--text)" fontSize="13.5" fontWeight="700">SPV</text>
                <text x="350" y="147" textAnchor="middle" fill="var(--text-dim)" fontSize="11">ถือครองศูนย์ข้อมูล/ชิป ออกหุ้นกู้ 144A</text>

                <line x1="350" y1="160" x2="350" y2="194" stroke="var(--accent)" strokeWidth="1.4" markerEnd="url(#arrowB)" />
                <text x="382" y="181" fontSize="11" fill="var(--accent)">หนี้/ทุน</text>

                <rect x="170" y="196" width="360" height="54" rx="8" fill="none" stroke="var(--border)" strokeWidth="1.6" />
                <text x="350" y="218" textAnchor="middle" fill="var(--text)" fontSize="13.5" fontWeight="700">ผู้จัดการสินเชื่อเอกชน</text>
                <text x="350" y="237" textAnchor="middle" fill="var(--text-dim)" fontSize="11">Blackstone · Apollo · KKR · Blue Owl · Pimco</text>

                <line x1="350" y1="250" x2="350" y2="280" stroke="var(--accent)" strokeWidth="1.4" markerEnd="url(#arrowB)" />
                <text x="382" y="269" fontSize="11" fill="var(--accent)">ระดมทุนจาก</text>

                <path d="M350,280 L130,320" fill="none" stroke="var(--accent)" strokeWidth="1.4" markerEnd="url(#arrowB)" />
                <path d="M350,280 L350,320" fill="none" stroke="var(--accent)" strokeWidth="1.4" markerEnd="url(#arrowB)" />
                <path d="M350,280 L570,320" fill="none" stroke="var(--accent)" strokeWidth="1.4" markerEnd="url(#arrowB)" />

                <rect x="20" y="322" width="220" height="78" rx="8" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="1.2" />
                <text x="130" y="348" textAnchor="middle" fill="var(--text)" fontSize="13" fontWeight="700">บริษัทประกันชีวิต</text>
                <text x="130" y="367" textAnchor="middle" fill="var(--text-dim)" fontSize="10.5">~$1 ล้านล้าน ใน private credit</text>
                <text x="130" y="383" textAnchor="middle" fill="var(--text-dim)" fontSize="10.5">(เพิ่มจาก 3% → 6% ของสินทรัพย์)</text>

                <rect x="240" y="322" width="220" height="78" rx="8" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="1.2" />
                <text x="350" y="348" textAnchor="middle" fill="var(--text)" fontSize="13" fontWeight="700">กองทุนบำนาญ</text>
                <text x="350" y="367" textAnchor="middle" fill="var(--text-dim)" fontSize="10.5">รับหนี้ที่ธนาคารชนเพดาน</text>
                <text x="350" y="383" textAnchor="middle" fill="var(--text-dim)" fontSize="10.5">ความเข้มข้นแล้วปล่อยไม่ได้</text>

                <rect x="460" y="322" width="220" height="78" rx="8" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="1.2" />
                <text x="570" y="348" textAnchor="middle" fill="var(--text)" fontSize="13" fontWeight="700">นักลงทุนรายย่อย</text>
                <text x="570" y="367" textAnchor="middle" fill="var(--text-dim)" fontSize="10.5">ผ่าน BDC, REIT (เช่น BREIT)</text>
                <text x="570" y="383" textAnchor="middle" fill="var(--text-dim)" fontSize="10.5">และกองทุน 401(k)</text>

                <line x1="20" y1="424" x2="680" y2="424" stroke="var(--border)" strokeWidth="1" strokeDasharray="3,4" />
                <text x="350" y="446" textAnchor="middle" fill="var(--red)" fontSize="12" fontWeight="600">ผู้ถือความเสี่ยงปลายทางที่แท้จริง — ไม่ใช่ธนาคารหรือ Nvidia</text>
              </g>
            </svg>
          </div>
          <div className="fig-caption">
            หนี้ศูนย์ข้อมูลเคลื่อนจากงบดุลธนาคาร ไปสู่ SPV แล้วไปสู่ผู้จัดการสินเชื่อเอกชน ก่อนไปจบที่กรมธรรม์ประกันชีวิต เงินบำนาญ และพอร์ตนักลงทุนรายย่อย
          </div>
        </div>

        <Markdown
          text={`ตัวเลขที่แสดงขนาดของการเคลื่อนย้ายความเสี่ยงนี้ชัดเจนมาก: หนี้ที่ปล่อยให้บริษัทเกี่ยวข้องกับ AI พุ่งจากเกือบศูนย์ มาเป็นกว่า **$200,000 ล้าน** ภายในไม่กี่ปี และ Morgan Stanley คาดว่าสินเชื่อเอกชนจะปล่อยกู้ให้ศูนย์ข้อมูลเพิ่มอีก **$800,000 ล้าน** ในช่วง 2 ปีข้างหน้า ขณะที่ตราสาร ABS/CMBS ที่ค้ำด้วยศูนย์ข้อมูลเติบโตจาก **$4,000 ล้าน** ในปี 2020 เป็น **$61,000 ล้าน** กลางปี 2026

งานศึกษาของ Fed สาขาชิคาโกพบว่าธนาคารมี exposure ตรงต่ออุตสาหกรรมที่เกี่ยวกับ AI เพียงเฉลี่ย **0.8%** ของสินทรัพย์รวม — ฟังดูน้อย แต่สินเชื่อธนาคารสู่ non-bank financial institutions เพิ่มจาก **1%** ปี 2013 เป็นเกือบ **25%** ปัจจุบัน — ธนาคารก็ยัง "เห็น" ความเสี่ยงนี้อยู่ดี เพียงแต่ซ่อนอยู่อีกชั้นหนึ่ง`}
        />

        <div className="tbl-scroll">
          <table className="fin-tbl">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>ผู้ถือความเสี่ยง</th>
                <th>ขนาด exposure</th>
                <th style={{ textAlign: "left" }}>หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ textAlign: "left" }}>บริษัทประกันชีวิตรายใหญ่</td>
                <td className="col-now">~$1T</td>
                <td style={{ textAlign: "left", whiteSpace: "normal" }}>private credit คิดเป็น 14% ของงบดุล (2024) เพิ่มจาก 3%→6% ของ general account (2020→2026)</td>
              </tr>
              <tr>
                <td style={{ textAlign: "left" }}>สินเชื่อธนาคารสู่ non-bank</td>
                <td className="col-now">~25%</td>
                <td style={{ textAlign: "left", whiteSpace: "normal" }}>ของสินเชื่อธนาคารสู่สถาบันการเงินที่ไม่ใช่ธนาคาร ปัจจุบันไหลไปบริษัทสินเชื่อเอกชน (จาก 1% ปี 2013)</td>
              </tr>
              <tr>
                <td style={{ textAlign: "left" }}>Data center ABS/CMBS</td>
                <td className="col-now">$4B → $61B</td>
                <td style={{ textAlign: "left", whiteSpace: "normal" }}>เติบโต 15 เท่าตั้งแต่ปี 2020 ถึงกลางปี 2026</td>
              </tr>
              <tr>
                <td style={{ textAlign: "left" }}>หนี้นอกงบดุล 5 hyperscaler</td>
                <td className="col-now">$2.13T</td>
                <td style={{ textAlign: "left", whiteSpace: "normal" }}>เทียบพันธบัตรสาธารณะที่ออกจริงเพียง $445.8B — ต่างกันเกือบ 5 เท่า</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------------- 05 ---------------- */}
      <h2 id="contagion">05 · ช่องทางแพร่กระจายความเสี่ยง — Oracle ในฐานะ &quot;นกขมิ้นในเหมืองถ่านหิน&quot;</h2>
      <div className="card">
        <Markdown
          text={`วันที่ 9 กรกฎาคม 2026 S&P ปรับลดอันดับเครดิตของ Oracle จาก BBB เหลือ **BBB-** — เหนือระดับ junk เพียงขั้นเดียว — โดยระบุความเสี่ยงจากการกระจุกตัวของลูกค้าไปที่ OpenAI เป็นเหตุผลหลัก ภาระผูกพันค้างส่ง (RPO) ของ Oracle พุ่งไปถึง **$638,000 ล้าน** โดยประมาณครึ่งหนึ่งมาจาก OpenAI เพียงรายเดียว

ผลคือ CDS 5 ปีของ Oracle พุ่งขึ้นแตะ **2.03%** สูงสุดในรอบ 18 ปี (นับตั้งแต่วิกฤต 2008) จากระดับต่ำกว่า 0.5% ก่อนมีดีล OpenAI และ S&P คาดว่า free cash flow ของ Oracle ในปีงบการเงิน 2027 จะขาดดุลขยายไปถึงเกือบ **$42,000 ล้าน**`}
        />

        <div className="quote">
          &quot;หากเกิดความเครียดกับคู่สัญญาที่กระจุกตัวสูงเช่นนี้ จะจุดชนวนให้ credit spread ทั้งตลาดตราสารหนี้ของ hyperscaler ปั่นป่วนตามไปด้วย&quot;
          <cite>— สรุปมุมมองนักวิเคราะห์ต่อความเสี่ยงของ Oracle ในฐานะจุดเริ่มความเครียดที่เป็นไปได้, 2026</cite>
        </div>

        <h3 style={{ fontSize: 15, margin: "18px 0 8px" }}>สามฉากทัศน์ที่เป็นไปได้</h3>
        <div className="scenarios">
          <div className="scenario bull">
            <div className="sc-name">ปรับฐานค่อยเป็นค่อยไป</div>
            <div className="sc-prob">ผลกระทบจำกัด — ไม่ลามเป็นวิกฤตระบบการเงิน</div>
            <div className="sc-note">ความเชื่อมั่นค่อยๆ ลดลง มี re-price อย่างมีระเบียบ — โอกาสสูงสุดถ้านโยบายการเงินเอื้ออำนวย</div>
          </div>
          <div className="scenario base">
            <div className="sc-name">Equity-led correction</div>
            <div className="sc-prob">เสี่ยงปานกลาง-สูง</div>
            <div className="sc-note">ความเชื่อมั่นตลาดหุ้นหลุดพร้อมกัน (คล้าย dot-com) กระทบความมั่งคั่งครัวเรือนสหรัฐฯ เพราะหุ้นคิดเป็น ~30% ของความมั่งคั่งรวม</div>
          </div>
          <div className="scenario bear">
            <div className="sc-name">Debt/Hybrid-led crisis</div>
            <div className="sc-prob">รุนแรงที่สุดหากเกิดขึ้น</div>
            <div className="sc-note">ผิดนัดชำระหนี้จุดหนึ่ง (เช่น Oracle) ลามต่อเนื่องผ่านสินเชื่อเอกชน — เสี่ยงกลายเป็นวิกฤตเชิงระบบคล้าย subprime CDO ปี 2008</div>
          </div>
        </div>

        <Markdown
          text={`ตามการประเมินของ World Economic Forum และ Oliver Wyman ฉากทัศน์เลวร้ายอาจทำให้มูลค่าตลาดหายไปมากถึง **$33 ล้านล้านดอลลาร์** — มากกว่า GDP ของสหรัฐฯ ทั้งประเทศ — โดยดัชนีหุ้นกลุ่มเทคโนโลยีขนาดใหญ่ ("Magnificent Seven") ที่พุ่งขึ้นกว่า 8 เท่านับตั้งแต่ปี 2020 อาจปรับฐานลง 30–50% ในกรณีเลวร้าย พร้อมกับ credit spread ของตราสารหนี้กลุ่ม AI ที่อาจกว้างขึ้นอีกราว 40 basis point Goldman Sachs ระบุสัญญาณเตือน 5 ประการที่คล้ายปลายทศวรรษ 1990: การลงทุนถึงจุดพีค กำไรเริ่มร่วง หนี้เพิ่มขึ้น เฟดปรับลดดอกเบี้ย และ credit spread เริ่มกว้างขึ้น — ปัจจุบันเริ่มเห็นสัญญาณครบทั้ง 5 ข้อบางส่วนแล้ว`}
        />
      </div>

      {/* ---------------- 06 ---------------- */}
      <h2 id="impact">06 · ใครโดนบ้าง ถ้าฟองสบู่แตกจริง</h2>
      <div className="card">
        <p className="prose-block">เรียงจากผู้ที่รับความเสี่ยงเชิงระบบสูงสุด ไปจนถึงผู้ที่กระทบทางอ้อมผ่านเศรษฐกิจโดยรวม</p>
        <div className="stake-grid">
          <div className="stake">
            <div className="who">Oracle, CoreWeave และ neocloud รายอื่น</div>
            <div className="sev"><span className="badge risk-high">เสี่ยงสูงสุด</span></div>
            <p className="why">รายได้กระจุกตัวอยู่กับลูกค้ารายเดียวหรือไม่กี่ราย (OpenAI คิดเป็นครึ่งหนึ่งของ backlog $638B ของ Oracle) มีหนี้สูงและมาร์จิ้นต่ำ — จุดแรกที่จะรู้สึกถึงแรงกระแทก</p>
          </div>
          <div className="stake">
            <div className="who">ผู้ถือความเสี่ยงปลายทาง (ประกันชีวิต / บำนาญ / รายย่อยผ่าน BDC-REIT)</div>
            <div className="sev"><span className="badge risk-high">เสี่ยงสูงสุด</span></div>
            <p className="why">รับความเสี่ยงเครดิตของ SPV โดยตรงแต่ไม่มีอำนาจต่อรองเหมือนธนาคาร หลายกรณีไม่รู้ตัวว่ากรมธรรม์หรือเงินบำนาญเชื่อมโยงกับหนี้ศูนย์ข้อมูล AI</p>
          </div>
          <div className="stake">
            <div className="who">Nvidia</div>
            <div className="sev"><span className="badge risk-mid">เสี่ยงปานกลาง-สูง</span></div>
            <p className="why">รายได้กระจุกตัวสูง — ลูกค้า 3–4 รายคิดเป็น 50–61% ของรายได้บางไตรมาส แม้พยายามผลักความเสี่ยงทางการเงินออกนอกงบดุลผ่าน SPV ก็ตาม</p>
          </div>
          <div className="stake">
            <div className="who">ผู้จัดการสินเชื่อเอกชน (Blackstone, Apollo, KKR, Blue Owl)</div>
            <div className="sev"><span className="badge risk-mid">เสี่ยงปานกลาง</span></div>
            <p className="why">มีรายได้ค่าธรรมเนียมแน่นอนไม่ว่าผลตอบแทนจะเป็นอย่างไร แต่ชื่อเสียงและมูลค่าธุรกิจจะถูกกระทบหนักหากพอร์ตเสียหาย</p>
          </div>
          <div className="stake">
            <div className="who">ธนาคารพาณิชย์</div>
            <div className="sev"><span className="badge risk-mid">เสี่ยงปานกลาง</span></div>
            <p className="why">Exposure ตรงต่ำ (~0.8% ของสินทรัพย์) แต่ exposure ทางอ้อมผ่าน non-bank สูงขึ้นเรื่อยๆ (เกือบ 25%) ธนาคารเล็กที่มี AI company เป็นลูกค้าเงินฝากรายใหญ่เสี่ยงถูกแห่ถอน</p>
          </div>
          <div className="stake">
            <div className="who">บริษัทไฟฟ้า/สาธารณูปโภคและผู้ใช้ไฟทั่วไป</div>
            <div className="sev"><span className="badge risk-mid">เสี่ยงปานกลาง</span></div>
            <p className="why">ลงทุนขยายกำลังผลิตรับดีมานด์ที่คาดการณ์ไว้ล่วงหน้า หากศูนย์ข้อมูลไม่ถูกสร้างตามแผน ต้นทุนอาจถูกผลักไปที่ผู้ใช้ไฟผ่านค่าไฟที่สูงขึ้น</p>
          </div>
          <div className="stake">
            <div className="who">นักลงทุนรายย่อยและตลาดหุ้นในภาพรวม</div>
            <div className="sev"><span className="badge risk-mid">เสี่ยงปานกลาง</span></div>
            <p className="why">หุ้นกลุ่มเทคฯ ขนาดใหญ่คิดสัดส่วนสูงในดัชนีหลักและกองทุนสำรองเลี้ยงชีพที่คนทั่วไปถือ การปรับฐานรุนแรงของ Mag 7 กระทบความมั่งคั่งครัวเรือนในวงกว้าง</p>
          </div>
          <div className="stake">
            <div className="who">เศรษฐกิจสหรัฐฯ และตลาดแรงงานในวงกว้าง</div>
            <div className="sev"><span className="badge risk-low">เสี่ยงทางอ้อม</span></div>
            <p className="why">ผลกระทบต่อเศรษฐกิจจริงน่าจะจำกัดกว่าวิกฤตซับไพรม์ปี 2008 เพราะบริษัทแกนหลักยังมีกำไร/กระแสเงินสดรองรับ แต่การจ้างงานในห่วงโซ่อุปทานอาจได้รับผลกระทบ</p>
          </div>
        </div>
      </div>

      {/* ---------------- 07 ---------------- */}
      <h2 id="signals">07 · สัญญาณเตือนที่ควรจับตาต่อจากนี้</h2>
      <div className="card">
        <ul className="pill-list">
          <li><b>CDS/credit spread ของ Oracle และ hyperscaler อื่น:</b> ปัจจุบันสูงสุดในรอบ 18 ปี — หากยังไต่ระดับต่อเนื่องหรือลามไปยัง Meta, Microsoft, CoreWeave เป็นสัญญาณเตือนสำคัญ</li>
          <li><b>Credit spread ตราสารหนี้กลุ่ม AI โดยรวม:</b> กว้างขึ้นแล้วราว 40bp เทียบตราสาร IG ทั่วไปนับตั้งแต่ ก.ย. ที่ผ่านมา</li>
          <li><b>อัตราการออกหุ้นกู้:</b> Morgan Stanley คาดการออกหุ้นกู้ AI ปี 2026 สูงถึง $570,000 ล้าน (เร็วกว่าปีก่อนราว 4 เท่า) — จังหวะเร่งตัวเร็วมักเป็นสัญญาณปลายวัฏจักรสินเชื่อ</li>
          <li><b>ผลประกอบการ/การเผาเงินสดของ OpenAI:</b> ขาดทุน $14,000 ล้านที่คาดการณ์ไว้ในปี 2026 หากขยายตัวเร็วกว่าคาดจะกระทบความเชื่อมั่นทั้งห่วงโซ่ทันที</li>
          <li><b>ราคาขายต่อของ GPU มือสอง:</b> หากร่วงเร็วกว่าที่บริษัทตั้งสมมติฐานค่าเสื่อมไว้ (ประเด็นที่ Burry หยิบยกขึ้นมา) จะเป็นสัญญาณว่าหลักประกัน SPV ถูกประเมินสูงเกินจริง</li>
          <li><b>ท่าทีหน่วยงานกำกับ:</b> รายงานฉบับถัดไปของ BIS, IMF, FSB และ Fed ว่าจะมีมาตรการกำกับดูแลสินเชื่อเอกชน/SPV เพิ่มเติมหรือไม่</li>
          <li><b>ความคืบหน้าดีล $500,000 ล้านของ Nvidia:</b> ยังเป็นเพียง MOU — ต้องติดตามเงื่อนไข การค้ำประกัน และอัตราดอกเบี้ยเมื่อสัญญาฉบับสมบูรณ์เข้าตลาดจริง</li>
        </ul>
      </div>

      {/* ---------------- 08 ---------------- */}
      <h2 id="synthesis">08 · บทสรุปเชิงวิเคราะห์และข้อควรระวัง</h2>
      <div className="card">
        <Markdown
          text={`จากข้อมูลที่รวบรวมได้ ดีล SPV มูลค่า 500,000 ล้านดอลลาร์ระหว่าง Nvidia กับ Blackstone และสถาบันการเงินอีก 5 แห่ง**ไม่ใช่เหตุการณ์โดดเดี่ยว** แต่คือการขยายขนาดของรูปแบบการเงินที่มีอยู่แล้ว (Meta Hyperion, Anthropic-Apollo-Blackstone) ให้ใหญ่ขึ้นอีกหลายเท่า จุดร่วมของทุกดีลคือการใช้ "กำลังประมวลผล" เป็นหลักประกันสินเชื่อ และผลักความเสี่ยงทางการเงินออกจากงบดุลบริษัทเทคโนโลยีที่แข็งแรง ไปสู่ผู้ให้กู้ปลายทางที่กระจายอยู่ในกรมธรรม์ประกันชีวิต เงินบำนาญ และพอร์ตนักลงทุนรายย่อยจำนวนมาก

คำถามที่ว่า "เป็นฟองสบู่หรือไม่" จึงอาจไม่ใช่คำถามที่ถูกที่สุด — **ดีมานด์ด้าน AI มีความเป็นจริงในระดับหนึ่งอย่างปฏิเสธไม่ได้** แต่คำถามที่สำคัญกว่าคือ หากสมมติฐานสำคัญข้อใดข้อหนึ่งผิดพลาด ความเสียหายจะจำกัดอยู่แค่ไหน ข้อมูลข้างต้นชี้ว่า**ความเสี่ยงเชิงระบบถูกออกแบบให้กระจายไปไกลจากจุดกำเนิดมากกว่าที่เห็นบนหน้าข่าว** และ Oracle คือจุดที่นักวิเคราะห์เฝ้าจับตามากที่สุด`}
        />
        <div className="note warn">
          <b>ข้อควรระวัง</b> — เนื้อหานี้เป็นการรวบรวมและวิเคราะห์ข้อมูลเพื่อการศึกษาเท่านั้น
          <b> ไม่ใช่คำแนะนำการลงทุนหรือคำแนะนำให้ซื้อขายหลักทรัพย์ใดๆ</b> ตัวเลขและอันดับเครดิตเปลี่ยนแปลงได้ตลอดเวลา
          ผู้อ่านที่มีความเสี่ยงทางอ้อมผ่านกองทุนบำนาญ ประกันชีวิต หรือกองทุนรวมที่ถือหุ้นกลุ่มเทคโนโลยีขนาดใหญ่
          ควรตรวจสอบสัดส่วนการลงทุนของตนเองและปรึกษาผู้เชี่ยวชาญทางการเงินที่ได้รับใบอนุญาตก่อนตัดสินใจใดๆ
        </div>
      </div>

      {/* ---------------- 09 ---------------- */}
      <h2 id="deepdive">
        09 · วิเคราะห์แบบลึกสุด <span className="badge cat">Fable 5 · deep synthesis</span>
      </h2>
      <div className="card">
        <Markdown
          text={`ต่อยอดจากข้อเท็จจริงในส่วนที่ 01–08 ด้วยการวิเคราะห์เชิงโครงสร้างและแรงจูงใจของผู้เล่นแต่ละฝ่ายในระดับที่ลึกกว่าเดิม

### โครงสร้าง SPV คือ "การแปลงสินทรัพย์เป็นหลักทรัพย์" รอบใหม่

ดีล MOU ของ Nvidia คือการยกโครงสร้าง **project finance** ที่ใช้กับโรงไฟฟ้า/ท่อส่งน้ำมันมาครอบทับสินทรัพย์ชนิดใหม่คือ "compute power" หัวใจมี 3 ชิ้น: **(ก) Bankruptcy remoteness** — SPV ของ Meta "Hyperion" เป็นเจ้าของศูนย์ข้อมูลแล้วให้ Meta เช่ากลับ หนี้ $27B จึงไม่ปรากฏบนงบดุล Meta ทั้งที่ Meta คือผู้จ่ายกระแสเงินสดตัวจริง — เมื่อรวมทั้งอุตสาหกรรม ภาระนอกงบดุลแบบนี้พุ่งถึง $2.13 ล้านล้าน หรือเกือบ 5 เท่าของพันธบัตรที่ออกจริง แปลว่าหนี้ที่ตลาดมองเห็นคือเพียงยอดภูเขาน้ำแข็ง **(ข) Tranching** — ดีล Anthropic ที่มี 3 tranche คือเทคนิคเดียวกับ CDO: หั่นกระแสเงินสดเป็นชั้นความเสี่ยงให้ชั้นบนสุดดูปลอดภัยพอสำหรับประกันชีวิตและกองทุนบำนาญ จุดที่แยบยลคือ Broadcom ค้ำมูลค่าคงเหลือของชิปตัวเอง — conflict of interest แบบเดียวกับที่ originator สินเชื่อ subprime เคยประเมินคุณภาพสินเชื่อของตัวเอง **(ค) การกระจายผ่านตลาดทุน** — ABS/CMBS ศูนย์ข้อมูลโตจาก $4B เป็น $61B คือท่อที่แปลงความเสี่ยงหุ้น Nvidia ให้กลายเป็นความเสี่ยงเครดิตในพอร์ตเงินออมระยะยาวของคนทั่วไป

### Game theory: ทำไมทุกฝ่ายยอมเล่นทั้งที่รู้ความเสี่ยง

หัวใจคือ **ไม่มีใครในเกมนี้ถือ downside เต็มจำนวนของตัวเอง** ทุกฝ่ายมี asymmetric payoff ที่ทำให้ "เล่นต่อ" เป็นทางเลือกที่มีเหตุผลระดับปัจเจก แม้ระบบโดยรวมจะเปราะบางขึ้นเรื่อยๆ

- **Nvidia** — โครงสร้าง SPV แก้ 3 โจทย์พร้อมกัน: ลูกค้าที่ไม่มีเงินยังซื้อชิปต่อได้ด้วยเงินคนอื่น รักษา growth narrative; ความเสี่ยงเครดิตอยู่นอกงบดุลตัวเอง; และซ่อนปัญหา customer concentration ด้วยการสร้างผู้ซื้อชั้นกลางที่ใช้เงิน third-party
- **Blackstone / Apollo / KKR / BlackRock / Brookfield** — principal-agent problem ตำราเป๊ะ: fund manager เก็บค่าธรรมเนียมบริหาร ~1–2% ของ AUM ไม่ว่าผลลัพธ์จะเป็นอย่างไร การระดม $500B แปลว่าค่าธรรมเนียมระดับ $5,000–10,000 ล้านต่อปีที่ล็อกไว้ล่วงหน้า
- **Hyperscaler** — ติดกับ prisoner's dilemma แบบ arms race: ลงทุนน้อยไปเสี่ยงตายถาวรถ้า AI มีมูลค่าจริง ลงทุนมากไปแค่เจ็บแต่รอดถ้าฟองแตก — overinvestment จึงเป็นทางเลือกที่มีเหตุผลของทุกคนพร้อมกัน
- **AI lab (OpenAI/Anthropic)** — การผูกพันวงเงินมหาศาลทั้งที่ขาดทุน คือกลยุทธ์ในตัวมันเอง: เมื่อผูก Microsoft, Oracle, AWS, Nvidia เข้ากับความอยู่รอดของตน จะไม่มี counterparty รายใดยอมให้ล้ม — แปลงความเปราะบางให้กลายเป็นอำนาจต่อรอง
- **ผู้รับความเสี่ยงตัวจริง** — ปลายสายพานคือผู้ถือกรมธรรม์ประกันชีวิต สมาชิกกองทุนบำนาญ และครัวเรือนสหรัฐฯ ที่ไม่รู้ตัวว่าถือความเสี่ยงนี้ ไม่มีที่นั่งบนโต๊ะเจรจา และได้ผลตอบแทนชดเชยความเสี่ยงน้อยที่สุด`}
        />

        <h3 style={{ fontSize: 15, margin: "18px 0 8px" }}>จุดวิกฤตที่เป็นไปได้จริง 3 จุด</h3>
        <div className="tbl-scroll">
          <table className="fin-tbl">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Trigger</th>
                <th style={{ textAlign: "left" }}>กลไก</th>
                <th>โอกาส (อัตวิสัย)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ textAlign: "left" }}><b>Oracle หลุด investment grade</b></td>
                <td style={{ textAlign: "left", whiteSpace: "normal" }}>อยู่ BBB- แล้ว, CDS สูงสุดรอบ 18 ปี, FCF deficit จ่อแตะ $42B — หลุด IG จะบังคับให้กองทุน IG-mandate เทขาย</td>
                <td className="col-now">
                  <span className="badge risk-mid">~35–45%</span>
                  <br />
                  <span className="src">ใน 12–18 เดือน</span>
                </td>
              </tr>
              <tr>
                <td style={{ textAlign: "left" }}><b>OpenAI ระดมทุนสะดุด</b></td>
                <td style={{ textAlign: "left", whiteSpace: "normal" }}>ไม่จำเป็นต้องล้มละลาย แค่รอบระดมทุนถัดไป valuation ไม่ขึ้น (flat/down round) ก็พอสั่นคลอนทั้งระบบ</td>
                <td className="col-now">
                  <span className="badge risk-mid">~30–40%</span>
                  <br />
                  <span className="src">ใน 24 เดือน</span>
                </td>
              </tr>
              <tr>
                <td style={{ textAlign: "left" }}><b>Impairment GPU รายแรกจาก auditor</b></td>
                <td style={{ textAlign: "left", whiteSpace: "normal" }}>หาก auditor บังคับลดอายุค่าเสื่อมของ hyperscaler รายใดรายหนึ่ง ทุกรายต้องรีวิวตาม</td>
                <td className="col-now">
                  <span className="badge risk-high">~40–50%</span>
                  <br />
                  <span className="src">ใน 18–24 เดือน</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="src" style={{ marginTop: 8 }}>
          หมายเหตุ: ตัวเลขโอกาสในตารางนี้เป็นการประเมินเชิงอัตวิสัยของผู้วิเคราะห์ (Fable) บนพื้นฐานข้อมูลข้างต้น ไม่ใช่แบบจำลองทางสถิติที่ผ่านการพิสูจน์
        </p>

        <Markdown
          text={`### เปรียบเทียบเชิงโครงสร้าง: เหมือน telecom มากที่สุด ผสมท่อความเสี่ยงแบบ 2008

โครงสร้างคล้าย **telecom overbuild ปลายยุค 1990s** มากที่สุด — สร้างโครงสร้างพื้นฐานล่วงหน้าดักดีมานด์ที่ "แน่นอนว่าจะมา" ด้วยหนี้ และใช้ vendor financing แบบเดียวกับที่ Lucent/Nortel เคยปล่อยกู้ลูกค้าซื้ออุปกรณ์ตัวเอง จุดที่แย่กว่า telecom คือ fiber ที่วางแล้วไม่เสื่อมและยังยิงแสงใหม่ได้ แต่ GPU เสื่อมทั้งกายภาพและเทคโนโลยี มูลค่า salvage ของซากจึงต่ำกว่ามาก ส่วนกลไก "ท่อส่งความเสี่ยง" (SPV, tranching, off-balance-sheet, ความทึบของการเปิดเผยข้อมูล) ยกมาจากปี 2008 เกือบทั้งชุด สรุปเป็นสูตรได้ว่า: **ดีมานด์ปลายทางจริงแบบ dot-com + โครงสร้าง overbuild แบบ telecom + ท่อส่งความเสี่ยงแบบ 2008**`}
        />
      </div>

      {/* ---------------- 10 ---------------- */}
      <h2 id="opinion">10 · ความเห็นส่วนตัวของผู้วิเคราะห์</h2>
      <div className="card opinion">
        <span className="badge cat" style={{ marginBottom: 12, display: "inline-block" }}>
          ความเห็นส่วนตัว — ไม่ใช่ข้อเท็จจริง ไม่ใช่คำแนะนำการลงทุน
        </span>

        <Markdown
          text={`**ผมเชื่อว่านี่คือฟองสบู่ — แต่เป็นฟองสบู่ทางการเงิน (financing bubble) ที่พันรอบเทคโนโลยีที่แท้จริง ไม่ใช่ฟองสบู่ของตัวเทคโนโลยี** และความแตกต่างนี้กำหนดทั้งรูปแบบและจังหวะของจุดจบ ผมไม่สงสัยเลยว่า AI จะสร้างมูลค่าทางเศรษฐกิจมหาศาลในทศวรรษหน้า เหมือนที่อินเทอร์เน็ตสร้างจริงหลังปี 2000 คำถามไม่ใช่ "AI จริงไหม" แต่คือ "โครงสร้างการเงินที่สร้างขึ้นรอบมัน จะอยู่รอดถึงวันที่รายได้ตามทันหรือไม่" — และประวัติศาสตร์ตอบคำถามนี้ทางเดียวมาตลอด: อุตสาหกรรมที่ลงทุน $8–10 ต่อรายได้จริง $1 โดยพึ่งเงินกู้ที่ค้ำด้วยสินทรัพย์เสื่อมเร็ว ไม่เคยรอดพ้นการ restructure ครั้งใหญ่ ต่อให้ตัวเทคโนโลยีชนะก็ตาม`}
        />

        <div className="score-row">
          <div className="score-tile">
            <div className="label">Credit event สำคัญภายในสิ้นปี 2028</div>
            <div className="value">65–75%</div>
          </div>
          <div className="score-tile">
            <div className="label">ฉากทัศน์รุนแรง (ดัชนีเทคลง 30%+)</div>
            <div className="value">30–40%</div>
          </div>
          <div className="score-tile">
            <div className="label">Soft landing — รายได้โตทันหนี้</div>
            <div className="value">20–25%</div>
          </div>
        </div>

        <Markdown
          text={`**กรอบเวลาที่คาดว่าจะเห็นความเครียดชัดที่สุด: ครึ่งหลังปี 2027 ถึงปี 2028** ด้วยเหตุผลเชิงกลไก ไม่ใช่ลางสังหรณ์ — capex ปี 2026 ที่ +77% จะกลายเป็นค่าเสื่อมก้อนใหญ่ที่วิ่งผ่านงบเต็มปีในช่วงนั้นพอดี พร้อมกับที่ GPU รุ่นซื้อปี 2024–2025 มีอายุครบ 3 ปี — คำตอบของข้อโต้แย้ง Burry vs Nvidia จะโผล่ในงบจริงจนปิดไม่ได้อีก ขณะเดียวกันเป้า 20GW ปี 2028 ของดีล Anthropic ต้องเริ่ม perform จริง และ Morgan Stanley คาดต้องระดมเงินใหม่อีก $800,000 ล้านใน 2 ปีข้างหน้า ระบบที่ต้องพึ่งเงินใหม่มากขนาดนี้จะเปราะที่สุดตอนที่ sentiment สะดุดครั้งแรก

เหตุผลลึกที่สุดมี 3 ข้อ: **หนึ่ง** โครงสร้างนี้ถูกออกแบบมาเพื่อ *ย้าย* ความเสี่ยง ไม่ใช่ *ลด* ความเสี่ยง — ทุกชิ้นส่วนคือเครื่องจักรที่แยกคนตัดสินใจออกจากคนรับผล และระบบที่ incentive จัดวางแบบนี้จะผลิตความเสี่ยงเกินพอดีเสมอ **สอง** เมื่อผู้เล่นที่ฉลาดที่สุด (Nvidia) เลือกโครงสร้างที่เก็บ upside บนงบดุลตัวเองแต่ผลัก downside ออกไปนอกงบดุลอย่างเป็นระบบ นั่นคือการเปิดเผยความเชื่อที่ดังกว่าคำพูดใดๆ ของ CEO **สาม** วลี "this time is different" จากปากผู้เล่นที่ได้ประโยชน์สูงสุด ในเดือนเดียวกับที่ CDS ของลูกค้ารายใหญ่ทำจุดสูงสุดรอบ 18 ปี คือรูปแบบที่ประวัติศาสตร์การเงินไม่เคยให้อภัย

ผมยอมรับตรงไปตรงมาว่าอาจผิดเรื่องจังหวะเวลา — ฟองสบู่มักอยู่ได้นานกว่าที่นักวิเคราะห์มีเหตุผลจะเชื่อ และดีมานด์ AI อาจ surprise ทางบวกได้จริง แต่มั่นใจในข้อสรุปเชิงโครงสร้าง: **ความเสี่ยงไม่ได้หายไปไหน มันแค่ถูกย้ายไปไว้ในที่ที่มองเห็นยากที่สุด และนั่นแหละคือนิยามของปัญหา**`}
        />
      </div>

      {/* ---------------- Sources ---------------- */}
      <h2 id="sources">แหล่งข้อมูลอ้างอิง</h2>
      <div className="card">
        <h3 style={{ fontSize: 14 }}>ดีล SPV และโครงสร้างการเงิน</h3>
        <ul className="pill-list">
          <li><a href="https://www.cnbc.com/2026/08/10/nvidia-wall-street-asset-managers-500-billion-ai-push.html" target="_blank" rel="noopener noreferrer">CNBC — Nvidia lines up $500 billion in financing</a></li>
          <li><a href="https://nvidianews.nvidia.com/news/nvidia-partners-with-apollo-blackrock-blackstone-brookfield-goldman-sachs-and-kkr-to-establish-ai-compute-infrastructure-financing-platforms-to-mobilize-over-500-billion-of-third-party-capital" target="_blank" rel="noopener noreferrer">Nvidia Newsroom — ประกาศดีลอย่างเป็นทางการ</a></li>
          <li><a href="https://www.blackstone.com/news/press/nvidia-partners-with-apollo-blackrock-blackstone-brookfield-goldman-sachs-and-kkr-to-establish-ai-compute-infrastructure-financing-platforms-to-mobilize-over-500-billion-of-third-party-capital/" target="_blank" rel="noopener noreferrer">Blackstone — ข่าวประชาสัมพันธ์ร่วม</a></li>
          <li><a href="https://fortune.com/2026/08/12/nvidia-private-capital-deal-circular-financing-ai-boom/" target="_blank" rel="noopener noreferrer">Fortune — retirement money ในดีล Nvidia</a></li>
          <li><a href="https://capacityglobal.com/news/anthropic-blackstone-apollo-35bn-ai-infrastructure-spv/" target="_blank" rel="noopener noreferrer">Capacity — ดีล $35bn Anthropic × Apollo × Blackstone</a></li>
          <li><a href="https://finance.yahoo.com/sectors/technology/articles/apollo-blackstone-lend-35b-against-220610560.html" target="_blank" rel="noopener noreferrer">Yahoo Finance — Apollo, Blackstone lend $35B against AI chips</a></li>
          <li><a href="https://www.strattonjournal.com/articles/the-3-trillion-shadow-how-off-balance-sheet-ai-debt-is-reshaping-tech-finance" target="_blank" rel="noopener noreferrer">Stratton Journal — หนี้นอกงบดุล $3 ล้านล้าน</a></li>
          <li><a href="https://www.datacenterdynamics.com/en/news/blackstone-to-launch-publicly-traded-ai-data-center-acquisition-company-report/" target="_blank" rel="noopener noreferrer">Data Center Dynamics — Blackstone data center REIT</a></li>
        </ul>

        <h3 style={{ fontSize: 14 }}>วงจรการเงินหมุนเวียนและฟองสบู่</h3>
        <ul className="pill-list">
          <li><a href="https://www.bloomberg.com/graphics/2026-ai-circular-deals/" target="_blank" rel="noopener noreferrer">Bloomberg — AI Circular Deals</a></li>
          <li><a href="https://www.axios.com/2026/07/27/nvidia-openai-financing-ai-jensen-huang-ssi" target="_blank" rel="noopener noreferrer">Axios — Nvidia reignites circular AI concerns</a></li>
          <li><a href="https://www.npr.org/2026/08/02/nx-s1-5913352/nvidia-is-about-to-spend-750-billion-on-ai-critics-are-calling-it-a-bubble" target="_blank" rel="noopener noreferrer">NPR — Nvidia $750 billion spending, bubble critics</a></li>
          <li><a href="https://www.cnbc.com/2025/11/25/nvidia-pushes-back-on-charges-that-ai-investment-is-a-bubble.html" target="_blank" rel="noopener noreferrer">CNBC — Nvidia&apos;s memo pushing back on Burry</a></li>
          <li><a href="https://fortune.com/2026/07/25/nvidia-ceo-jensen-huang-chip-stocks-boom-bust-soon-this-time-is-different/" target="_blank" rel="noopener noreferrer">Fortune — Jensen Huang &quot;this time is different&quot;</a></li>
        </ul>

        <h3 style={{ fontSize: 14 }}>ความเสี่ยงเชิงระบบและคำเตือนจากหน่วยงานกำกับ</h3>
        <ul className="pill-list">
          <li><a href="https://fortune.com/2026/06/29/bis-central-bank-warning-hyperscaler-data-center-1-trillion-gamble-recession/" target="_blank" rel="noopener noreferrer">Fortune — รายงานประจำปี BIS 2026</a></li>
          <li><a href="https://www.cnbc.com/2026/06/28/debt-ai-boom-and-economic-fragilities-raise-global-risks-bis-says.html" target="_blank" rel="noopener noreferrer">CNBC — BIS warns of AI boom risks</a></li>
          <li><a href="https://www.techtimes.com/articles/323718/20260810/banks-hit-concentration-limits-sending-data-center-debt-pension-funds.htm" target="_blank" rel="noopener noreferrer">Tech Times — Banks hit concentration limits</a></li>
          <li><a href="https://cepr.net/publications/when-the-ai-bubble-bursts-who-will-be-left-holding-the-bag/" target="_blank" rel="noopener noreferrer">CEPR — Who will be left holding the bag</a></li>
          <li><a href="https://www.oliverwyman.com/our-expertise/insights/2026/jan/impact-ai-bubble-burst-on-global-financial-markets.html" target="_blank" rel="noopener noreferrer">Oliver Wyman — Impact of AI bubble burst</a></li>
          <li><a href="https://www.weforum.org/stories/2026/01/how-would-the-bursting-of-an-ai-bubble-actually-play-out/" target="_blank" rel="noopener noreferrer">World Economic Forum — Anatomy of an AI reckoning</a></li>
          <li><a href="https://www.bloomberg.com/news/articles/2026-01-21/ai-contagion-channels-show-huge-economic-risk-if-bubble-bursts" target="_blank" rel="noopener noreferrer">Bloomberg — AI contagion channels</a></li>
        </ul>

        <h3 style={{ fontSize: 14 }}>Oracle, OpenAI และตัวชี้วัดเครดิต</h3>
        <ul className="pill-list">
          <li><a href="https://mlq.ai/news/sp-downgrades-oracle-to-bbb-one-notch-above-junk-citing-openai-concentration-risk/" target="_blank" rel="noopener noreferrer">MLQ — S&amp;P downgrades Oracle to BBB-</a></li>
          <li><a href="https://finance.biggo.com/news/8d518fad-924d-4476-b1d8-47ea237a437e" target="_blank" rel="noopener noreferrer">BigGo Finance — Oracle CDS hits 18-year high</a></li>
          <li><a href="https://www.bloomberg.com/news/articles/2026-07-16/oracle-risks-falling-behind-in-ai-race-as-spending-binge-bites" target="_blank" rel="noopener noreferrer">Bloomberg — Oracle credit downgrade risk</a></li>
        </ul>

        <h3 style={{ fontSize: 14 }}>Capex, ค่าเสื่อมราคา และการเปรียบเทียบเชิงประวัติศาสตร์</h3>
        <ul className="pill-list">
          <li><a href="https://www.gurufocus.com/news/8955673/michael-burry-warns-of-ai-market-bubble-risks" target="_blank" rel="noopener noreferrer">GuruFocus — Michael Burry&apos;s AI bubble warning</a></li>
          <li><a href="https://intuitionlabs.ai/articles/ai-bubble-vs-dot-com-comparison" target="_blank" rel="noopener noreferrer">IntuitionLabs — AI Bubble vs. Dot-com Bubble</a></li>
          <li><a href="https://www.mindstudio.ai/blog/ai-bubble-or-structural-boom-capex-forecast-comparison" target="_blank" rel="noopener noreferrer">MindStudio — $805B Capex Forecast comparison</a></li>
          <li><a href="https://www.man.com/insights/2026-h2-credit-outlook" target="_blank" rel="noopener noreferrer">Man Group — H2 2026 Credit Outlook</a></li>
          <li><a href="https://www.tomshardware.com/tech-industry/more-than-50-percent-of-nvidias-data-center-revenue-comes-from-three-customers-usd21-9-billion-in-sales-recorded-from-the-unnamed-companies" target="_blank" rel="noopener noreferrer">Tom&apos;s Hardware — Nvidia customer concentration</a></li>
        </ul>
      </div>

      <p className="disclaimer" style={{ marginTop: 24 }}>
        รายงานนี้จัดทำโดยรวบรวมข้อมูลจากแหล่งข่าวและรายงานสาธารณะที่เผยแพร่จริงในช่วงปี 2025–2026
        (ค้นคว้าและเรียบเรียงส่วนที่ 01–08 โดย Claude Sonnet 5) ส่วนที่ 09–10 เป็นการวิเคราะห์เชิงลึกและความเห็นเพิ่มเติมที่จัดทำโดย
        Claude Fable 5 บนพื้นฐานข้อเท็จจริงชุดเดียวกัน ทุกตัวเลขอ้างอิงจากแหล่งที่ระบุไว้ข้างต้น ณ เวลาที่ค้นคว้า (1 กันยายน 2026)
        สถานการณ์ทางการเงินเปลี่ยนแปลงได้รวดเร็ว ผู้อ่านควรตรวจสอบข้อมูลล่าสุดเพิ่มเติมก่อนนำไปใช้อ้างอิงต่อ
        เนื้อหาทั้งหมดเป็นการวิเคราะห์เพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน
      </p>
    </>
  );
}
