import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import { API, downloadFile, errorMessage } from "../api";
import { Brand } from "../components/AppShell";
import Icon from "../components/Icon";
import RiskGauge from "../components/RiskGauge";
import VulnCard from "../components/VulnCard";
import VulnGraph from "../components/VulnGraph";
import { GasList, ReportBanners, SeveritySummary } from "./Report";
import { NETWORKS, ScanJob, SEV_LABELS, SEV_ORDER, Severity } from "../types";

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

  const bar = (
    <header className="public-bar">
      <Brand sub={job?.share_label ? `Shared by ${job.share_label}` : "Public report"} />
      <Link to="/" className="btn btn-secondary btn-sm">Scan your own contract</Link>
    </header>
  );

  if (loading)
    return (
      <div className="loading-center">
        <div className="spinner" />
        <p className="loading-text">Loading report…</p>
      </div>
    );
  if (error || !job)
    return (
      <>
        {bar}
        <div className="error-state">
          <div className="error-icon">!</div>
          <div className="error-msg">{error}</div>
        </div>
      </>
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
      {bar}
      <div className="report-page">
        <div className="container">
          <div className="page-header report-header">
            <div style={{ minWidth: 0 }}>
              <div className="report-title-row">
                <h1 className="report-title">{job.contract_name || "Untitled contract"}</h1>
                {job.is_honeypot === true && <span className="honeypot-badge"><Icon name="alert" size={13} /> Honeypot</span>}
                {job.is_honeypot === false && <span className="safe-badge"><Icon name="check" size={13} /> Not a honeypot</span>}
              </div>
              <div className="report-meta">
                <span className="mono">{job.address}</span>
                <span>{NETWORKS.find((n) => n.value === job.network)?.label ?? job.network}</span>
                {job.created_at && <span>Scanned {new Date(job.created_at).toLocaleDateString()}</span>}
              </div>
            </div>
            <div className="report-actions">
              <button className="btn btn-primary" onClick={() => doExport("pdf")}><Icon name="download" size={15} /> PDF</button>
              <button className="btn btn-outline" onClick={() => doExport("sarif")}>SARIF</button>
            </div>
          </div>
          {exportError && <div className="notice notice-red" role="alert"><div>{exportError}</div></div>}

          <ReportBanners job={job} />

          <div className="card score-section" style={{ marginBottom: 20 }}>
            <RiskGauge score={job.risk_score} level={job.risk_level} />
            <div className="ai-summary">
              <h3><Icon name="sparkles" size={15} /> AI summary</h3>
              <p style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{job.ai_summary || "AI analysis was not available for this scan."}</p>
            </div>
          </div>

          <SeveritySummary counts={counts} view={view} setView={setView} />

          <div className="filter-bar">
            <button className={`filter-btn ${view !== "gas" && view !== "graph" ? "active" : ""}`} onClick={() => setView("all")}>
              Findings <span className="filter-count">{vulns.length}</span>
            </button>
            {gasIssues.length > 0 && (
              <button className={`filter-btn ${view === "gas" ? "active" : ""}`} onClick={() => setView("gas")}>
                Gas <span className="filter-count">{gasIssues.length}</span>
              </button>
            )}
            <button className={`filter-btn ${view === "graph" ? "active" : ""}`} onClick={() => setView("graph")}>Call graph</button>
          </div>

          {view === "graph" ? (
            <div className="card"><VulnGraph jobId={job.id} /></div>
          ) : view === "gas" ? (
            <GasList job={job} />
          ) : filtered.length === 0 ? (
            <div className="card empty-state">
              <div className="empty-icon"><Icon name="shieldCheck" size={20} /></div>
              <h3>{view === "all" ? "No vulnerabilities detected" : `No ${SEV_LABELS[view]?.toLowerCase()} findings`}</h3>
            </div>
          ) : (
            <div className="findings">{filtered.map((v) => <VulnCard key={v.id} vuln={v} />)}</div>
          )}

          <p className="muted" style={{ fontSize: 12, marginTop: 24 }}>
            Shared via Web3 Scanner. Automated analysis is informational and not a substitute for a manual audit.
          </p>
        </div>
      </div>
    </>
  );
}
