import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import ReportChat from "../components/ReportChat";
import VulnGraph from "../components/VulnGraph";

const API = import.meta.env.VITE_API_BASE_URL || "";

import { ScanJob, Severity, SEV_ORDER } from "../types";
import RiskGauge from "../components/RiskGauge";
import VulnCard from "../components/VulnCard";

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

  const gasIssues = job.gas_issues || [];

  return (
    <>
      <nav className="navbar">
        <a href="/" className="navbar-logo">

          WEB3<span className="logo-dot">.</span>SCANNER
        </a>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <Link
            to="/"
            className="btn btn-secondary"
            style={{ padding: "8px 18px", fontSize: "13px" }}
          >
            ← New Scan
          </Link>
          <Link to="/dashboard" style={{ color: "var(--text-1)", textDecoration: "none", fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>Dashboard</Link>
        </div>
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
            <div style={{ display: "flex", gap: 12 }}>
              <button
                className="btn btn-outline"
                style={{ fontSize: "13px", padding: "10px 20px" }}
                onClick={async () => {
                  try {
                    const res = await axios.post(`${API}/api/scans/${id}/toggle-public/`);
                    if (res.data.is_public) {
                      const url = `${window.location.origin}/r/${res.data.public_slug}`;
                      navigator.clipboard.writeText(url);
                      alert(`Public report link copied to clipboard!\n${url}`);
                    } else {
                      alert("Report is now private.");
                    }
                  } catch (err) {
                    alert("Failed to toggle public sharing.");
                  }
                }}
              >
                🔗 Share Report
              </button>
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
          </div>

          {/* Score + AI Summary */}
          <div className="card" style={{ marginBottom: "28px" }}>
            <div className="score-section">
              <RiskGauge score={job.risk_score} level={job.risk_level} />
              <div className="ai-summary">
                <h3>// AI ANALYSIS SUMMARY</h3>
                <p style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: "1.6" }}>
                  {job.ai_summary || "AI analysis was not available for this scan."}
                </p>
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

          {/* View Toggle */}
          <div className="filter-bar" style={{ marginBottom: 12 }}>
            <button className={`filter-btn ${filter === "all" && !job.graph_view ? "active" : ""}`} onClick={() => { setFilter("all"); }}>List View</button>
            <button className={`filter-btn ${filter === "graph" ? "active" : ""}`} onClick={() => setFilter("graph")}>Graph View</button>
          </div>

          {filter === "graph" ? (
             <div className="card" style={{ padding: 24, marginBottom: 28 }}>
                <h3 style={{ marginBottom: 16 }}>// CALL GRAPH & VULNERABLE PATHS</h3>
                {id && <VulnGraph jobId={id} />}
             </div>
          ) : (
            <>
              {/* Filter Bar */}
              <div className="filter-bar">
                {(["all", ...SEV_ORDER] as const).map((f) => (
                  <button
                    key={f}
                    className={`filter-btn ${filter === f ? "active" : ""}`}
                    onClick={() => setFilter(f)}
                  >
                    {f === "all" ? "All Findings" : SEV_LABELS[f]}
                    {f !== "all" && ` (${counts[f as Severity]})`}
                  </button>
                ))}
                {gasIssues.length > 0 && (
                  <button
                    className={`filter-btn ${filter === "gas" ? "active" : ""}`}
                    onClick={() => setFilter("gas")}
                  >
                    Gas Optimization ({gasIssues.length})
                  </button>
                )}
              </div>

          {/* Findings */}
          {filter === "gas" ? (
             gasIssues.map((g) => (
               <div key={g.id} className="vuln-card">
                 <div className="vuln-card-header">
                   <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                     <span className="vuln-severity" style={{ background: "rgba(0,230,168,0.1)", color: "#00e6a8" }}>GAS</span>
                     <h3 className="vuln-title" style={{ margin: 0 }}>{g.title}</h3>
                   </div>
                   {g.estimated_gas_saving ? (
                     <span style={{ color: "#00e6a8", fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>
                       ~{g.estimated_gas_saving} gas saved
                     </span>
                   ) : null}
                 </div>
                 {g.description && <p style={{ fontSize: 14, color: "var(--text-2)", marginBottom: 16 }}>{g.description}</p>}
                 {g.file_path && g.line_numbers && (
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "var(--text-3)", marginBottom: 8 }}>
                      Location: {g.file_path}:{g.line_numbers}
                    </div>
                 )}
                 {g.code_snippet && (
                    <pre style={{ background: "rgba(0,0,0,0.3)", padding: 12, borderRadius: 6, overflowX: "auto", border: "1px solid var(--border)", fontSize: 13, fontFamily: "'JetBrains Mono', monospace", color: "var(--text-2)" }}>
                      {g.code_snippet}
                    </pre>
                 )}
               </div>
             ))
          ) : filtered.length === 0 ? (
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
          </>
          )}
        </div>
      </div>

      <footer className="footer">
        <p>
          <strong>Web3 Security Scanner</strong> — This report is for informational purposes only. Always conduct a manual audit before deployment.
        </p>
      </footer>
      
      {/* Interactive Chat Panel */}
      <ReportChat jobId={job.id} />
    </>
  );
}
