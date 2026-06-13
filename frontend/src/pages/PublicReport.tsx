import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { ScanJob } from "../types";
import RiskGauge from "../components/RiskGauge";
import VulnCard from "../components/VulnCard";
import VulnGraph from "../components/VulnGraph";

const API = import.meta.env.VITE_API_BASE_URL || "";

const SEV_ORDER = ["critical", "high", "medium", "low", "informational"] as const;
type Severity = typeof SEV_ORDER[number];

const SEV_LABELS: Record<string, string> = {
  critical:      "Critical",
  high:          "High",
  medium:        "Medium",
  low:           "Low",
  informational: "Info",
};

export default function PublicReport() {
  const { slug } = useParams<{ slug: string }>();
  const [job, setJob] = useState<ScanJob | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    axios.get(`${API}/api/r/${slug}/`)
      .then(res => {
        setJob(res.data);
        setLoading(false);
      })
      .catch(() => {
        setError("This public report does not exist or has been made private.");
        setLoading(false);
      });
  }, [slug]);

  if (loading) return <div className="loading-center"><div className="spinner" /><p className="loading-text">// loading report...</p></div>;
  if (error || !job) return <div className="error-state"><div className="error-icon">✖</div><div className="error-msg">{error}</div></div>;

  const vulns = (job.vulnerabilities ?? []).filter((v) => !v.is_false_positive);
  const filtered = filter === "all" ? vulns : filter === "graph" ? [] : vulns.filter((v) => v.severity === filter);

  const counts = SEV_ORDER.reduce<Record<string, number>>((acc, s) => {
    acc[s] = vulns.filter((v) => v.severity === s).length;
    return acc;
  }, {});

  return (
    <>
      <nav className="navbar">
        <a href="/" className="navbar-logo">

          {job.share_label || "WEB3.SCANNER"}
        </a>
      </nav>

      <div className="report-page">
        <div className="container">
          <div className="report-header">
            <h1 className="report-title">{job.contract_name || "AUDIT REPORT"}</h1>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: "var(--text-3)" }}>
              {job.address} · {job.network}
            </div>
          </div>

          <div className="card" style={{ marginBottom: "28px" }}>
            <div className="score-section">
              <RiskGauge score={job.risk_score} level={job.risk_level} />
              <div className="ai-summary">
                <h3>// AI ANALYSIS SUMMARY</h3>
                <p>{job.ai_summary || "AI analysis was not available for this scan."}</p>
              </div>
            </div>
          </div>

          <div className="filter-bar" style={{ marginBottom: 12 }}>
            <button className={`filter-btn ${filter !== "graph" ? "active" : ""}`} onClick={() => setFilter("all")}>List View</button>
            <button className={`filter-btn ${filter === "graph" ? "active" : ""}`} onClick={() => setFilter("graph")}>Graph View</button>
          </div>

          {filter === "graph" ? (
             <div className="card" style={{ padding: 24, marginBottom: 28 }}>
                <h3 style={{ marginBottom: 16 }}>// CALL GRAPH</h3>
                {job.id && <VulnGraph jobId={job.id} />}
             </div>
          ) : (
            <>
              <div className="filter-bar">
                {(["all", ...SEV_ORDER] as const).map((f) => (
                  <button key={f} className={`filter-btn ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
                    {f === "all" ? "All Findings" : SEV_LABELS[f]}
                    {f !== "all" && ` (${counts[f as Severity]})`}
                  </button>
                ))}
              </div>

              {filtered.length === 0 ? (
                <div className="card" style={{ textAlign: "center", padding: "56px" }}>
                  <p style={{ color: "var(--text-3)", fontFamily: "'JetBrains Mono', monospace", fontSize: "13px" }}>
                    // no vulnerabilities detected
                  </p>
                </div>
              ) : (
                filtered.sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity)).map((v) => <VulnCard key={v.id} vuln={v} />)
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
