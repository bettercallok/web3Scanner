import React, { useCallback, useEffect, useState, FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import { API, errorMessage } from "../api";
import Icon from "../components/Icon";

interface DiffVuln {
  title: string;
  severity: string;
  description: string;
  swc_id: string;
  tool: string;
  confidence: string;
  file_path: string;
  line_numbers: string;
}

interface JobMeta {
  id: string;
  address: string;
  risk_score: number;
}

interface DiffResult {
  job_a: JobMeta;
  job_b: JobMeta;
  new_vulns: DiffVuln[];
  fixed_vulns: DiffVuln[];
  unchanged_vulns: DiffVuln[];
  risk_delta: number;
  summary: { new_count: number; fixed_count: number; unchanged_count: number };
}

type Tab = "new" | "fixed" | "unchanged";
const TAG: Record<Tab, { cls: string; text: string }> = {
  new: { cls: "diff-new", text: "New" },
  fixed: { cls: "diff-fixed", text: "Fixed" },
  unchanged: { cls: "diff-same", text: "Unchanged" },
};

function DiffRow({ vuln, tab }: { vuln: DiffVuln; tab: Tab }) {
  const sev = vuln.severity || "informational";
  return (
    <div className="diff-card">
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <span className={`diff-tag ${TAG[tab].cls}`}>{TAG[tab].text}</span>
        <span className={`sev-label label-${sev}`}>{sev === "informational" ? "info" : sev}</span>
        <span style={{ fontWeight: 500 }}>{vuln.title}</span>
        {vuln.swc_id && <span className="swc-chip">{vuln.swc_id}</span>}
      </div>
      {vuln.description && (
        <div className="vuln-desc" style={{ fontSize: 13 }}>
          {vuln.description.slice(0, 220)}{vuln.description.length > 220 ? "…" : ""}
        </div>
      )}
      {vuln.file_path && (
        <div className="vuln-meta" style={{ marginTop: 6 }}>
          <Icon name="file" size={13} /> <span>{vuln.file_path}{vuln.line_numbers ? `:${vuln.line_numbers}` : ""}</span>
        </div>
      )}
    </div>
  );
}

export default function Diff() {
  const [params, setParams] = useSearchParams();
  const [jobA, setJobA] = useState(params.get("a") || "");
  const [jobB, setJobB] = useState(params.get("b") || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DiffResult | null>(null);
  const [tab, setTab] = useState<Tab>("new");

  const runDiff = useCallback(
    async (a: string, b: string) => {
      setError("");
      setResult(null);
      if (!a.trim() || !b.trim()) {
        setError("Enter both scan IDs.");
        return;
      }
      setLoading(true);
      try {
        const res = await axios.post(`${API}/api/diff/`, { job_a: a.trim(), job_b: b.trim() });
        setResult(res.data);
        setParams({ a: a.trim(), b: b.trim() }, { replace: true });
      } catch (err) {
        setError(errorMessage(err, "Comparison failed."));
      } finally {
        setLoading(false);
      }
    },
    [setParams]
  );

  useEffect(() => {
    const a = params.get("a");
    const b = params.get("b");
    if (a && b) runDiff(a, b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    runDiff(jobA, jobB);
  };

  const list: Record<Tab, DiffVuln[]> = {
    new: result?.new_vulns ?? [],
    fixed: result?.fixed_vulns ?? [],
    unchanged: result?.unchanged_vulns ?? [],
  };
  const empty: Record<Tab, string> = {
    new: "No new vulnerabilities were introduced.",
    fixed: "No vulnerabilities were fixed between these scans.",
    unchanged: "No findings are shared between these scans.",
  };

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Compare scans</h1>
            <p className="page-subtitle">See which findings were introduced, fixed or unchanged between two completed scans.</p>
          </div>
        </div>

        <form className="card" onSubmit={handleSubmit} style={{ marginBottom: 20 }}>
          <div className="grid-2">
            <div>
              <label className="field-label" htmlFor="diff-job-a">Baseline scan (A)</label>
              <input id="diff-job-a" className="form-input input-block mono" value={jobA} onChange={(e) => setJobA(e.target.value)} placeholder="Scan ID" spellCheck={false} autoComplete="off" />
            </div>
            <div>
              <label className="field-label" htmlFor="diff-job-b">Comparison scan (B)</label>
              <input id="diff-job-b" className="form-input input-block mono" value={jobB} onChange={(e) => setJobB(e.target.value)} placeholder="Scan ID" spellCheck={false} autoComplete="off" />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
            <span className="muted" style={{ fontSize: 13 }}>
              Tip: select two scans on the <Link to="/dashboard" className="text-link">Scans</Link> page and press Compare.
            </span>
            <button id="diff-submit-btn" type="submit" className="btn btn-primary" disabled={loading}>
              <Icon name="compare" size={16} /> {loading ? "Comparing…" : "Compare"}
            </button>
          </div>
          {error && <div className="form-error" role="alert" style={{ marginTop: 12 }}>{error}</div>}
        </form>

        {result && (
          <>
            <div className="kpi-grid">
              <div className="kpi">
                <div className="kpi-label">Risk change</div>
                <div className={`kpi-value ${result.risk_delta > 0 ? "delta-up" : result.risk_delta < 0 ? "delta-down" : ""}`}>
                  {result.risk_delta > 0 ? "+" : ""}{result.risk_delta}
                </div>
              </div>
              <div className="kpi"><div className="kpi-label">New</div><div className="kpi-value" style={{ color: result.summary.new_count ? "var(--sev-critical)" : undefined }}>{result.summary.new_count}</div></div>
              <div className="kpi"><div className="kpi-label">Fixed</div><div className="kpi-value" style={{ color: result.summary.fixed_count ? "var(--sev-low)" : undefined }}>{result.summary.fixed_count}</div></div>
              <div className="kpi"><div className="kpi-label">Unchanged</div><div className="kpi-value">{result.summary.unchanged_count}</div></div>
            </div>

            <div className="grid-2" style={{ marginBottom: 20 }}>
              {[
                { label: "Scan A · baseline", job: result.job_a },
                { label: "Scan B · comparison", job: result.job_b },
              ].map(({ label, job }) => (
                <div key={job.id} className="card">
                  <div className="card-sub" style={{ marginBottom: 4 }}>{label}</div>
                  <div className="mono" style={{ fontSize: 13, overflowWrap: "anywhere", marginBottom: 8 }}>{job.address}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="muted">Risk score <strong style={{ color: "var(--text-1)" }}>{job.risk_score?.toFixed(1) ?? "—"}</strong></span>
                    <Link to={`/report/${job.id}`} className="link-arrow">Open report <Icon name="arrowRight" size={14} /></Link>
                  </div>
                </div>
              ))}
            </div>

            <div className="filter-bar" role="tablist">
              {(["new", "fixed", "unchanged"] as Tab[]).map((t) => (
                <button key={t} id={`diff-tab-${t}`} role="tab" aria-selected={tab === t} className={`filter-btn ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
                  {TAG[t].text} <span className="filter-count">{list[t].length}</span>
                </button>
              ))}
            </div>
            {list[tab].length > 0 ? (
              <div className="findings">{list[tab].map((v, i) => <DiffRow key={i} vuln={v} tab={tab} />)}</div>
            ) : (
              <div className="card empty-state">
                <div className="empty-icon"><Icon name="check" size={20} /></div>
                <p>{empty[tab]}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
