import React from "react";

const RISK_COLORS: Record<string, string> = {
  Critical: "#FF1A1A",
  High:     "#FF6B1A",
  Medium:   "#FFD700",
  Low:      "#00FF88",
  "N/A":    "#888888",
};

export default function RiskGauge({ score, level }: { score?: number; level?: string }) {
  const color = RISK_COLORS[level ?? ""] ?? "#888888";
  const pct = Math.min(100, score ?? 0);
  const r = 54, cx = 64, cy = 64;
  const circ = Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div className="gauge-wrapper">
      <svg className="gauge-svg" width="128" height="80" viewBox="0 0 128 80">
        <path
          d={`M ${cx - r},${cy} A ${r},${r} 0 0 1 ${cx + r},${cy}`}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d={`M ${cx - r},${cy} A ${r},${r} 0 0 1 ${cx + r},${cy}`}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: "stroke-dasharray 1s ease" }}
        />
      </svg>
      <div className="gauge-value" style={{ color }}>
        {score != null ? Math.round(score) : "—"}
      </div>
      <div className="gauge-label" style={{ color }}>
        / 100 · {level ?? "—"}
      </div>
    </div>
  );
}
