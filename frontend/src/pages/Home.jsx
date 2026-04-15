import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API = import.meta.env.VITE_API_BASE_URL || "";

const FEATURES = [
  { icon: "🔍", name: "Static Analysis", desc: "Slither scans your contract's AST with 90+ detectors, catching reentrancy, integer overflows, tx.origin misuse, and more in seconds." },
  { icon: "⚙️", name: "Symbolic Execution", desc: "Mythril mathematically explores every execution path using SMT solvers to prove whether vulnerabilities are truly exploitable." },
  { icon: "🤖", name: "AI Semantic Review", desc: "CodeLlama 7B (local, no API key needed) reasons over your full codebase, filters false positives, and explains risks in plain English." },
  { icon: "🍯", name: "Honeypot Detection", desc: "Our simulation engine executes buy+sell sequences against a mainnet fork to detect hidden sell restrictions and rug-pull mechanisms." },
  { icon: "📊", name: "Risk Scoring", desc: "Every finding is weighted by SWC impact, exploitability, and AI confidence into a 0–100 risk score with actionable thresholds." },
  { icon: "📄", name: "PDF Reports", desc: "Beautifully formatted audit reports with executive summaries, code snippets, and remediation steps — ready for stakeholders." },
];

export default function Home() {
  const [address, setAddress] = useState("");
  const [network, setNetwork] = useState("mainnet");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      setError("Please enter a valid Ethereum contract address (0x + 40 hex chars).");
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API}/api/scans/create/`, { address, network });
      navigate(`/scan/${res.data.id}`);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Failed to start scan. Is the backend running?");
      setLoading(false);
    }
  };

  return (
    <>
      {/* Navbar */}
      <nav className="navbar">
        <a href="/" className="navbar-logo">
          <div className="logo-icon">🛡️</div>
          Web3Scanner
        </a>
        <span className="nav-badge">AI-POWERED</span>
      </nav>

      {/* Hero */}
      <section className="hero">
        <div className="container">
          <div className="hero-eyebrow">⚡ Powered by CodeLlama + Slither + Mythril</div>
          <h1 className="hero-title">
            Audit Smart Contracts<br />
            <span className="gradient-text">Before Attackers Do</span>
          </h1>
          <p className="hero-sub">
            Enterprise-grade vulnerability detection in minutes. Static analysis, symbolic execution,
            AI semantic review, and honeypot detection — all in one automated pipeline.
          </p>

          {/* Scan Form */}
          <div className="scan-form-wrapper">
            <div className="scan-form-title">🔎 Scan a Contract</div>
            <div className="scan-form-sub">Paste any deployed contract address to begin a full security audit.</div>
            <form onSubmit={handleSubmit}>
              <div className="input-group">
                <input
                  id="contract-address"
                  className={`form-input ${error ? "error" : ""}`}
                  type="text"
                  placeholder="0x742d35Cc6634C0532925a3b8D4C9b4A1b2e3f4a5"
                  value={address}
                  onChange={(e) => { setAddress(e.target.value); setError(""); }}
                  spellCheck={false}
                  autoComplete="off"
                />
                <div className="input-row">
                  <select
                    id="network-select"
                    className="form-select"
                    value={network}
                    onChange={(e) => setNetwork(e.target.value)}
                  >
                    <option value="mainnet">Ethereum Mainnet</option>
                    <option value="polygon">Polygon</option>
                    <option value="bsc">Binance Smart Chain</option>
                    <option value="arbitrum">Arbitrum</option>
                    <option value="optimism">Optimism</option>
                  </select>
                  <button
                    id="scan-submit-btn"
                    type="submit"
                    className="btn btn-primary"
                    disabled={loading}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {loading ? "Starting..." : "🚀 Scan Now"}
                  </button>
                </div>
                {error && <div className="form-error">{error}</div>}
              </div>
            </form>
          </div>

          {/* Stats */}
          <div className="stats-row">
            <div className="stat-card"><div className="stat-value stat-purple">90+</div><div className="stat-label">Slither Detectors</div></div>
            <div className="stat-card"><div className="stat-value stat-cyan">7B</div><div className="stat-label">Parameter AI Model</div></div>
            <div className="stat-card"><div className="stat-value stat-green">5</div><div className="stat-label">EVM Networks</div></div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="features">
        <div className="container">
          <h2 className="section-title">Multi-Layer Security Analysis</h2>
          <p className="section-sub">Every contract runs through 4 independent analysis engines for maximum coverage.</p>
          <div className="features-grid">
            {FEATURES.map((f) => (
              <div key={f.name} className="feature-card">
                <div className="feature-icon">{f.icon}</div>
                <div className="feature-name">{f.name}</div>
                <div className="feature-desc">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="footer">
        <p>Web3 Security Scanner — Open source, AI-powered, locally hosted LLM. No API keys required.</p>
      </footer>
    </>
  );
}
