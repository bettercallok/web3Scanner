import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { GradientHeading } from "../components/ui/gradient-heading";
import axios from "axios";

const API = import.meta.env.VITE_API_BASE_URL || "";
const WS_BASE = import.meta.env.VITE_WS_BASE_URL || "ws://localhost:8000";

const PIPELINE_STEPS = [
  { id: "fetch",   label: "Fetching Source",        sub: "Retrieving verified code from Etherscan" },
  { id: "slither", label: "Slither Analysis",        sub: "Running 90+ static detectors" },
  { id: "mythril", label: "Mythril Symbolic Exec",   sub: "Exploring all execution paths (may take a while)" },
  { id: "honeypot",label: "Honeypot Simulation",     sub: "Simulating buy/sell transactions" },
  { id: "ai",      label: "AI Semantic Review",      sub: "CodeLlama reasoning over business logic" },
  { id: "scoring", label: "Risk Scoring",            sub: "Calculating weighted vulnerability score" },
  { id: "report",  label: "Generating Report",       sub: "Creating PDF audit report" },
];

function getStepFromProgress(progress) {
  if (progress < 15) return 0;
  if (progress < 40) return 1;
  if (progress < 62) return 2;
  if (progress < 73) return 3;
  if (progress < 90) return 4;
  if (progress < 95) return 5;
  return 6;
}

export default function ScanProgress() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState(["🚀 Scan started..."]);
  const [error, setError] = useState("");
  const wsRef = useRef(null);
  const logEndRef = useRef(null);
  const pollRef = useRef(null);

  const addLog = (msg) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-50), { time, msg }]);
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  useEffect(() => {
    // Connect WebSocket for real-time updates
    const ws = new WebSocket(`${WS_BASE}/ws/scan/${id}/`);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "progress") {
        setProgress(data.progress);
        addLog(data.message);
        if (data.progress >= 100) {
          clearInterval(pollRef.current);
          setTimeout(() => navigate(`/report/${id}`), 1500);
        }
      }
    };

    ws.onerror = () => addLog("WebSocket unavailable — polling for updates...");

    // Fallback HTTP polling every 4 seconds
    const poll = async () => {
      try {
        const res = await axios.get(`${API}/api/scans/${id}/`);
        const j = res.data;
        setJob(j);
        setProgress(j.progress);
        if (j.status === "failed") {
          setError(j.error_detail || "Scan failed.");
          clearInterval(pollRef.current);
        }
        if (j.status === "complete") {
          clearInterval(pollRef.current);
          setTimeout(() => navigate(`/report/${id}`), 1500);
        }
      } catch (e) {
        setError("Could not reach backend.");
      }
    };

    poll();
    pollRef.current = setInterval(poll, 4000);

    return () => {
      ws.close();
      clearInterval(pollRef.current);
    };
  }, [id, navigate]);

  const activeStep = getStepFromProgress(progress);

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
        <div className="px-3 py-1 text-xs font-semibold tracking-wider text-purple-300 uppercase bg-purple-500/10 border border-purple-500/20 rounded-full animate-pulse">
          SCANNING
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-16">
        <div className="text-center mb-12">
          <GradientHeading size="lg" className="mb-4">
            🔍 Scanning Contract
          </GradientHeading>
          <p className="text-gray-400 flex items-center justify-center gap-2 font-mono text-sm bg-white/5 border border-white/10 w-fit mx-auto px-4 py-2 rounded-lg">
            <span>Target:</span>
            <span className="text-purple-300">{id}</span>
          </p>
        </div>

        {error && (
          <div className="mb-8 p-6 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
            <h3 className="text-red-400 font-semibold mb-2">Scan Error</h3>
            <p className="text-red-300/80 text-sm mb-4">❌ {error}</p>
            <Link to="/" className="inline-flex items-center justify-center px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors text-sm font-medium">
              Try Another Scan
            </Link>
          </div>
        )}

        <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 md:p-8 shadow-2xl relative overflow-hidden mb-8">
          {/* Subtle animated background glow */}
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl"></div>

          {/* Progress Bar */}
          <div className="relative z-10 mb-8 p-6 bg-black/40 border border-white/5 rounded-xl">
            <div className="flex justify-between items-end mb-3">
              <span className="text-sm font-semibold text-gray-300 tracking-wide uppercase">
                {progress >= 100 ? "✅ Complete!" : PIPELINE_STEPS[Math.min(activeStep, 6)].label}
              </span>
              <span className="text-2xl font-mono font-bold text-white">{progress}%</span>
            </div>
            <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden border border-white/10 relative">
              <div
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-purple-500 to-cyan-500 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
              <div className="absolute top-0 left-0 h-full w-full bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.2)_50%,transparent_100%)] animate-[shimmer_2s_infinite]" style={{ transform: 'translateX(-100%)' }} />
            </div>
          </div>

          {/* Pipeline Steps */}
          <div className="relative z-10 space-y-4">
            {PIPELINE_STEPS.map((step, i) => {
              const isDone = i < activeStep;
              const isActive = i === activeStep && progress < 100;

              let bgClass = "bg-white/[0.02]";
              let borderClass = "border-white/5";
              let textClass = "text-gray-500";
              let iconClass = "bg-white/5 text-gray-500 border-white/10";

              if (isActive) {
                bgClass = "bg-purple-500/5";
                borderClass = "border-purple-500/30";
                textClass = "text-white";
                iconClass = "bg-purple-500/20 text-purple-400 border-purple-500/30";
              } else if (isDone) {
                bgClass = "bg-emerald-500/5";
                borderClass = "border-emerald-500/20";
                textClass = "text-emerald-400";
                iconClass = "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
              }

              return (
                <div key={step.id} className={`flex items-center gap-4 p-4 rounded-xl border ${bgClass} ${borderClass} transition-all duration-300`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border ${iconClass} shrink-0`}>
                    {isDone ? "✓" : isActive ? <span className="animate-spin text-lg">⟳</span> : i + 1}
                  </div>
                  <div>
                    <div className={`font-semibold ${textClass}`}>
                      {step.label}
                    </div>
                    <div className="text-sm text-gray-500">{step.sub}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Log Feed */}
        <div className="bg-[#0d1117] border border-white/10 rounded-xl overflow-hidden shadow-2xl flex flex-col h-64 relative z-10">
          <div className="px-4 py-2 bg-white/5 border-b border-white/10 text-xs font-mono text-gray-400 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Execution Logs
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-xs md:text-sm">
            {logs.map((log, i) => (
              typeof log === "string" ? (
                <div key={i} className="text-gray-300">{log}</div>
              ) : (
                <div key={i} className="flex gap-3 text-gray-300">
                  <span className="text-gray-500 shrink-0">[{log.time}]</span>
                  <span className="text-emerald-400/80">{log.msg}</span>
                </div>
              )
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </div>

  );
}
