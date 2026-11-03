import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import { API, downloadFile, errorMessage } from "../api";
import Icon from "../components/Icon";
import ReportChat from "../components/ReportChat";
import VulnGraph from "../components/VulnGraph";
import RiskGauge from "../components/RiskGauge";
import VulnCard from "../components/VulnCard";
import { NETWORKS, ScanJob, SEV_LABELS, SEV_ORDER, Severity, Vulnerability } from "../types";

type View = "all" | Severity | "gas" | "graph";

export function ReportBanners({ job }: { job: ScanJob }) {
  const hp = job.honeypot_details;
  return (
    <>
      {job.analysis_mode === "bytecode" && (
        <div className="notice">
          <div>
            <strong>Bytecode-only analysis.</strong> No verified source was found, so static analysis and gas checks were
            skipped and findings carry lower confidence.
          </div>
        </div>
      )}
      {job.analysis_mode === "abi_only" && (
        <div className="notice notice-red">
          <div>
            <strong>Nothing to analyse.</strong> Neither verified source nor deployed bytecode was found at this address.
          </div>
        </div>
      )}
      {job.is_proxy && (
        <div className="notice notice-blue">
          <div>
            <strong>{job.proxy_type ? `${job.proxy_type.toUpperCase()} proxy.` : "Proxy contract."}</strong> The implementation at{" "}
            <span className="mono">{job.implementation_address}</span> was analysed. Upgrades can change behaviour at any time —
            consider adding it to your watchlist.
          </div>
        </div>
      )}
      {job.is_honeypot === true && hp?.red_flags && hp.red_flags.length > 0 && (
        <div className="notice notice-red">
          <div>
            <strong>Honeypot indicators</strong> <span className="muted">({hp.simulation_status})</span>
            <ul>
              {hp.red_flags.map((f) => <li key={f}>{f}</li>)}
            </ul>
          </div>
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
      <p className="muted" style={{ marginBottom: 12 }}>
        {gasIssues.length} optimisation opportunit{gasIssues.length === 1 ? "y" : "ies"} · roughly{" "}
        <strong style={{ color: "var(--text-1)" }}>{total.toLocaleString()} gas</strong> saved across affected call paths.
      </p>
      <div className="findings">
        {gasIssues.map((g) => (
          <div key={g.id} className="vuln-card">
            <div className="vuln-card-header" style={{ cursor: "default" }}>
              <Icon name="gas" size={16} />
              <div className="vuln-title-text">{g.title}</div>
              {g.estimated_gas_saving ? <span className="gas-saving">~{g.estimated_gas_saving} gas</span> : null}
            </div>
            <div className="vuln-card-body">
              {g.description && <p className="vuln-desc">{g.description}</p>}
              {g.file_path && (
                <p className="vuln-meta"><Icon name="file" size={13} /> <span>{g.file_path}{g.line_numbers ? `:${g.line_numbers}` : ""}</span></p>
              )}
              {g.code_snippet && <pre className="code-block"><code>{g.code_snippet}</code></pre>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function SeveritySummary({ counts, view, setView }: { counts: Record<string, number>; view: View; setView: (v: View) => void }) {
  return (
    <div className="sev-counts">
      {SEV_ORDER.map((s) => (
        <button
          key={s}
          className={`sev-pill sev-${s} ${view === s ? "is-active" : ""}`}
          onClick={() => setView(view === s ? "all" : s)}
          aria-pressed={view === s}
        >
          <span className="pill-n">{counts[s]}</span>
          <span className="pill-t">{SEV_LABELS[s]}</span>
        </button>
      ))}
    </div>
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
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header">
        <div>
          <div className="card-title">Public sharing</div>
          <div className="card-sub">
            {job.is_public ? "Anyone with the link can view a read-only copy of this report." : "Only you can see this report."}
          </div>
        </div>
        <button className={`btn btn-sm ${job.is_public ? "btn-danger" : "btn-primary"}`} disabled={busy} onClick={() => save(!job.is_public)}>
          {job.is_public ? "Make private" : "Create public link"}
        </button>
      </div>
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <input
          className="form-input"
          style={{ flex: "1 1 220px" }}
          maxLength={100}
          placeholder="Optional branding label, e.g. ACME Audits"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          aria-label="Share label"
        />
        {job.is_public && (
          <>
            <button className="btn btn-secondary" disabled={busy} onClick={() => save(true)}>Save label</button>
            <button className="btn btn-secondary" onClick={copy}><Icon name="copy" size={15} /> Copy link</button>
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
        <p className="loading-text">Loading report…</p>
      </div>
    );

  if (error || !job)
    return (
      <div className="error-state">
        <div className="error-icon">!</div>
        <div className="error-msg">{error || "Report not found."}</div>
        <Link to="/dashboard" className="btn btn-primary" style={{ marginTop: 20 }}>Back to scans</Link>
      </div>
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
  const networkLabel = NETWORKS.find((n) => n.value === job.network)?.label ?? job.network;

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
    <div className="report-page">
      <div className="container">
        <div className="breadcrumb">
          <Link to="/dashboard">Scans</Link> <span>/</span> <span>{job.contract_name || "Report"}</span>
        </div>

        <div className="page-header report-header">
          <div style={{ minWidth: 0 }}>
            <div className="report-title-row">
              <h1 className="report-title">{job.contract_name || "Untitled contract"}</h1>
              {job.is_honeypot === true && <span className="honeypot-badge"><Icon name="alert" size={13} /> Honeypot</span>}
              {job.is_honeypot === false && <span className="safe-badge"><Icon name="check" size={13} /> Not a honeypot</span>}
              {job.is_public && <span className="status-chip plain"><Icon name="share" size={12} /> Public</span>}
            </div>
            <div className="report-meta">
              <span className="mono">{job.address}</span>
              <span>{networkLabel}</span>
              {job.compiler_version && <span>solc {job.compiler_version}</span>}
              {job.source_file_count && job.source_file_count > 1 ? <span>{job.source_file_count} files</span> : null}
              {job.created_at && <span>{new Date(job.created_at).toLocaleString()}</span>}
            </div>
          </div>
          <div className="report-actions">
            {job.is_owner && (
              <button className="btn btn-secondary" onClick={() => setShowShare((s) => !s)} aria-expanded={showShare}>
                <Icon name="share" size={15} /> Share
              </button>
            )}
            <Link to={`/diff?a=${job.id}`} className="btn btn-secondary"><Icon name="compare" size={15} /> Compare</Link>
            <button id="download-pdf-btn" className="btn btn-primary" disabled={!!exporting} onClick={() => doExport("pdf")}>
              <Icon name="download" size={15} /> {exporting === "pdf" ? "Preparing…" : "PDF"}
            </button>
            <button className="btn btn-outline" disabled={!!exporting} onClick={() => doExport("sarif")} title="SARIF 2.1.0 — upload to GitHub Code Scanning">
              {exporting === "sarif" ? "Preparing…" : "SARIF"}
            </button>
            <button className="btn btn-outline" disabled={!!exporting} onClick={() => doExport("json")}>
              {exporting === "json" ? "Preparing…" : "JSON"}
            </button>
          </div>
        </div>
        {exportError && <div className="notice notice-red" role="alert"><div>{exportError}</div></div>}

        {showShare && job.is_owner && <SharePanel job={job} onChange={(patch) => setJob((j) => j && { ...j, ...patch })} />}

        <ReportBanners job={job} />

        <div className="card score-section" style={{ marginBottom: 20 }}>
          <RiskGauge score={job.risk_score} level={job.risk_level} />
          <div className="ai-summary">
            <h3><Icon name="sparkles" size={15} /> AI summary</h3>
            <p style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {job.ai_summary || "AI analysis was not available for this scan."}
            </p>
          </div>
        </div>

        <SeveritySummary counts={counts} view={view} setView={setView} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div className="filter-bar" role="tablist">
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
          {view !== "gas" && view !== "graph" && dismissed.length > 0 && (
            <label className="muted" style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer", marginBottom: 16 }}>
              <input type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} />
              Show {dismissed.length} dismissed
            </label>
          )}
        </div>

        {view === "graph" ? (
          <div className="card">{id && <VulnGraph jobId={id} />}</div>
        ) : view === "gas" ? (
          <GasList job={job} />
        ) : filtered.length === 0 ? (
          <div className="card empty-state">
            <div className="empty-icon"><Icon name="shieldCheck" size={20} /></div>
            <h3>{view === "all" ? "No vulnerabilities detected" : `No ${SEV_LABELS[view]?.toLowerCase()} findings`}</h3>
            <p>{view === "all" ? "Automated tools found no issues. A manual review is still recommended." : "Try another severity."}</p>
          </div>
        ) : (
          <div className="findings">
            {filtered.map((v) => (
              <VulnCard key={v.id} vuln={v} onToggleFalsePositive={job.is_owner ? toggleFalsePositive : undefined} />
            ))}
          </div>
        )}

        <p className="muted" style={{ fontSize: 12, marginTop: 24 }}>
          Automated analysis is informational and not a substitute for a manual audit.
        </p>
      </div>

      <ReportChat jobId={job.id} />
    </div>
  );
}
