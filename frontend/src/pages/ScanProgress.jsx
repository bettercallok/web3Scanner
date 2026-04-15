import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
    <>
      <nav className="navbar">
        <a href="/" className="navbar-logo">
          <div className="logo-icon">🛡️</div>
          Web3Scanner
        </a>
        <span className="nav-badge">SCANNING</span>
      </nav>

      <div className="scan-page">
        <div className="container">
          <h1 style={{ fontSize: "24px", fontWeight: 800, marginBottom: "8px" }}>
            🔍 Scanning Contract
          </h1>
          <div className="address-display">{id}</div>

          {error && (
            <div className="card" style={{ borderColor: "rgba(239,68,68,0.4)", marginBottom: "24px" }}>
              <div style={{ color: "var(--red)", fontWeight: 600 }}>❌ {error}</div>
            </div>
          )}

          {/* Progress Bar */}
          <div className="card progress-card">
            <div className="progress-header">
              <span className="progress-label">
                {progress >= 100 ? "✅ Complete!" : PIPELINE_STEPS[Math.min(activeStep, 6)].label}
              </span>
              <span className="progress-pct">{progress}%</span>
            </div>
            <div className="progress-bar-track">
              <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {/* Pipeline Steps */}
          <div className="card">
            <div className="pipeline">
              {PIPELINE_STEPS.map((step, i) => {
                const isDone = i < activeStep;
                const isActive = i === activeStep && progress < 100;
                return (
                  <div key={step.id} className="pipeline-step">
                    <div className={`step-indicator ${isDone ? "step-done" : isActive ? "step-active" : "step-pending"}`}>
                      {isDone ? "✓" : isActive ? "⟳" : i + 1}
                    </div>
                    <div>
                      <div className="step-name" style={{ color: isDone ? "var(--green)" : isActive ? "var(--text-1)" : "var(--text-3)" }}>
                        {step.label}
                      </div>
                      <div className="step-sub">{step.sub}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live Log Feed */}
          <div className="log-feed">
            {logs.map((log, i) => (
              typeof log === "string" ? (
                <div key={i} className="log-line"><span className="log-msg">{log}</span></div>
              ) : (
                <div key={i} className="log-line">
                  <span className="log-time">[{log.time}]</span>
                  <span className="log-msg">{log.msg}</span>
                </div>
              )
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </>
  );
}
