interface ScenarioPoint {
  target?: number;
  probability?: number;
}

/**
 * แผนภาพ risk/reward ของทฤษฎีหนึ่งอัน — เทียบราคาปัจจุบันกับเป้า bear/base/bull บนเส้นเดียว
 * ขนาดจุดของแต่ละเป้าแปรตาม probability ที่ theorist ให้ไว้ (จุดใหญ่ = โอกาสสูงกว่า)
 * ใช้ข้อมูลที่มีอยู่แล้วในระบบล้วนๆ ไม่ต้องแก้ agent ให้ output อะไรเพิ่ม
 */
export default function ScenarioLadder({
  currentPrice,
  currency,
  bear,
  base,
  bull,
  showTrack = true,
}: {
  currentPrice: number;
  currency: string;
  bear?: ScenarioPoint;
  base?: ScenarioPoint;
  bull?: ScenarioPoint;
  /** false = โชว์แค่ตัวเลข 3 ช่อง ไม่มีเส้น/จุดตำแหน่ง — กันตีความผิดว่า "ราคาใกล้ bear = ราคาถูก"
   *  ทั้งที่จริงคือ position บนเส้นไม่ได้บอกความน่าจะเป็นแบบถ่วงน้ำหนัก ใช้ในหน้าที่ไม่มีข้อมูล probability
   *  ประกอบ (เช่น best-price ที่เป็นตัวเลขเฉลี่ยข้ามหลายทฤษฎี ไม่ใช่ทฤษฎีเดียวที่มีเหตุผลกำกับข้างๆ) */
  showTrack?: boolean;
}) {
  if (bear?.target == null || base?.target == null || bull?.target == null) return null;

  const lo = Math.min(bear.target, currentPrice);
  const hi = Math.max(bull.target, currentPrice);
  const span = hi - lo || 1;
  const at = (v: number) => ((v - lo) / span) * 100;
  const dotSize = (p?: number) => 9 + Math.round((p ?? 0.33) * 16); // 9-25px ตาม probability
  const upsidePct = (target: number) => ((target - currentPrice) / currentPrice) * 100;
  const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`;
  const fmtPrice = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 });

  const points: { key: "bear" | "base" | "bull"; label: string; sc: ScenarioPoint }[] = [
    { key: "bear", label: "BEAR", sc: bear },
    { key: "base", label: "BASE", sc: base },
    { key: "bull", label: "BULL", sc: bull },
  ];

  return (
    <div className="ladder">
      {showTrack && (
        <div className="ladder-track">
          <div
            className="ladder-zone down"
            style={{ left: `${at(bear.target)}%`, width: `${Math.max(0, at(base.target) - at(bear.target))}%` }}
          />
          <div
            className="ladder-zone up"
            style={{ left: `${at(base.target)}%`, width: `${Math.max(0, at(bull.target) - at(base.target))}%` }}
          />
          <div className="ladder-price" style={{ left: `${at(currentPrice)}%` }} />
          {points.map((p) => (
            <div
              key={p.key}
              className={`ladder-dot ${p.key}`}
              style={{
                left: `${at(p.sc.target!)}%`,
                width: dotSize(p.sc.probability),
                height: dotSize(p.sc.probability),
              }}
              title={p.sc.probability != null ? `${p.label}: โอกาส ${(p.sc.probability * 100).toFixed(0)}%` : p.label}
            />
          ))}
        </div>
      )}
      <div className={`ladder-legend${showTrack ? "" : " no-track"}`}>
        {points.map((p) => (
          <div key={p.key} className={`ladder-item ${p.key}`}>
            <span className="ladder-k">{p.label}</span>
            <span className="ladder-v">
              {fmtPrice(p.sc.target!)} {currency}
            </span>
            <span className="ladder-sub">
              {fmtPct(upsidePct(p.sc.target!))}
              {p.sc.probability != null && ` · โอกาส ${(p.sc.probability * 100).toFixed(0)}%`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
