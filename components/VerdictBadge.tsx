const LABELS: Record<string, string> = {
  bullish: "▲ Bullish",
  neutral: "– Neutral",
  bearish: "▼ Bearish",
};

export default function VerdictBadge({ verdict }: { verdict: string | null }) {
  if (!verdict) return null;
  const cls = ["bullish", "neutral", "bearish"].includes(verdict) ? verdict : "neutral";
  return <span className={`badge ${cls}`}>{LABELS[cls] ?? verdict}</span>;
}
