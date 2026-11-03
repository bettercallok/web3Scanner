import React, { useEffect, useRef, useState, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { API, errorMessage } from "../api";
import Navbar from "../components/Navbar";
import Icon, { IconName } from "../components/Icon";
import { EVM_ADDRESS, NETWORKS, RISK_COLORS, ScanListItem, shortAddress } from "../types";

const EXAMPLES = [
  { label: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", network: "mainnet", hint: "proxy" },
  { label: "WETH", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", network: "mainnet", hint: "token" },
  { label: "Uniswap V2 Router", address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", network: "mainnet", hint: "DeFi" },
];

const PIPELINE: { title: string; desc: string }[] = [
  { title: "Fetch", desc: "Verified source, proxy implementation or raw bytecode" },
  { title: "Static", desc: "Slither detectors + gas optimisation pass" },
  { title: "Symbolic", desc: "Mythril explores execution paths with Z3" },
  { title: "AI review", desc: "Local LLM triages findings with SWC context" },
  { title: "Score & report", desc: "0–100 risk score, PDF / SARIF / JSON" },
];

const FEATURES: { icon: IconName; name: string; desc: string; tone: string }[] = [
  {
    icon: "search",
    name: "Static analysis",
    desc: "Slither's 90+ detectors catch reentrancy, unchecked calls, tx.origin auth and access-control gaps in seconds.",
    tone: "tone-red",
  },
  {
    icon: "branches",
    name: "Symbolic execution",
    desc: "Mythril walks execution paths with an SMT solver — even on unverified contracts, straight from bytecode.",
    tone: "tone-blue",
  },
  {
    icon: "sparkles",
    name: "AI semantic review",
    desc: "A locally hosted LLM filters false positives and explains each risk in plain English. Your code never leaves the server.",
    tone: "tone-yellow",
  },
  {
    icon: "shieldAlert",
    name: "Honeypot detection",
    desc: "Transfer simulation plus ABI red flags — blacklists, trading switches, adjustable sell taxes.",
    tone: "tone-red",
  },
  {
    icon: "eye",
    name: "Upgrade monitoring",
    desc: "Watch contracts: bytecode and proxy-implementation changes trigger an alert and an automatic rescan.",
    tone: "tone-blue",
  },
  {
    icon: "download",
    name: "Shareable reports",
    desc: "Branded PDF, SARIF for GitHub Code Scanning, JSON, and read-only public links.",
    tone: "tone-yellow",
  },
];

function riskTone(level?: string | null) {
  return RISK_COLORS[level || ""] ?? "var(--text-3)";
}

export default function Home() {
  const [address, setAddress] = useState<string>("");
  const [network, setNetwork] = useState<string>("mainnet");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [recent, setRecent] = useState<ScanListItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    axios
      .get(`${API}/api/scans/?limit=4`)
      .then((res) => setRecent(res.data.results || res.data))
      .catch(() => undefined);
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
    <>
      <Navbar />

      <section className="hero hero-compact">
        <div className="container hero-inner">
          <div className="hero-eyebrow">
            <span className="eyebrow-dot" /> Slither · Mythril · Local LLM
          </div>
          <h1 className="hero-title">
            <span className="title-line-1">Audit smart contracts</span>
            <span className="title-line-accent">before attackers do</span>
          </h1>
          <p className="hero-sub">
            Paste a deployed address. Static analysis, symbolic execution, AI review and honeypot checks run in a
            single pipeline, with live progress.
          </p>

          <form className="scanbar-wrap" onSubmit={handleSubmit} noValidate>
            <div className={`scanbar ${error ? "has-error" : ""} ${looksValid ? "is-valid" : ""}`}>
              <span className="scanbar-icon" aria-hidden="true">
                <Icon name="search" size={18} />
              </span>
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
                aria-label="Contract address"
                aria-invalid={!!error}
                aria-describedby="scan-help"
              />
              <select
                id="network-select"
                className="scanbar-select"
                value={network}
                onChange={(e) => setNetwork(e.target.value)}
                aria-label="Network"
              >
                {NETWORKS.map((n) => (
                  <option key={n.value} value={n.value}>{n.label}</option>
                ))}
                <optgroup label="Coming soon">
                  <option disabled>Solana</option>
                  <option disabled>Aptos / Sui</option>
                  <option disabled>TON</option>
                </optgroup>
              </select>
              <button id="scan-submit-btn" type="submit" className="btn btn-primary scanbar-btn" disabled={loading}>
                {loading ? (
                  <>
                    <span className="btn-spinner" aria-hidden="true" /> Starting…
                  </>
                ) : (
                  <>
                    Scan <Icon name="arrowRight" size={16} />
                  </>
                )}
              </button>
            </div>

            <div id="scan-help" className="scanbar-meta">
              {error ? (
                <span className="form-error" role="alert">{error}</span>
              ) : (
                <>
                  <span className="muted">Try:</span>
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
            <li><Icon name="download" size={16} /> PDF · SARIF · JSON export</li>
            <li><Icon name="lock" size={16} /> Code never leaves your server</li>
            <li><Icon name="gauge" size={16} /> Typically 2–5 minutes</li>
          </ul>
        </div>
      </section>

      {recent.length > 0 && (
        <section className="home-section">
          <div className="container">
            <div className="section-row">
              <h2 className="section-heading">Recent scans</h2>
              <Link to="/dashboard" className="link-arrow">
                All scans <Icon name="arrowRight" size={14} />
              </Link>
            </div>
            <div className="recent-grid">
              {recent.map((s) => {
                const active = s.status !== "complete" && s.status !== "failed";
                return (
                  <Link
                    key={s.id}
                    to={active ? `/scan/${s.id}` : `/report/${s.id}`}
                    className="recent-card"
                    style={{ ["--tone" as any]: s.status === "failed" ? "var(--red)" : riskTone(s.risk_level) }}
                  >
                    <div className="recent-top">
                      <span className="recent-name">{s.contract_name || "Unknown contract"}</span>
                      <span className="recent-score">
                        {s.status === "complete" && s.risk_score != null
                          ? Math.round(s.risk_score)
                          : s.status === "failed"
                          ? "✕"
                          : `${s.progress}%`}
                      </span>
                    </div>
                    <div className="recent-meta mono">
                      {shortAddress(s.address)} · {s.network}
                    </div>
                    <div className="recent-foot">
                      <span>
                        {s.status === "complete"
                          ? `${s.risk_level || "—"} risk · ${s.finding_count} finding${s.finding_count === 1 ? "" : "s"}`
                          : s.status === "failed"
                          ? "Failed"
                          : "Scanning…"}
                      </span>
                      <span className="muted">{new Date(s.created_at).toLocaleDateString()}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <section className="home-section">
        <div className="container">
          <div className="section-label">// How it works</div>
          <h2 className="section-title">One address. Five layers.</h2>
          <ol className="pipeline-track">
            {PIPELINE.map((step, i) => (
              <li key={step.title} className="pipeline-node">
                <span className="pipeline-num">{String(i + 1).padStart(2, "0")}</span>
                <span className="pipeline-title">{step.title}</span>
                <span className="pipeline-desc">{step.desc}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="home-section features">
        <div className="container">
          <div className="section-label">// Capabilities</div>
          <h2 className="section-title">Multi-layer security</h2>
          <p className="section-sub">Every finding is cross-checked, scored by SWC impact and tool confidence, and explained.</p>
          <div className="features-grid">
            {FEATURES.map((f) => (
              <div key={f.name} className="feature-card">
                <div className={`feature-icon-wrap ${f.tone}`}>
                  <Icon name={f.icon} size={22} />
                </div>
                <div className="feature-name">{f.name}</div>
                <div className="feature-desc">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="footer">
        <p>
          <strong>Web3 Security Scanner</strong> · open source · automated analysis is not a substitute for a manual
          audit.
        </p>
      </footer>
    </>
  );
}
