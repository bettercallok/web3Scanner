import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { GradientHeading } from "../components/ui/gradient-heading";

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
    <div className="min-h-screen bg-background relative overflow-hidden text-foreground selection:bg-purple-500/30">
      {/* Background Grid */}
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none [mask-image:linear-gradient(to_bottom,white,transparent)]">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+CjxyZWN0IHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgZmlsbD0ibm9uZSIvPgo8Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIxIiBmaWxsPSJyZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMSkiLz4KPC9zdmc+')] bg-repeat" />
      </div>

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 md:px-12 backdrop-blur-sm border-b border-white/5">
        <a href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20 group-hover:shadow-purple-500/40 transition-shadow">
            <span className="text-white text-lg">🛡️</span>
          </div>
          <span className="font-bold text-xl tracking-tight text-white">Web3Scanner</span>
        </a>
        <div className="px-3 py-1 text-xs font-semibold tracking-wider text-purple-300 uppercase bg-purple-500/10 border border-purple-500/20 rounded-full">
          AI-POWERED
        </div>
      </nav>

      <main className="relative z-10 flex flex-col items-center justify-center px-4 pt-20 pb-32 text-center max-w-5xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 mb-8 text-sm text-gray-300 bg-white/5 border border-white/10 rounded-full">
          <span className="text-yellow-500">⚡</span> Powered by CodeLlama + Slither + Mythril
        </div>

        <GradientHeading size="xl" weight="bold" variant="light" className="mb-6 max-w-4xl mx-auto !leading-[1.1]">
          Audit Smart Contracts <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400">
            Before Attackers Do
          </span>
        </GradientHeading>

        <p className="max-w-2xl mb-12 text-lg text-gray-400 leading-relaxed">
          Enterprise-grade vulnerability detection in minutes. Static analysis, symbolic execution,
          AI semantic review, and honeypot detection — all in one automated pipeline.
        </p>

        {/* Scan Form */}
        <div className="w-full max-w-2xl p-6 mb-16 bg-white/[0.03] border border-white/10 rounded-2xl backdrop-blur-md shadow-2xl">
          <div className="mb-6 text-left">
            <h3 className="text-xl font-semibold text-white mb-2 flex items-center gap-2">
              <span className="text-purple-400">🔎</span> Scan a Contract
            </h3>
            <p className="text-sm text-gray-400">Paste any deployed contract address to begin a full security audit.</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500 to-cyan-500 rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
              <input
                id="contract-address"
                className={`relative w-full px-5 py-4 text-white bg-black/50 border ${error ? "border-red-500" : "border-white/10"} rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-mono text-sm transition-all`}
                type="text"
                placeholder="0x742d35Cc6634C0532925a3b8D4C9b4A1b2e3f4a5"
                value={address}
                onChange={(e) => { setAddress(e.target.value); setError(""); }}
                spellCheck={false}
                autoComplete="off"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-stretch justify-between w-full h-[56px]">
              <div className="relative flex-grow">
                <select
                  id="network-select"
                  className="w-full h-full min-h-[56px] px-5 py-4 text-white bg-black/50 border border-white/10 rounded-xl appearance-none focus:outline-none focus:ring-2 focus:ring-purple-500/50 cursor-pointer"
                  value={network}
                  onChange={(e) => setNetwork(e.target.value)}
                >
                  <option value="mainnet">Ethereum Mainnet</option>
                  <option value="polygon">Polygon</option>
                  <option value="bsc">Binance Smart Chain</option>
                  <option value="arbitrum">Arbitrum</option>
                  <option value="optimism">Optimism</option>
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-gray-400">
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" fillRule="evenodd"></path></svg>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="relative inline-flex h-[56px] items-center justify-center px-8 py-2 overflow-hidden font-medium text-white transition-all duration-300 bg-purple-600 rounded-xl hover:bg-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed group whitespace-nowrap"
              >
                <span className="absolute inset-0 w-full h-full -mt-1 rounded-lg opacity-30 bg-gradient-to-b from-transparent via-transparent to-black"></span>
                <span className="relative flex items-center gap-2">
                  {loading ? (
                    <>
                      <svg className="w-5 h-5 text-white animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      Starting...
                    </>
                  ) : (
                    <>🚀 Scan Now</>
                  )}
                </span>
              </button>
            </div>
            {error && <div className="text-red-400 text-sm text-left mt-2 flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>{error}</div>}
          </form>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-3xl mb-32">
          {[
            { value: "90+", label: "Slither Detectors", color: "text-purple-400" },
            { value: "7B", label: "Parameter AI Model", color: "text-cyan-400" },
            { value: "5", label: "EVM Networks", color: "text-green-400" },
          ].map((stat, i) => (
            <div key={i} className="flex flex-col items-center justify-center p-6 bg-white/[0.02] border border-white/5 rounded-2xl">
              <div className={`text-4xl font-bold ${stat.color} mb-2`}>{stat.value}</div>
              <div className="text-sm text-gray-400 font-medium">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Features */}
        <div className="w-full">
          <GradientHeading size="lg" weight="bold" className="mb-4 text-center">
            Multi-Layer Security Analysis
          </GradientHeading>
          <p className="text-gray-400 mb-12 text-center max-w-2xl mx-auto">
            Every contract runs through 4 independent analysis engines for maximum coverage.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
            {FEATURES.map((f, i) => (
              <div key={i} className="p-6 bg-white/[0.02] border border-white/10 rounded-2xl hover:bg-white/[0.04] transition-colors group">
                <div className="w-12 h-12 mb-4 rounded-xl bg-white/5 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                  {f.icon}
                </div>
                <h4 className="text-lg font-semibold text-white mb-2">{f.name}</h4>
                <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="relative z-10 py-8 text-center text-gray-500 text-sm border-t border-white/10 bg-black/20">
        <p>Web3 Security Scanner — Open source, AI-powered, locally hosted LLM. No API keys required.</p>
      </footer>
    </div>
  );
}
