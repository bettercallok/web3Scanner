import React, { useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

const API = import.meta.env.VITE_API_BASE_URL || "";

// ─── Types ────────────────────────────────────────────────────
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

// ─── Severity badge ───────────────────────────────────────────
const SEV_COLORS: Record<string, string> = {
  critical: "#ff2d55",
  high:     "#ff6b35",
  medium:   "#ffd60a",
  low:      "#30d158",
  informational: "#636e72",
};

function SevBadge({ sev }: { sev: string }) {
  const color = SEV_COLORS[sev] ?? "#636e72";
  return (
    <span style={{
      background: color + "22",
      color,
      border: `1px solid ${color}55`,
      borderRadius: 4,
      padding: "2px 8px",
      fontSize: 11,
      fontWeight: 700,
      fontFamily: "'JetBrains Mono', monospace",
      textTransform: "uppercase",
      letterSpacing: 1,
    }}>
      {sev}
    </span>
  );
}

// ─── Vuln card in diff ────────────────────────────────────────
function DiffVulnCard({
  vuln,
  accent,
  tag,
}: {
  vuln: DiffVuln;
  accent: string;
  tag: string;
}) {
  return (
    <div style={{
      background: "var(--card-bg)",
      border: `1px solid ${accent}44`,
      borderLeft: `3px solid ${accent}`,
      borderRadius: 8,
      padding: "14px 18px",
      marginBottom: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{
          background: accent + "22",
          color: accent,
          border: `1px solid ${accent}55`,
          borderRadius: 4,
          padding: "2px 8px",
          fontSize: 11,
          fontWeight: 700,
          fontFamily: "'JetBrains Mono', monospace",
        }}>{tag}</span>
        <SevBadge sev={vuln.severity} />
        {vuln.swc_id && (
          <span style={{ color: "var(--text-3)", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
            {vuln.swc_id}
          </span>
        )}
      </div>
      <div style={{ fontWeight: 600, color: "var(--text-1)", fontSize: 14, marginBottom: 4 }}>
        {vuln.title}
      </div>
      <div style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.6 }}>
        {vuln.description.slice(0, 200)}{vuln.description.length > 200 ? "…" : ""}
      </div>
      {vuln.file_path && (
        <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 6, fontFamily: "'JetBrains Mono', monospace" }}>
          📁 {vuln.file_path}{vuln.line_numbers ? ` : ${vuln.line_numbers}` : ""}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────
export default function Diff() {
  const [jobA, setJobA] = useState("");
  const [jobB, setJobB] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [result, setResult]   = useState<DiffResult | null>(null);
  const [activeTab, setActiveTab] = useState<"new" | "fixed" | "unchanged">("new");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setResult(null);

    if (!jobA.trim() || !jobB.trim()) {
      setError("Enter both Scan IDs.");
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API}/api/diff/`, { job_a: jobA.trim(), job_b: jobB.trim() });
      setResult(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || "Diff failed.");
    } finally {
      setLoading(false);
    }
  };

  const riskColor = (delta: number) =>
    delta > 10 ? "var(--red)" : delta < -10 ? "var(--green)" : "var(--yellow)";

  const tabs = [
    { key: "new",       label: "🔴 New",      count: result?.summary.new_count     ?? 0 },
    { key: "fixed",     label: "🟢 Fixed",    count: result?.summary.fixed_count   ?? 0 },
    { key: "unchanged", label: "⚪ Unchanged", count: result?.summary.unchanged_count ?? 0 },
  ] as const;

  return (
    <>
      {/* Navbar */}
      <nav className="navbar">
        <Link to="/" className="navbar-logo">
          <div className="logo-icon">🛡️</div>
          WEB3<span className="logo-dot">.</span>SCANNER
        </Link>
        <span className="nav-badge">DIFF</span>
      </nav>

      <div className="scan-page">
        <div className="container">
          <h1 className="page-heading">
            <span className="accent-red">CONTRACT</span>{" "}
            <span className="accent-blue">DIFF</span>{" "}
            <span className="accent-yellow">ANALYSIS</span>
          </h1>
          <p style={{ color: "var(--text-2)", fontSize: 15, marginBottom: 32, textAlign: "center" }}>
            Compare two completed scans — see what vulnerabilities were introduced or fixed.
          </p>

          {/* Input form */}
          <div className="card" style={{ marginBottom: 28 }}>
            <form onSubmit={handleSubmit}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <div style={{ color: "var(--text-3)", fontSize: 12, fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>
                    SCAN A (baseline)
                  </div>
                  <input
                    id="diff-job-a"
                    className="form-input"
                    value={jobA}
                    onChange={e => setJobA(e.target.value)}
                    placeholder="Paste Scan ID (UUID)…"
                    spellCheck={false}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <div style={{ color: "var(--text-3)", fontSize: 12, fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>
                    SCAN B (compare)
                  </div>
                  <input
                    id="diff-job-b"
                    className="form-input"
                    value={jobB}
                    onChange={e => setJobB(e.target.value)}
                    placeholder="Paste Scan ID (UUID)…"
                    spellCheck={false}
                    autoComplete="off"
                  />
                </div>
              </div>
              {error && <div className="form-error" style={{ marginTop: 12 }}>⚠ {error}</div>}
              <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
                <button id="diff-submit-btn" type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? "COMPARING…" : "⚡ COMPARE SCANS"}
                </button>
              </div>
            </form>
          </div>

          {/* Results */}
          {result && (
            <>
              {/* Summary cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
                <div className="card" style={{ textAlign: "center", padding: "18px 10px" }}>
                  <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}>
                    RISK DELTA
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: riskColor(result.risk_delta), fontFamily: "'JetBrains Mono', monospace" }}>
                    {result.risk_delta > 0 ? "+" : ""}{result.risk_delta}
                  </div>
                </div>
                <div className="card" style={{ textAlign: "center", padding: "18px 10px", borderColor: "var(--red)" }}>
                  <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}>NEW VULNS</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "var(--red)", fontFamily: "'JetBrains Mono', monospace" }}>
                    {result.summary.new_count}
                  </div>
                </div>
                <div className="card" style={{ textAlign: "center", padding: "18px 10px", borderColor: "var(--green)" }}>
                  <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}>FIXED</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "var(--green)", fontFamily: "'JetBrains Mono', monospace" }}>
                    {result.summary.fixed_count}
                  </div>
                </div>
                <div className="card" style={{ textAlign: "center", padding: "18px 10px" }}>
                  <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}>UNCHANGED</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-2)", fontFamily: "'JetBrains Mono', monospace" }}>
                    {result.summary.unchanged_count}
                  </div>
                </div>
              </div>

              {/* Contract addresses */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
                {[
                  { label: "SCAN A", job: result.job_a, color: "var(--blue)" },
                  { label: "SCAN B", job: result.job_b, color: "var(--yellow)" },
                ].map(({ label, job, color }) => (
                  <div key={job.id} className="card" style={{ borderColor: color, padding: "14px 18px" }}>
                    <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "'JetBrains Mono', monospace", marginBottom: 4 }}>{label}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "var(--text-1)", marginBottom: 4 }}>
                      {job.address}
                    </div>
                    <div style={{ color: "var(--text-3)", fontSize: 12 }}>
                      Risk Score: <span style={{ color, fontWeight: 700 }}>{job.risk_score?.toFixed(1) ?? "—"}</span>
                    </div>
                    <Link to={`/report/${job.id}`} style={{ color, fontSize: 12, textDecoration: "none", marginTop: 4, display: "inline-block" }}>
                      View Report →
                    </Link>
                  </div>
                ))}
              </div>

              {/* Tabs */}
              <div className="card">
                <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--card-border)", marginBottom: 20 }}>
                  {tabs.map(tab => (
                    <button
                      key={tab.key}
                      id={`diff-tab-${tab.key}`}
                      onClick={() => setActiveTab(tab.key)}
                      style={{
                        background: "none",
                        border: "none",
                        borderBottom: activeTab === tab.key ? "2px solid var(--blue)" : "2px solid transparent",
                        padding: "10px 20px",
                        cursor: "pointer",
                        color: activeTab === tab.key ? "var(--text-1)" : "var(--text-3)",
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 13,
                        fontWeight: activeTab === tab.key ? 700 : 400,
                        transition: "all 0.2s",
                      }}
                    >
                      {tab.label} ({tab.count})
                    </button>
                  ))}
                </div>

                {activeTab === "new" && (
                  result.new_vulns.length > 0
                    ? result.new_vulns.map((v, i) => <DiffVulnCard key={i} vuln={v} accent="var(--red)" tag="NEW" />)
                    : <div style={{ color: "var(--green)", padding: "20px", textAlign: "center" }}>✅ No new vulnerabilities introduced!</div>
                )}
                {activeTab === "fixed" && (
                  result.fixed_vulns.length > 0
                    ? result.fixed_vulns.map((v, i) => <DiffVulnCard key={i} vuln={v} accent="var(--green)" tag="FIXED" />)
                    : <div style={{ color: "var(--text-3)", padding: "20px", textAlign: "center" }}>No vulnerabilities were fixed between these scans.</div>
                )}
                {activeTab === "unchanged" && (
                  result.unchanged_vulns.length > 0
                    ? result.unchanged_vulns.map((v, i) => <DiffVulnCard key={i} vuln={v} accent="var(--text-3)" tag="SAME" />)
                    : <div style={{ color: "var(--green)", padding: "20px", textAlign: "center" }}>✅ No unchanged vulnerabilities.</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
