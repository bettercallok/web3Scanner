import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";

const API = import.meta.env.VITE_API_BASE_URL || "";

const SEV_ORDER = ["critical", "high", "medium", "low", "informational"] as const;
type Severity = typeof SEV_ORDER[number];

const RISK_COLORS: Record<string, string> = {
  Critical: "#FF1A1A",
  High:     "#FF6B1A",
  Medium:   "#FFD700",
  Low:      "#00FF88",
  "N/A":    "#888888",
};

interface Vulnerability {
  id: string;
  title: string;
  severity: Severity;
  description?: string;
  file_path?: string;
  line_numbers?: string | number;
  confidence?: string;
  code_snippet?: string;
  remediation?: string;
  swc_id?: string;
  tool?: string;
  is_false_positive?: boolean;
  poc_code?: string;
}

interface ScanJob {
  contract_name?: string;
  address?: string;
  network?: string;
  compiler_version?: string;
  risk_score?: number;
  risk_level?: string;
  ai_summary?: string;
  is_honeypot?: boolean;
  vulnerabilities?: Vulnerability[];
}

/* ─── Risk Gauge ─────────────────────────────────────────────── */
function RiskGauge({ score, level }: { score?: number; level?: string }) {
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

/* ─── Vuln Card ──────────────────────────────────────────────── */
function VulnCard({ vuln }: { vuln: Vulnerability }) {
  const [open, setOpen] = useState<boolean>(false);
  const sev = vuln.severity ?? "informational";

  return (
    <div className="vuln-card">
      <div className="vuln-card-header" onClick={() => setOpen((o) => !o)}>
        <div className={`sev-dot dot-${sev}`} />
        <div className={`sev-label label-${sev}`}>{sev}</div>
        <div className="vuln-title-text">{vuln.title}</div>
        {vuln.swc_id && <div className="swc-chip">{vuln.swc_id}</div>}
        <div className="tool-chip">{vuln.tool}</div>
        <span className={`chevron ${open ? "open" : ""}`}>▼</span>
      </div>
      {open && (
        <div className="vuln-card-body">
          {vuln.description && <p className="vuln-desc">{vuln.description}</p>}
          {vuln.file_path && (
            <p className="vuln-meta">
              📁 <span>{vuln.file_path}</span>
              {vuln.line_numbers && (
                <>
                  {" · "}Line <span>{vuln.line_numbers}</span>
                </>
              )}
              {vuln.confidence && (
                <>
                  {" · "}Confidence: <span>{vuln.confidence}</span>
                </>
              )}
            </p>
          )}
          {vuln.code_snippet && (
            <pre className="code-block">
              <code>{vuln.code_snippet}</code>
            </pre>
          )}
          {vuln.remediation && (
            <div className="remediation-box">
              <div className="rem-label">✔ Remediation</div>
              <p>{vuln.remediation}</p>
            </div>
          )}
          {vuln.poc_code && (
            <div className="poc-box" style={{ marginTop: 16, background: "#1a1a1a", border: "1px solid #333", borderRadius: 6, padding: 16 }}>
              <div className="poc-label" style={{ color: "#ff6b1a", fontSize: 12, fontWeight: "bold", marginBottom: 8, fontFamily: "'JetBrains Mono', monospace" }}>
                🧪 AUTO-GENERATED FOUNDRY POC
              </div>
              <pre className="code-block" style={{ margin: 0, padding: 12, background: "#0d0d0d", borderRadius: 4 }}>
                <code>{vuln.poc_code}</code>
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Report Page ────────────────────────────────────────────── */
const SEV_LABELS: Record<string, string> = {
  critical:      "Critical",
  high:          "High",
  medium:        "Medium",
  low:           "Low",
  informational: "Info",
};

export default function Report() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<ScanJob | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    axios
      .get(`${API}/api/reports/${id}/`)
      .then((res) => {
        setJob(res.data);
        setLoading(false);
      })
      .catch(() => {
        setError("Could not load report.");
        setLoading(false);
      });
  }, [id]);

  if (loading)
    return (
      <div className="loading-center">
        <div className="spinner" />
        <p className="loading-text">// loading report...</p>
      </div>
    );

  if (error || !job)
    return (
      <div className="error-state">
        <div className="error-icon">✖</div>
        <div className="error-msg">{error || "Report not found."}</div>
        <Link to="/" className="btn btn-primary" style={{ marginTop: "24px" }}>
          ← New Scan
        </Link>
      </div>
    );

  const vulns = (job.vulnerabilities ?? []).filter((v) => !v.is_false_positive);
  const filtered = filter === "all" ? vulns : vulns.filter((v) => v.severity === filter);

  const counts = SEV_ORDER.reduce<Record<string, number>>((acc, s) => {
    acc[s] = vulns.filter((v) => v.severity === s).length;
    return acc;
  }, {});

  return (
    <>
      <nav className="navbar">
        <a href="/" className="navbar-logo">
          <div className="logo-icon">🛡️</div>
          WEB3<span className="logo-dot">.</span>SCANNER
        </a>
        <Link
          to="/"
          className="btn btn-secondary"
          style={{ padding: "8px 18px", fontSize: "13px" }}
        >
          ← New Scan
        </Link>
      </nav>

      <div className="report-page">
        <div className="container">
          {/* Header */}
          <div className="report-header">
            <div className="report-title-row">
              <h1 className="report-title">{job.contract_name || "AUDIT REPORT"}</h1>
              {job.is_honeypot === true && <span className="honeypot-badge">⚠ HONEYPOT</span>}
              {job.is_honeypot === false && <span className="safe-badge">✔ NOT HONEYPOT</span>}
            </div>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "12px",
                color: "var(--text-3)",
                marginBottom: "20px",
              }}
            >
              {job.address} · {job.network}
              {job.compiler_version && ` · solc ${job.compiler_version}`}
            </div>
            <a
              id="download-pdf-btn"
              href={`${API}/api/reports/${id}/pdf/`}
              className="btn btn-outline"
              style={{ fontSize: "13px", padding: "10px 20px" }}
              target="_blank"
              rel="noreferrer"
            >
              ↓ Download PDF Report
            </a>
          </div>

          {/* Score + AI Summary */}
          <div className="card" style={{ marginBottom: "28px" }}>
            <div className="score-section">
              <RiskGauge score={job.risk_score} level={job.risk_level} />
              <div className="ai-summary">
                <h3>// AI ANALYSIS SUMMARY</h3>
                <p>{job.ai_summary || "AI analysis was not available for this scan."}</p>
              </div>
            </div>
          </div>

          {/* Severity Counts */}
          <div className="sev-counts">
            {SEV_ORDER.map((s) => (
              <div key={s} className={`sev-pill sev-${s}`}>
                <div className="pill-n">{counts[s]}</div>
                <div className="pill-t">{SEV_LABELS[s]}</div>
              </div>
            ))}
          </div>

          {/* Filter Bar */}
          <div className="filter-bar">
            {(["all", ...SEV_ORDER] as const).map((f) => (
              <button
                key={f}
                className={`filter-btn ${filter === f ? "active" : ""}`}
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "All" : SEV_LABELS[f]}
                {f !== "all" && ` (${counts[f as Severity]})`}
              </button>
            ))}
          </div>

          {/* Vulnerabilities */}
          {filtered.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "56px" }}>
              <div style={{ fontSize: "44px", marginBottom: "16px" }}>
                {filter === "all" ? "✔" : "🔍"}
              </div>
              <p style={{ color: "var(--text-3)", fontFamily: "'JetBrains Mono', monospace", fontSize: "13px" }}>
                {filter === "all"
                  ? "// no vulnerabilities detected — contract appears clean"
                  : `// no ${SEV_LABELS[filter]?.toLowerCase()} vulnerabilities found`}
              </p>
            </div>
          ) : (
            filtered
              .sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity))
              .map((v) => <VulnCard key={v.id} vuln={v} />)
          )}
        </div>
      </div>

      <footer className="footer">
        <p>
          <strong>Web3 Security Scanner</strong> — This report is for informational purposes only. Always conduct a manual audit before deployment.
        </p>
      </footer>
    </>
  );
}
