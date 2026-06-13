import React, { useState, FormEvent, ChangeEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";

const API = import.meta.env.VITE_API_BASE_URL || "";

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

    if (network === "solana" && address.length < 32) {
      setError("Please enter a valid Solana program ID.");
      return;
    } else if (network === "aptos" || network === "sui") {
      if (!address.startsWith("0x")) {
        setError("Please enter a valid Move module address (0x...).");
        return;
      }
    } else if (network === "ton" && address.length < 48) {
      setError("Please enter a valid TON address.");
      return;
    } else if (!["solana", "aptos", "sui", "ton"].includes(network) && !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      setError("Please enter a valid Ethereum contract address (0x + 40 hex chars).");
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API}/api/scans/create/`, { address, network });
      navigate(`/scan/${res.data.id}`);
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
          err.message ||
          "Failed to start scan. Is the backend running?"
      );
      setLoading(false);
    }
  };

  return (
    <>
      {/* Navbar */}
      <nav className="navbar">
        <a href="/" className="navbar-logo">
          <div className="logo-icon">🛡️</div>
          WEB3<span className="logo-dot">.</span>SCANNER
        </a>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <span className="nav-badge">AI-POWERED</span>
          <Link to="/dashboard" style={{ color: "var(--text-1)", textDecoration: "none", fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>Dashboard</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero">
        <div className="container hero-inner">
          <div className="hero-eyebrow">⚡ CodeLlama · Slither · Mythril · Honeypot Sim</div>
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
                />
                <div className="input-row">
                  <select
                    id="network-select"
                    className="form-select"
                    value={network}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => setNetwork(e.target.value)}
                  >
                    <option value="mainnet">Ethereum Mainnet</option>
                    <option value="polygon">Polygon</option>
                    <option value="bsc">Binance Smart Chain</option>
                    <option value="arbitrum">Arbitrum</option>
                    <option value="optimism">Optimism</option>
                    <option value="solana">Solana</option>
                    <option value="aptos">Aptos</option>
                    <option value="sui">Sui</option>
                    <option value="ton">TON</option>
                  </select>
                  <button
                    id="scan-submit-btn"
                    type="submit"
                    className="btn btn-primary"
                    disabled={loading}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {loading ? "STARTING..." : "🚀 SCAN NOW"}
                  </button>
                </div>
                {error && <div className="form-error">⚠ {error}</div>}
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
            Every contract runs through 4 independent analysis engines for maximum coverage.
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
          <strong>Web3 Security Scanner</strong> — Open source · AI-powered · Locally hosted LLM · No API keys required.
        </p>
      </footer>
    </>
  );
}
