import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";

const API = import.meta.env.VITE_API_BASE_URL || "";

const SEV_ORDER = ["critical", "high", "medium", "low", "informational"];
const RISK_COLORS = { Critical: "#ef4444", High: "#f97316", Medium: "#f59e0b", Low: "#10b981", "N/A": "#64748b" };

function RiskGauge({ score, level }) {
  const color = RISK_COLORS[level] || "#64748b";
  const pct = Math.min(100, score || 0);
  // SVG arc gauge
  const r = 54, cx = 64, cy = 64;
  const circ = Math.PI * r; // half circle
  const dash = (pct / 100) * circ;
  return (
    <div className="gauge-wrapper">
      <svg className="gauge-svg" width="128" height="80" viewBox="0 0 128 80">
        <path
          d={`M ${cx - r},${cy} A ${r},${r} 0 0 1 ${cx + r},${cy}`}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" strokeLinecap="round"
        />
        <path
          d={`M ${cx - r},${cy} A ${r},${r} 0 0 1 ${cx + r},${cy}`}
          fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: "stroke-dasharray 1s ease" }}
        />
      </svg>
      <div className="gauge-value" style={{ color }}>{score != null ? Math.round(score) : "—"}</div>
      <div className="gauge-label" style={{ color }}>/{" "}100 · {level || "—"}</div>
    </div>
  );
}

function VulnCard({ vuln }) {
  const [open, setOpen] = useState(false);
  const sev = vuln.severity || "informational";
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
          <p className="vuln-desc">{vuln.description}</p>
          {vuln.file_path && (
            <p className="vuln-meta">
              📁 <span>{vuln.file_path}</span>
              {vuln.line_numbers && <> · Line <span>{vuln.line_numbers}</span></>}
              · Confidence: <span>{vuln.confidence}</span>
            </p>
          )}
          {vuln.code_snippet && (
            <pre className="code-block"><code>{vuln.code_snippet}</code></pre>
          )}
          {vuln.remediation && (
            <div className="remediation-box">
              <div className="rem-label">✅ Remediation</div>
              <p>{vuln.remediation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Report() {
  const { id } = useParams();
  const [job, setJob] = useState(null);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    axios.get(`${API}/api/reports/${id}/`)
      .then((res) => { setJob(res.data); setLoading(false); })
      .catch(() => { setError("Could not load report."); setLoading(false); });
  }, [id]);

  if (loading) return (
    <div className="loading-center">
      <div className="spinner" />
      <p style={{ color: "var(--text-2)" }}>Loading report...</p>
    </div>
  );

  if (error) return (
    <div className="error-state">
      <div className="error-icon">❌</div>
      <div className="error-msg">{error}</div>
      <Link to="/" className="btn btn-primary" style={{ marginTop: "20px" }}>← New Scan</Link>
    </div>
  );

  const vulns = (job.vulnerabilities || []).filter((v) => !v.is_false_positive);
  const filtered = filter === "all" ? vulns : vulns.filter((v) => v.severity === filter);

  const counts = SEV_ORDER.reduce((acc, s) => {
    acc[s] = vulns.filter((v) => v.severity === s).length;
    return acc;
  }, {});

  const SEV_LABELS = { critical: "Critical", high: "High", medium: "Medium", low: "Low", informational: "Info" };

  return (
    <>
      <nav className="navbar">
        <a href="/" className="navbar-logo">
          <div className="logo-icon">🛡️</div>
          Web3Scanner
        </a>
        <Link to="/" className="btn btn-secondary" style={{ padding: "8px 16px", fontSize: "13px" }}>
          ← New Scan
        </Link>
      </nav>

      <div className="report-page">
        <div className="container">
          {/* Header */}
          <div className="report-header">
            <div className="report-title-row">
              <h1 className="report-title">
                {job.contract_name || "Audit Report"}
              </h1>
              {job.is_honeypot === true && <span className="honeypot-badge">⚠️ HONEYPOT</span>}
              {job.is_honeypot === false && <span className="safe-badge">✅ Not Honeypot</span>}
            </div>
            <div style={{ fontFamily: "Fira Code, monospace", fontSize: "13px", color: "var(--text-3)", marginBottom: "8px" }}>
              {job.address} · {job.network} · {job.compiler_version && `solc ${job.compiler_version}`}
            </div>
            <a
              id="download-pdf-btn"
              href={`${API}/api/reports/${id}/pdf/`}
              className="btn btn-outline"
              style={{ fontSize: "13px", padding: "8px 18px" }}
              target="_blank"
              rel="noreferrer"
            >
              ↓ Download PDF Report
            </a>
          </div>

          {/* Score + AI Summary */}
          <div className="card" style={{ marginBottom: "24px" }}>
            <div className="score-section">
              <RiskGauge score={job.risk_score} level={job.risk_level} />
              <div className="ai-summary">
                <h3>🤖 AI Analysis Summary</h3>
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
            {["all", ...SEV_ORDER].map((f) => (
              <button
                key={f}
                className={`filter-btn ${filter === f ? "active" : ""}`}
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "All" : SEV_LABELS[f]}
                {f !== "all" && ` (${counts[f]})`}
              </button>
            ))}
          </div>

          {/* Vulnerabilities */}
          {filtered.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "48px" }}>
              <div style={{ fontSize: "40px", marginBottom: "12px" }}>
                {filter === "all" ? "✅" : "🔍"}
              </div>
              <p style={{ color: "var(--text-2)" }}>
                {filter === "all"
                  ? "No vulnerabilities detected. This contract appears clean."
                  : `No ${SEV_LABELS[filter]} vulnerabilities found.`}
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
        <p>Web3 Security Scanner — This report is for informational purposes only. Always conduct a manual audit before deployment.</p>
      </footer>
    </>
  );
}
