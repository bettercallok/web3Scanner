import React from "react";
import { RISK_COLORS } from "../types";

export default function RiskGauge({ score, level }: { score?: number | null; level?: string }) {
  const color = RISK_COLORS[level ?? ""] ?? "var(--text-3)";
  const pct = Math.max(0, Math.min(100, score ?? 0));
  const size = 132;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;

  return (
    <div className="gauge-wrapper" role="img" aria-label={`Risk score ${score != null ? Math.round(score) : "unknown"} out of 100, ${level || "unscored"}`}>
      <div className="gauge-ring">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * circ} ${circ}`}
            style={{ transition: "stroke-dasharray 0.8s ease" }}
          />
        </svg>
        <div className="gauge-center">
          <span className="gauge-value" style={{ color }}>{score != null ? Math.round(score) : "—"}</span>
          <span className="gauge-of">of 100</span>
        </div>
      </div>
      <div className="gauge-label" style={{ color }}>{level ? `${level} risk` : "Not scored"}</div>
    </div>
  );
}
