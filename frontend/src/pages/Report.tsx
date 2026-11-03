import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import { API, downloadFile, errorMessage } from "../api";
import Navbar from "../components/Navbar";
import ReportChat from "../components/ReportChat";
import VulnGraph from "../components/VulnGraph";
import RiskGauge from "../components/RiskGauge";
import VulnCard from "../components/VulnCard";
import { ScanJob, SEV_LABELS, SEV_ORDER, Severity, Vulnerability } from "../types";

type View = "all" | Severity | "gas" | "graph";

export function ReportBanners({ job }: { job: ScanJob }) {
  const hp = job.honeypot_details;
  return (
    <>
      {job.analysis_mode === "bytecode" && (
        <div className="notice">
          ⚠ No verified source code — this report is based on <strong>bytecode analysis only</strong>. Static analysis and gas
          checks were skipped and findings carry lower confidence.
        </div>
      )}
      {job.analysis_mode === "abi_only" && (
        <div className="notice notice-red">
          ⚠ Neither verified source nor deployed bytecode was found at this address. Very little could be analysed.
        </div>
      )}
      {job.is_proxy && (
        <div className="notice notice-blue">
          ⧉ This address is a <strong>{job.proxy_type || "proxy"}</strong> contract. The implementation at{" "}
          <span className="mono">{job.implementation_address}</span> was analysed. Upgrades can change behaviour at any time —
          consider adding it to your watchlist.
        </div>
      )}
      {job.is_honeypot === true && hp?.red_flags && hp.red_flags.length > 0 && (
        <div className="notice notice-red">
          <strong>Honeypot indicators</strong> ({hp.simulation_status}):
          <ul style={{ margin: "6px 0 0 18px" }}>
            {hp.red_flags.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

export function GasList({ job }: { job: ScanJob }) {
  const gasIssues = job.gas_issues || [];
  const total = gasIssues.reduce((acc, g) => acc + (g.estimated_gas_saving || 0), 0);
  return (
    <>
      <div className="notice notice-blue">
        {gasIssues.length} optimization opportunities · estimated <strong>~{total.toLocaleString()} gas</strong> saved per
        affected call path (rough heuristic).
      </div>
      {gasIssues.map((g) => (
        <div key={g.id} className="vuln-card">
          <div className="vuln-card-header" style={{ cursor: "default" }}>
            <span className="sev-label" style={{ background: "rgba(0,230,168,0.1)", color: "#00e6a8" }}>GAS</span>
            <div className="vuln-title-text">{g.title}</div>
            {g.estimated_gas_saving ? (
              <span className="mono" style={{ color: "#00e6a8", fontSize: 13 }}>~{g.estimated_gas_saving} gas</span>
            ) : null}
          </div>
          <div className="vuln-card-body">
            {g.description && <p className="vuln-desc">{g.description}</p>}
            {g.file_path && (
              <p className="vuln-meta">📁 <span>{g.file_path}{g.line_numbers ? `:${g.line_numbers}` : ""}</span></p>
            )}
            {g.code_snippet && (
              <pre className="code-block"><code>{g.code_snippet}</code></pre>
            )}
          </div>
        </div>
      ))}
    </>
  );
}

function SharePanel({ job, onChange }: { job: ScanJob; onChange: (patch: Partial<ScanJob>) => void }) {
  const [label, setLabel] = useState(job.share_label || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const link = job.public_slug ? `${window.location.origin}/r/${job.public_slug}` : "";

  const save = async (isPublic: boolean) => {
    setBusy(true);
    setMsg("");
    try {
      const res = await axios.post(`${API}/api/scans/${job.id}/toggle-public/`, { is_public: isPublic, share_label: label });
      onChange(res.data);
      setMsg(res.data.is_public ? "Public link is live." : "Report is private.");
    } catch (err) {
      setMsg(errorMessage(err, "Failed to update sharing."));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setMsg("Link copied to clipboard.");
    } catch {
      setMsg(link);
    }
  };

  return (
    <div className="card" style={{ padding: 20, marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>🔗 Public sharing</h3>
          <div className="muted" style={{ fontSize: 13 }}>
            {job.is_public ? "Anyone with the link can view this report (read-only)." : "Only you can see this report."}
          </div>
        </div>
        <button className={`btn btn-sm ${job.is_public ? "btn-danger" : "btn-primary"}`} disabled={busy} onClick={() => save(!job.is_public)}>
          {job.is_public ? "Make private" : "Create public link"}
        </button>
      </div>
      <div className="toolbar" style={{ marginTop: 14, marginBottom: 0 }}>
        <input
          className="form-input"
          style={{ flex: "1 1 220px" }}
          maxLength={100}
          placeholder="Optional branding label (e.g. ACME Audits)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          aria-label="Share label"
        />
        {job.is_public && (
          <>
            <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => save(true)}>Save label</button>
            <button className="btn btn-secondary btn-sm" onClick={copy}>Copy link</button>
          </>
        )}
      </div>
      {job.is_public && link && <div className="mono muted" style={{ fontSize: 12, marginTop: 10, wordBreak: "break-all" }}>{link}</div>}
      {msg && <div className="success-text" style={{ marginTop: 8 }}>{msg}</div>}
    </div>
  );
}

export default function Report() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<ScanJob | null>(null);
  const [view, setView] = useState<View>("all");
  const [showDismissed, setShowDismissed] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    axios
      .get(`${API}/api/reports/${id}/`)
      .then((res) => setJob(res.data))
      .catch((err) => setError(errorMessage(err, "Could not load report.")))
      .finally(() => setLoading(false));
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
      <>
        <Navbar />
        <div className="error-state">
          <div className="error-icon">✖</div>
          <div className="error-msg">{error || "Report not found."}</div>
          <Link to="/" className="btn btn-primary" style={{ marginTop: "24px" }}>← New Scan</Link>
        </div>
      </>
    );

  const all = job.vulnerabilities ?? [];
  const vulns = all.filter((v) => !v.is_false_positive);
  const dismissed = all.filter((v) => v.is_false_positive);
  const counts = SEV_ORDER.reduce<Record<string, number>>((acc, s) => {
    acc[s] = vulns.filter((v) => v.severity === s).length;
    return acc;
  }, {});
  const pool = showDismissed ? all : vulns;
  const filtered = (view === "all" ? pool : pool.filter((v) => v.severity === view))
    .slice()
    .sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));
  const gasIssues = job.gas_issues || [];

  const toggleFalsePositive = async (v: Vulnerability) => {
    try {
      const res = await axios.patch(`${API}/api/vulnerabilities/${v.id}/`, { is_false_positive: !v.is_false_positive });
      setJob((j) =>
        j && {
          ...j,
          ...(res.data.job || {}),
          vulnerabilities: (j.vulnerabilities || []).map((x) => (x.id === v.id ? res.data.vulnerability : x)),
        }
      );
    } catch (err) {
      setExportError(errorMessage(err, "Failed to update finding."));
    }
  };

  const doExport = async (kind: "pdf" | "sarif" | "json") => {
    setExporting(kind);
    setExportError("");
    const url = kind === "pdf" ? `${API}/api/reports/${id}/pdf/` : `${API}/api/reports/${id}/export/${kind}/`;
    try {
      await downloadFile(url, `web3scan_${id}.${kind}`);
    } catch (err) {
      setExportError(errorMessage(err, `Failed to export ${kind.toUpperCase()}.`));
    } finally {
      setExporting(null);
    }
  };

  return (
    <>
      <Navbar />

      <div className="report-page">
        <div className="container">
          <div className="report-header">
            <div className="report-title-row">
              <h1 className="report-title">{job.contract_name || "AUDIT REPORT"}</h1>
              {job.is_honeypot === true && <span className="honeypot-badge">⚠ HONEYPOT</span>}
              {job.is_honeypot === false && <span className="safe-badge">✔ NOT HONEYPOT</span>}
              {job.is_public && <span className="swc-chip">PUBLIC</span>}
            </div>
            <div className="mono muted" style={{ fontSize: "12px", marginBottom: "20px", wordBreak: "break-all" }}>
              {job.address} · {job.network}
              {job.compiler_version && ` · solc ${job.compiler_version}`}
              {job.source_file_count && job.source_file_count > 1 ? ` · ${job.source_file_count} files` : ""}
              {job.created_at && ` · ${new Date(job.created_at).toLocaleString()}`}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {job.is_owner && (
                <button className="btn btn-outline btn-sm" onClick={() => setShowShare((s) => !s)} aria-expanded={showShare}>
                  🔗 Share
                </button>
              )}
              <button id="download-pdf-btn" className="btn btn-outline btn-sm" disabled={!!exporting} onClick={() => doExport("pdf")}>
                {exporting === "pdf" ? "Preparing…" : "↓ PDF"}
              </button>
              <button className="btn btn-outline btn-sm" disabled={!!exporting} onClick={() => doExport("sarif")} title="SARIF 2.1.0 — upload to GitHub Code Scanning">
                {exporting === "sarif" ? "Preparing…" : "↓ SARIF"}
              </button>
              <button className="btn btn-outline btn-sm" disabled={!!exporting} onClick={() => doExport("json")}>
                {exporting === "json" ? "Preparing…" : "↓ JSON"}
              </button>
              {job.address && (
                <Link to={`/diff?a=${job.id}`} className="btn btn-secondary btn-sm" title="Compare against another scan">
                  ⇄ Compare
                </Link>
              )}
            </div>
            {exportError && <div className="error-text" style={{ marginTop: 10 }}>{exportError}</div>}
          </div>

          {showShare && job.is_owner && <SharePanel job={job} onChange={(patch) => setJob((j) => j && { ...j, ...patch })} />}

          <ReportBanners job={job} />

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

          <div className="sev-counts">
            {SEV_ORDER.map((s) => (
              <button key={s} className={`sev-pill sev-${s}`} onClick={() => setView(s)} style={{ cursor: "pointer", border: view === s ? "1px solid currentColor" : undefined }}>
                <div className="pill-n">{counts[s]}</div>
                <div className="pill-t">{SEV_LABELS[s]}</div>
              </button>
            ))}
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

          {view !== "gas" && view !== "graph" && dismissed.length > 0 && (
            <label className="muted" style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 16, cursor: "pointer" }}>
              <input type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} />
              Show {dismissed.length} dismissed false positive{dismissed.length === 1 ? "" : "s"}
            </label>
          )}

          {view === "graph" ? (
            <div className="card" style={{ padding: 24, marginBottom: 28 }}>
              <h3 style={{ marginBottom: 16 }}>// CALL GRAPH & VULNERABLE PATHS</h3>
              {id && <VulnGraph jobId={id} />}
            </div>
          ) : view === "gas" ? (
            <GasList job={job} />
          ) : filtered.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "56px" }}>
              <div style={{ fontSize: "44px", marginBottom: "16px" }}>{view === "all" ? "✔" : "🔍"}</div>
              <p className="mono muted" style={{ fontSize: "13px" }}>
                {view === "all"
                  ? "// no vulnerabilities detected — contract appears clean"
                  : `// no ${SEV_LABELS[view]?.toLowerCase()} vulnerabilities found`}
              </p>
            </div>
          ) : (
            filtered.map((v) => (
              <VulnCard key={v.id} vuln={v} onToggleFalsePositive={job.is_owner ? toggleFalsePositive : undefined} />
            ))
          )}
        </div>
      </div>

      <footer className="footer">
        <p>
          <strong>Web3 Security Scanner</strong> — This report is for informational purposes only. Always conduct a manual audit before deployment.
        </p>
      </footer>

      <ReportChat jobId={job.id} />
    </>
  );
}
