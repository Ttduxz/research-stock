interface ChartData {
  unit?: string;
  revenue: number[];
  margin_pct?: number[];
  margin_label?: string;
}

/** กราฟแท่งรายได้ + เส้นมาร์จิ้น (SVG ล้วน ไม่ใช้ไลบรารี) */
export default function FinChart({
  years,
  chart,
}: {
  years: (string | number)[];
  chart: ChartData;
}) {
  const { revenue, margin_pct } = chart;
  if (!revenue?.length) return null;

  const W = 720;
  const top = 20;
  const bottom = 260;
  const left = 60;
  const right = 700;
  const H = bottom - top;
  const n = revenue.length;
  const slot = (right - left) / n;
  const barW = Math.min(56, slot * 0.45);

  const maxRev = Math.max(...revenue) * 1.15;
  const revY = (v: number) => bottom - (v / maxRev) * H;

  const maxMargin = margin_pct?.length ? Math.max(40, Math.max(...margin_pct) * 1.6) : 0;
  const mgY = (v: number) => bottom - (v / maxMargin) * H;

  const cx = (i: number) => left + slot * (i + 0.5);

  const gridLines = [0, 1 / 3, 2 / 3, 1].map((f) => bottom - f * H);
  const fmt = (v: number) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));

  return (
    <div className="chart-card">
      <div className="chart-scroll">
        <svg viewBox={`0 0 ${W} 320`} role="img" aria-label="กราฟรายได้และมาร์จิ้นย้อนหลัง">
          <g stroke="var(--border)" strokeWidth="1">
            {gridLines.map((y) => (
              <line key={y} x1={left} y1={y} x2={right} y2={y} />
            ))}
          </g>
          <g fontSize="11" fill="var(--text-dim)">
            {gridLines.map((y, i) => (
              <text key={y} x={left - 8} y={y + 4} textAnchor="end">
                {fmt((maxRev * i) / 3)}
              </text>
            ))}
            <text x={left - 8} y={292} textAnchor="end" fill="var(--accent)">
              {chart.unit ?? ""}
            </text>
          </g>

          <g fill="var(--accent)" opacity="0.35">
            {revenue.map((v, i) => (
              <rect
                key={i}
                x={cx(i) - barW / 2}
                y={revY(v)}
                width={barW}
                height={bottom - revY(v)}
                rx="2"
              />
            ))}
          </g>
          <g fontSize="12" fontWeight="600" fill="var(--text)" textAnchor="middle">
            {revenue.map((v, i) => (
              <text key={i} x={cx(i)} y={revY(v) - 8}>
                {fmt(v)}
              </text>
            ))}
          </g>

          {margin_pct && margin_pct.length === n && (
            <>
              <polyline
                points={margin_pct.map((v, i) => `${cx(i)},${mgY(v)}`).join(" ")}
                fill="none"
                stroke="var(--yellow)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <g fill="var(--bg-card)" stroke="var(--yellow)" strokeWidth="2.5">
                {margin_pct.map((v, i) => (
                  <circle key={i} cx={cx(i)} cy={mgY(v)} r="4" />
                ))}
              </g>
              <g fontSize="11.5" fontWeight="600" fill="var(--yellow)" textAnchor="middle">
                {margin_pct.map((v, i) => (
                  <text key={i} x={cx(i)} y={mgY(v) + 20}>
                    {v}%
                  </text>
                ))}
              </g>
            </>
          )}

          <g fontSize="13" fontWeight="600" fill="var(--text-dim)" textAnchor="middle">
            {years.map((y, i) => (
              <text key={i} x={cx(i)} y={284}>
                {y}
              </text>
            ))}
          </g>
        </svg>
      </div>
      <div className="legend">
        <span>
          <i className="swatch" /> รายได้ ({chart.unit ?? "หน่วยตามตาราง"})
        </span>
        {margin_pct && (
          <span>
            <i className="swatch line" /> {chart.margin_label ?? "Margin"}
          </span>
        )}
      </div>
    </div>
  );
}
