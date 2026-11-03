import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import { API, downloadFile, errorMessage } from "../api";
import Navbar from "../components/Navbar";
import RiskGauge from "../components/RiskGauge";
import VulnCard from "../components/VulnCard";
import VulnGraph from "../components/VulnGraph";
import { GasList, ReportBanners } from "./Report";
import { ScanJob, SEV_LABELS, SEV_ORDER, Severity } from "../types";

type View = "all" | Severity | "gas" | "graph";

export default function PublicReport() {
  const { slug } = useParams<{ slug: string }>();
  const [job, setJob] = useState<ScanJob | null>(null);
  const [view, setView] = useState<View>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exportError, setExportError] = useState("");

  useEffect(() => {
    axios
      .get(`${API}/api/r/${slug}/`)
      .then((res) => setJob(res.data))
      .catch(() => setError("This public report does not exist or has been made private."))
      .finally(() => setLoading(false));
  }, [slug]);

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
        <div className="error-msg">{error}</div>
        <Link to="/" className="btn btn-primary" style={{ marginTop: 24 }}>Scan your own contract →</Link>
      </div>
    );

  const vulns = (job.vulnerabilities ?? []).filter((v) => !v.is_false_positive);
  const counts = SEV_ORDER.reduce<Record<string, number>>((acc, s) => {
    acc[s] = vulns.filter((v) => v.severity === s).length;
    return acc;
  }, {});
  const filtered = (view === "all" ? vulns : vulns.filter((v) => v.severity === view))
    .slice()
    .sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));
  const gasIssues = job.gas_issues || [];

  const doExport = async (kind: "pdf" | "sarif") => {
    setExportError("");
    const url = kind === "pdf" ? `${API}/api/reports/${job.id}/pdf/` : `${API}/api/reports/${job.id}/export/sarif/`;
    try {
      await downloadFile(url, `report.${kind}`);
    } catch (err) {
      setExportError(errorMessage(err, "Export failed."));
    }
  };

  return (
    <>
      <Navbar brand={job.share_label || undefined} badge="PUBLIC REPORT" />

      <div className="report-page">
        <div className="container">
          <div className="report-header">
            <div className="report-title-row">
              <h1 className="report-title">{job.contract_name || "AUDIT REPORT"}</h1>
              {job.is_honeypot === true && <span className="honeypot-badge">⚠ HONEYPOT</span>}
              {job.is_honeypot === false && <span className="safe-badge">✔ NOT HONEYPOT</span>}
            </div>
            <div className="mono muted" style={{ fontSize: "12px", marginBottom: 16, wordBreak: "break-all" }}>
              {job.address} · {job.network}
              {job.created_at && ` · scanned ${new Date(job.created_at).toLocaleDateString()}`}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn btn-outline btn-sm" onClick={() => doExport("pdf")}>↓ PDF</button>
              <button className="btn btn-outline btn-sm" onClick={() => doExport("sarif")}>↓ SARIF</button>
            </div>
            {exportError && <div className="error-text" style={{ marginTop: 10 }}>{exportError}</div>}
          </div>

          <ReportBanners job={job} />

          <div className="card" style={{ marginBottom: "28px" }}>
            <div className="score-section">
              <RiskGauge score={job.risk_score} level={job.risk_level} />
              <div className="ai-summary">
                <h3>// AI ANALYSIS SUMMARY</h3>
                <p style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.6 }}>
                  {job.ai_summary || "AI analysis was not available for this scan."}
                </p>
              </div>
            </div>
          </div>

          <div className="filter-bar">
            {(["all", ...SEV_ORDER] as const).map((f) => (
              <button key={f} className={`filter-btn ${view === f ? "active" : ""}`} onClick={() => setView(f)}>
                {f === "all" ? `All Findings (${vulns.length})` : `${SEV_LABELS[f]} (${counts[f]})`}
              </button>
            ))}
            {gasIssues.length > 0 && (
              <button className={`filter-btn ${view === "gas" ? "active" : ""}`} onClick={() => setView("gas")}>
                ⛽ Gas ({gasIssues.length})
              </button>
            )}
            <button className={`filter-btn ${view === "graph" ? "active" : ""}`} onClick={() => setView("graph")}>
              ◎ Call Graph
            </button>
          </div>

          {view === "graph" ? (
            <div className="card" style={{ padding: 24, marginBottom: 28 }}>
              <h3 style={{ marginBottom: 16 }}>// CALL GRAPH</h3>
              <VulnGraph jobId={job.id} />
            </div>
          ) : view === "gas" ? (
            <GasList job={job} />
          ) : filtered.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "56px" }}>
              <p className="mono muted" style={{ fontSize: "13px" }}>// no vulnerabilities in this category</p>
            </div>
          ) : (
            filtered.map((v) => <VulnCard key={v.id} vuln={v} />)
          )}
        </div>
      </div>

      <footer className="footer">
        <p>
          Shared via <Link to="/" style={{ color: "var(--text-2)" }}><strong>Web3 Security Scanner</strong></Link> — automated analysis,
          not a substitute for a manual audit.
        </p>
      </footer>
    </>
  );
}
