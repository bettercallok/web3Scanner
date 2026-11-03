import React, { useState, FormEvent, ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, errorMessage } from "../api";
import Navbar from "../components/Navbar";
import { EVM_ADDRESS, NETWORKS } from "../types";

interface Feature {
  icon: string;
  name: string;
  desc: string;
  colorClass: string;
}

const FEATURES: Feature[] = [
  {
    icon: "🔍",
    name: "Static Analysis",
    desc: "Slither scans your contract's AST with 90+ detectors, catching reentrancy, integer overflows, tx.origin misuse, and more in seconds.",
    colorClass: "icon-red",
  },
  {
    icon: "⚙️",
    name: "Symbolic Execution",
    desc: "Mythril mathematically explores every execution path using SMT solvers to prove whether vulnerabilities are truly exploitable.",
    colorClass: "icon-blue",
  },
  {
    icon: "🤖",
    name: "AI Semantic Review",
    desc: "Local LLM (no API key needed) reasons over your full codebase, filters false positives, and explains risks in plain English.",
    colorClass: "icon-yellow",
  },
  {
    icon: "🍯",
    name: "Honeypot Detection",
    desc: "Our simulation engine executes buy+sell sequences against a mainnet fork to detect hidden sell restrictions and rug-pull mechanisms.",
    colorClass: "icon-red",
  },
  {
    icon: "📊",
    name: "Risk Scoring",
    desc: "Every finding is weighted by SWC impact, exploitability, and AI confidence into a 0–100 risk score with actionable thresholds.",
    colorClass: "icon-blue",
  },
  {
    icon: "📄",
    name: "PDF Reports",
    desc: "Beautifully formatted audit reports with executive summaries, code snippets, and remediation steps — ready for stakeholders.",
    colorClass: "icon-yellow",
  },
];

export default function Home() {
  const [address, setAddress] = useState<string>("");
  const [network, setNetwork] = useState<string>("mainnet");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    const trimmed = address.trim();
    if (!EVM_ADDRESS.test(trimmed)) {
      setError("Please enter a valid contract address (0x + 40 hex chars).");
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

  return (
    <>
      <Navbar badge="AI-POWERED" />

      {/* Hero */}
      <section className="hero">
        <div className="container hero-inner">
          <h1 className="hero-title">
            <span className="title-line-1">AUDIT SMART</span>
            <span className="title-line-2">CONTRACTS</span>
            <span className="title-line-3">BEFORE ATTACKERS DO</span>
          </h1>
          <p className="hero-sub">
            Enterprise-grade vulnerability detection in minutes. Static analysis, symbolic execution,
            AI semantic review, and honeypot detection — all in one automated pipeline.
          </p>

          {/* Scan Form */}
          <div className="scan-form-wrapper">
            <div className="scan-form-title">⬡ SCAN A CONTRACT</div>
            <div className="scan-form-sub">
              paste any deployed contract address → get a full security audit
            </div>
            <form onSubmit={handleSubmit}>
              <div className="input-group">
                <input
                  id="contract-address"
                  className={`form-input ${error ? "error" : ""}`}
                  type="text"
                  placeholder="0x742d35Cc6634C0532925a3b8D4C9b4A1b2e3f4a5"
                  value={address}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    setAddress(e.target.value);
                    setError("");
                  }}
                  spellCheck={false}
                  autoComplete="off"
                  aria-label="Contract address"
                  aria-invalid={!!error}
                />
                <div className="input-row">
                  <select
                    id="network-select"
                    className="form-select"
                    value={network}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => setNetwork(e.target.value)}
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
                  <button
                    id="scan-submit-btn"
                    type="submit"
                    className="btn btn-primary"
                    disabled={loading}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {loading ? "STARTING..." : "SCAN NOW"}
                  </button>
                </div>
                {error && <div className="form-error" role="alert">⚠ {error}</div>}
              </div>
            </form>
          </div>

          {/* Stats */}
          <div className="stats-row">
            <div className="stat-card stat-card-red">
              <div className="stat-value stat-red">90+</div>
              <div className="stat-label">Slither Detectors</div>
            </div>
            <div className="stat-card stat-card-blue">
              <div className="stat-value stat-blue">AI</div>
              <div className="stat-label">Semantic Review</div>
            </div>
            <div className="stat-card stat-card-yellow">
              <div className="stat-value stat-yellow">5</div>
              <div className="stat-label">EVM Networks</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="features">
        <div className="container">
          <div className="section-label">// Analysis Pipeline</div>
          <h2 className="section-title">MULTI-LAYER SECURITY</h2>
          <p className="section-sub">
            Every contract runs through 5 independent analysis stages for maximum coverage.
          </p>
          <div className="features-grid">
            {FEATURES.map((f) => (
              <div key={f.name} className="feature-card">
                <div className={`feature-icon-wrap ${f.colorClass}`}>{f.icon}</div>
                <div className="feature-name">{f.name}</div>
                <div className="feature-desc">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="footer">
        <p>
          <strong>Web3 Security Scanner</strong> — Open source · AI-powered · Locally hosted LLM · Export to PDF, SARIF &amp; JSON.
        </p>
      </footer>
    </>
  );
}
