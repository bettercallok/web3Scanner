import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import { GradientHeading } from "../components/ui/gradient-heading";

const API = import.meta.env.VITE_API_BASE_URL || "";

const SEV_ORDER = ["critical", "high", "medium", "low", "informational"];
const RISK_COLORS = { Critical: "#ef4444", High: "#f97316", Medium: "#f59e0b", Low: "#10b981", "N/A": "#64748b" };

function RiskGauge({ score, level }) {
  const color = RISK_COLORS[level] || "#64748b";
  const pct = Math.min(100, score || 0);
  const r = 54, cx = 64, cy = 64;
  const circ = Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-white/[0.02] border border-white/5 rounded-2xl relative">
      <div className="relative w-32 h-20 overflow-hidden">
        <svg className="w-full h-full drop-shadow-2xl" viewBox="0 0 128 80">
          <path
            d={`M ${cx - r},${cy} A ${r},${r} 0 0 1 ${cx + r},${cy}`}
            fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" strokeLinecap="round"
          />
          <path
            d={`M ${cx - r},${cy} A ${r},${r} 0 0 1 ${cx + r},${cy}`}
            fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
            style={{ transition: "stroke-dasharray 1s ease", filter: `drop-shadow(0 0 8px ${color}66)` }}
          />
        </svg>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex flex-col items-center pb-2">
          <div className="text-3xl font-bold font-mono" style={{ color }}>{score != null ? Math.round(score) : "—"}</div>
        </div>
      </div>
      <div className="text-sm font-semibold tracking-wider uppercase mt-4" style={{ color }}>{level || "—"} RISK</div>
    </div>
  );
}

function VulnCard({ vuln }) {
  const [open, setOpen] = useState(false);
  const sev = vuln.severity || "informational";

  const sevColors = {
    critical: "bg-red-500/10 text-red-500 border-red-500/20",
    high: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    medium: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    low: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    informational: "bg-blue-500/10 text-blue-500 border-blue-500/20"
  };

  const sevDots = {
    critical: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]",
    high: "bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]",
    medium: "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]",
    low: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]",
    informational: "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]"
  };

  return (
    <div className="mb-4 bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden transition-all duration-200 hover:bg-white/[0.04]">
      <div
        className="flex items-center gap-4 p-4 cursor-pointer select-none"
        onClick={() => setOpen(!open)}
      >
        <div className={`w-2.5 h-2.5 rounded-full ${sevDots[sev]} shrink-0`} />
        <div className={`px-2.5 py-1 text-xs font-bold uppercase rounded-md border ${sevColors[sev]} shrink-0 w-24 text-center tracking-wider`}>
          {sev}
        </div>
        <div className="flex-1 font-semibold text-gray-200 truncate pr-4">{vuln.title}</div>

        <div className="hidden md:flex items-center gap-2 shrink-0">
          {vuln.swc_id && (
            <span className="px-2 py-1 text-xs font-mono text-gray-400 bg-white/5 rounded border border-white/5">
              {vuln.swc_id}
            </span>
          )}
          <span className="px-2 py-1 text-xs font-medium text-purple-300 bg-purple-500/10 rounded border border-purple-500/20">
            {vuln.tool}
          </span>
        </div>

        <div className={`shrink-0 text-gray-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {open && (
        <div className="p-6 border-t border-white/5 bg-black/20">
          <p className="text-gray-300 mb-6 leading-relaxed text-sm md:text-base">{vuln.description}</p>

          {vuln.file_path && (
            <div className="flex flex-wrap gap-x-6 gap-y-2 mb-6 text-sm text-gray-400 bg-white/5 p-3 rounded-lg border border-white/5">
              <div className="flex items-center gap-2">
                <span>📁</span> <span className="font-mono text-gray-300">{vuln.file_path}</span>
              </div>
              {vuln.line_numbers && (
                <div className="flex items-center gap-2 text-gray-500">
                  • Line <span className="font-mono text-gray-300">{vuln.line_numbers}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-gray-500">
                • Confidence: <span className="text-gray-300 capitalize">{vuln.confidence}</span>
              </div>
            </div>
          )}

          {vuln.code_snippet && (
            <div className="mb-6 rounded-lg overflow-hidden border border-white/10 bg-[#0d1117]">
              <div className="px-4 py-2 bg-white/5 border-b border-white/10 text-xs font-mono text-gray-400 flex justify-between items-center">
                <span>Vulnerable Code</span>
              </div>
              <pre className="p-4 text-sm font-mono text-gray-300 overflow-x-auto">
                <code>{vuln.code_snippet}</code>
              </pre>
            </div>
          )}

          {vuln.remediation && (
            <div className="p-5 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold mb-2">
                <span>✅</span> Remediation
              </div>
              <p className="text-gray-300 text-sm md:text-base leading-relaxed">{vuln.remediation}</p>
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
    <div className="min-h-screen bg-background flex flex-col items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 z-0 opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+CjxyZWN0IHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgZmlsbD0ibm9uZSIvPgo8Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIxIiBmaWxsPSJyZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMSkiLz4KPC9zdmc+')] bg-repeat" />
      <div className="relative z-10 flex flex-col items-center gap-6">
        <svg className="w-12 h-12 text-purple-500 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        <GradientHeading size="sm" className="animate-pulse">Analyzing Contract Data...</GradientHeading>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden text-center">
      <div className="absolute inset-0 z-0 opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+CjxyZWN0IHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgZmlsbD0ibm9uZSIvPgo8Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIxIiBmaWxsPSJyZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMSkiLz4KPC9zdmc+')] bg-repeat" />
      <div className="relative z-10 flex flex-col items-center max-w-md">
        <div className="w-20 h-20 mb-6 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20 text-4xl">❌</div>
        <h2 className="text-2xl font-bold text-white mb-2">Analysis Failed</h2>
        <p className="text-gray-400 mb-8">{error}</p>
        <Link to="/" className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors font-medium border border-white/10">← Start New Scan</Link>
      </div>
    </div>
  );

  const vulns = (job.vulnerabilities || []).filter((v) => !v.is_false_positive);
  const filtered = filter === "all" ? vulns : vulns.filter((v) => v.severity === filter);

  const counts = SEV_ORDER.reduce((acc, s) => {
    acc[s] = vulns.filter((v) => v.severity === s).length;
    return acc;
  }, {});

  const SEV_LABELS = { critical: "Critical", high: "High", medium: "Medium", low: "Low", informational: "Info" };
  const SEV_TEXT_COLORS = {
    critical: "text-red-400",
    high: "text-orange-400",
    medium: "text-amber-400",
    low: "text-emerald-400",
    informational: "text-blue-400"
  };

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-purple-500/30 font-sans pb-24">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 backdrop-blur-md bg-background/80 border-b border-white/5">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20 group-hover:shadow-purple-500/40 transition-shadow">
            <span className="text-white text-lg">🛡️</span>
          </div>
          <span className="font-bold text-xl tracking-tight hidden sm:block">Web3Scanner</span>
        </Link>
        <Link to="/" className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-colors">
          ← New Scan
        </Link>
      </nav>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-12">
        {/* Header Area */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white">
                {job.contract_name || "Audit Report"}
              </h1>
              {job.is_honeypot === true && (
                <span className="px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded-full text-xs font-bold tracking-wider uppercase flex items-center gap-1 shadow-[0_0_15px_rgba(239,68,68,0.3)]">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                  HONEYPOT DETECTED
                </span>
              )}
              {job.is_honeypot === false && (
                <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-bold tracking-wider uppercase flex items-center gap-1">
                  <span>✓</span> Not Honeypot
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-y-2 gap-x-4 items-center text-sm font-mono">
              <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-md border border-white/5">
                <span className="text-gray-500">Address</span>
                <span className="text-purple-300">{job.address}</span>
              </div>
              <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-md border border-white/5">
                <span className="text-gray-500">Network</span>
                <span className="text-gray-300 capitalize">{job.network}</span>
              </div>
              {job.compiler_version && (
                <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-md border border-white/5">
                  <span className="text-gray-500">solc</span>
                  <span className="text-gray-300">{job.compiler_version}</span>
                </div>
              )}
            </div>
          </div>

          <a
            href={`${API}/api/reports/${id}/pdf/`}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white text-black font-semibold rounded-xl hover:bg-gray-200 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.15)] hover:shadow-[0_0_25px_rgba(255,255,255,0.25)]"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download PDF
          </a>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
          {/* Gauge */}
          <div className="lg:col-span-1 h-full">
            <RiskGauge score={job.risk_score} level={job.risk_level} />
          </div>

          {/* AI Summary */}
          <div className="lg:col-span-2 p-6 bg-white/[0.02] border border-white/5 rounded-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 group-hover:bg-purple-500/10 transition-colors duration-700"></div>
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2 text-white relative z-10">
              <span className="text-purple-400">🤖</span> AI Analysis Summary
            </h3>
            <div className="prose prose-invert prose-p:text-gray-300 prose-p:leading-relaxed max-w-none relative z-10 text-[15px]">
              <p>{job.ai_summary || "AI analysis was not available for this scan."}</p>
            </div>
          </div>
        </div>

        {/* Findings Section */}
        <div className="mb-8">
          <GradientHeading size="md" className="mb-6">Security Findings</GradientHeading>

          {/* Summary Pills */}
          <div className="flex flex-wrap gap-3 mb-8">
            {SEV_ORDER.map((s) => (
              <div key={s} className="flex overflow-hidden rounded-lg border border-white/10 bg-black/40 shadow-sm">
                <div className={`px-4 py-2 text-xl font-bold bg-white/5 flex items-center justify-center min-w-[50px] border-r border-white/5 ${SEV_TEXT_COLORS[s]}`}>
                  {counts[s]}
                </div>
                <div className="px-4 py-2 text-xs font-semibold tracking-wider text-gray-400 uppercase flex items-center bg-white/[0.01]">
                  {SEV_LABELS[s]}
                </div>
              </div>
            ))}
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap gap-2 mb-8 p-1 bg-white/[0.03] rounded-xl border border-white/5 inline-flex">
            {["all", ...SEV_ORDER].map((f) => (
              <button
                key={f}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                  filter === f
                    ? "bg-white/10 text-white shadow-sm"
                    : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                }`}
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "All Findings" : SEV_LABELS[f]}
                {f !== "all" && <span className="ml-1.5 opacity-60">({counts[f]})</span>}
              </button>
            ))}
          </div>

          {/* Vulnerability List */}
          <div className="space-y-4">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 bg-white/[0.01] border border-white/5 rounded-2xl border-dashed">
                <div className="text-5xl mb-4 opacity-50">
                  {filter === "all" ? "✨" : "🔍"}
                </div>
                <h3 className="text-xl font-medium text-white mb-2">No findings here</h3>
                <p className="text-gray-400 text-center max-w-md">
                  {filter === "all"
                    ? "No vulnerabilities were detected by any of the analysis engines. This contract appears exceptionally clean."
                    : `No ${SEV_LABELS[filter]} severity vulnerabilities were found in this contract.`}
                </p>
              </div>
            ) : (
              filtered
                .sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity))
                .map((v) => <VulnCard key={v.id} vuln={v} />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
