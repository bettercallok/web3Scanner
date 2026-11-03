import React, { useEffect, useRef, useState, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { API, errorMessage } from "../api";
import Icon, { IconName } from "../components/Icon";
import { EVM_ADDRESS, NETWORKS, RISK_COLORS, ScanListItem, shortAddress } from "../types";

const EXAMPLES = [
  { label: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", network: "mainnet", hint: "proxy" },
  { label: "WETH", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", network: "mainnet", hint: "token" },
  { label: "Uniswap V2 Router", address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", network: "mainnet", hint: "DeFi" },
];

const CHECKS: { icon: IconName; name: string; desc: string }[] = [
  { icon: "search", name: "Static analysis", desc: "90+ Slither detectors: reentrancy, unchecked calls, tx.origin, access control." },
  { icon: "branches", name: "Symbolic execution", desc: "Mythril explores execution paths — works on unverified bytecode too." },
  { icon: "sparkles", name: "AI review", desc: "A local LLM triages false positives and explains each risk." },
  { icon: "shieldAlert", name: "Honeypot checks", desc: "Transfer simulation plus ABI red flags like blacklists and sell taxes." },
  { icon: "gas", name: "Gas optimisation", desc: "Costly loops, uncached lengths and storage patterns with savings estimates." },
  { icon: "eye", name: "Upgrade monitoring", desc: "Watch contracts and get alerted when proxy implementations change." },
];

export default function Home() {
  const [address, setAddress] = useState("");
  const [network, setNetwork] = useState("mainnet");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recent, setRecent] = useState<ScanListItem[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    axios
      .get(`${API}/api/scans/?limit=4`)
      .then((res) => setRecent(res.data.results || res.data))
      .catch(() => setRecent([]));
  }, []);

  const trimmed = address.trim();
  const looksValid = EVM_ADDRESS.test(trimmed);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    if (!looksValid) {
      setError("Enter a contract address: 0x followed by 40 hex characters.");
      inputRef.current?.focus();
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(`${API}/api/scans/create/`, { address: trimmed, network });
      navigate(`/scan/${res.data.id}`);
    } catch (err) {
      setError(errorMessage(err, "Failed to start scan. Is the backend running?"));
      setLoading(false);
    }
  };

  const useExample = (ex: (typeof EXAMPLES)[number]) => {
    setAddress(ex.address);
    setNetwork(ex.network);
    setError("");
    inputRef.current?.focus();
  };

  return (
    <div className="page">
      <div className="container">
        <section className="scan-hero">
          <div className="eyebrow"><span className="eyebrow-dot" /> Slither · Mythril · Local LLM</div>
          <h1 className="hero-title">Scan a smart contract</h1>
          <p className="hero-sub">
            Paste a deployed address. Static analysis, symbolic execution, AI review and honeypot checks run in a single
            pipeline, with live progress.
          </p>

          <form className="scanbar-wrap" onSubmit={handleSubmit} noValidate>
            <div className={`scanbar ${error ? "has-error" : ""} ${looksValid ? "is-valid" : ""}`}>
              <span className="scanbar-icon" aria-hidden="true"><Icon name="search" size={18} /></span>
              <input
                ref={inputRef}
                id="contract-address"
                className="scanbar-input"
                type="text"
                placeholder="0x… contract address"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setError("");
                }}
                spellCheck={false}
                autoComplete="off"
                autoFocus
                aria-label="Contract address"
                aria-invalid={!!error}
                aria-describedby="scan-help"
              />
              <select id="network-select" className="scanbar-select" value={network} onChange={(e) => setNetwork(e.target.value)} aria-label="Network">
                {NETWORKS.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
                <optgroup label="Coming soon">
                  <option disabled>Solana</option>
                  <option disabled>Aptos / Sui</option>
                  <option disabled>TON</option>
                </optgroup>
              </select>
              <button id="scan-submit-btn" type="submit" className="btn btn-primary scanbar-btn" disabled={loading}>
                {loading ? <><span className="btn-spinner" aria-hidden="true" /> Starting…</> : <>Start scan <Icon name="arrowRight" size={16} /></>}
              </button>
            </div>
            <div id="scan-help" className="scanbar-meta">
              {error ? (
                <span className="form-error" role="alert">{error}</span>
              ) : (
                <>
                  <span className="muted">Try an example:</span>
                  {EXAMPLES.map((ex) => (
                    <button type="button" key={ex.label} className="chip" onClick={() => useExample(ex)}>
                      {ex.label} <span className="chip-hint">{ex.hint}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </form>

          <ul className="trust-strip">
            <li><Icon name="lock" size={15} /> Code never leaves your server</li>
            <li><Icon name="gauge" size={15} /> Typically 2–5 minutes</li>
            <li><Icon name="download" size={15} /> PDF, SARIF & JSON export</li>
          </ul>
        </section>

        <section style={{ marginBottom: 32 }}>
          <div className="section-row">
            <h2 className="section-heading">Recent scans</h2>
            {recent && recent.length > 0 && (
              <Link to="/dashboard" className="link-arrow">View all <Icon name="arrowRight" size={14} /></Link>
            )}
          </div>
          {recent === null ? (
            <div className="card muted">Loading…</div>
          ) : recent.length === 0 ? (
            <div className="card empty-state">
              <div className="empty-icon"><Icon name="search" size={20} /></div>
              <h3>No scans yet</h3>
              <p>Your scans will appear here. Try one of the example contracts above.</p>
            </div>
          ) : (
            <div className="recent-grid">
              {recent.map((s) => {
                const active = s.status !== "complete" && s.status !== "failed";
                const tone = s.status === "failed" ? "var(--sev-critical)" : RISK_COLORS[s.risk_level || ""] ?? "var(--text-3)";
                return (
                  <Link
                    key={s.id}
                    to={active ? `/scan/${s.id}` : `/report/${s.id}`}
                    className="recent-card"
                    style={{ ["--tone" as any]: tone }}
                  >
                    <div className="recent-top">
                      <span className="recent-name">{s.contract_name || "Unknown contract"}</span>
                      <span className="recent-score">
                        {s.status === "complete" && s.risk_score != null ? Math.round(s.risk_score) : s.status === "failed" ? "—" : `${s.progress}%`}
                      </span>
                    </div>
                    <div className="recent-meta">{shortAddress(s.address)} · {s.network}</div>
                    <div className="recent-foot">
                      <span
                        className={`status-chip ${s.status === "failed" ? "status-failed" : s.status === "complete" ? "" : "status-active"}`}
                        style={s.status === "complete" ? { color: tone } : undefined}
                      >
                        {s.status === "complete"
                          ? `${s.risk_level || "—"} risk`
                          : s.status === "failed"
                          ? "Failed"
                          : "Scanning"}
                      </span>
                      <span className="muted">
                        {s.status === "complete" ? `${s.finding_count} finding${s.finding_count === 1 ? "" : "s"}` : new Date(s.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <div className="section-row">
            <h2 className="section-heading">What every scan checks</h2>
          </div>
          <div className="check-grid">
            {CHECKS.map((c) => (
              <div key={c.name} className="check-item">
                <span className="check-icon"><Icon name={c.icon} size={18} /></span>
                <div>
                  <div className="check-name">{c.name}</div>
                  <div className="check-desc">{c.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
