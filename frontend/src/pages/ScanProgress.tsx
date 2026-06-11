import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";

const API = import.meta.env.VITE_API_BASE_URL || "";
const WS_BASE = import.meta.env.VITE_WS_BASE_URL || "ws://localhost:8000";

interface PipelineStep {
  id: string;
  label: string;
  sub: string;
}

interface LogEntry {
  time: string;
  msg: string;
}

interface ScanJob {
  id: string;
  status: string;
  progress: number;
  error_detail?: string;
}

const PIPELINE_STEPS: PipelineStep[] = [
  { id: "fetch",    label: "Fetching Source",       sub: "Retrieving verified code from Etherscan" },
  { id: "slither",  label: "Slither Analysis",       sub: "Running 90+ static detectors" },
  { id: "mythril",  label: "Mythril Symbolic Exec",  sub: "Exploring all execution paths (may take a while)" },
  { id: "honeypot", label: "Honeypot Simulation",    sub: "Simulating buy/sell transactions" },
  { id: "ai",       label: "AI Semantic Review",     sub: "LLM reasoning over business logic" },
  { id: "scoring",  label: "Risk Scoring",           sub: "Calculating weighted vulnerability score" },
  { id: "report",   label: "Generating Report",      sub: "Creating PDF audit report" },
];

function getStepFromProgress(progress: number): number {
  if (progress < 15) return 0;
  if (progress < 40) return 1;
  if (progress < 62) return 2;
  if (progress < 73) return 3;
  if (progress < 90) return 4;
  if (progress < 95) return 5;
  return 6;
}

export default function ScanProgress() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<ScanJob | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [logs, setLogs] = useState<(string | LogEntry)[]>(["🚀 Scan started..."]);
  const [error, setError] = useState<string>("");
  const wsRef = useRef<WebSocket | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-50), { time, msg }]);
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  useEffect(() => {
    const ws = new WebSocket(`${WS_BASE}/ws/scan/${id}/`);
    wsRef.current = ws;

    ws.onmessage = (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      if (data.type === "progress") {
        setProgress(data.progress);
        addLog(data.message);
        if (data.progress >= 100) {
          if (pollRef.current) clearInterval(pollRef.current);
          setTimeout(() => navigate(`/report/${id}`), 1500);
        }
      }
    };

    ws.onerror = () => addLog("WebSocket unavailable — polling for updates...");

    const poll = async () => {
      try {
        const res = await axios.get(`${API}/api/scans/${id}/`);
        const j: ScanJob = res.data;
        setJob(j);
        setProgress(j.progress);
        if (j.status === "failed") {
          setError(j.error_detail || "Scan failed.");
          if (pollRef.current) clearInterval(pollRef.current);
        }
        if (j.status === "complete") {
          if (pollRef.current) clearInterval(pollRef.current);
          setTimeout(() => navigate(`/report/${id}`), 1500);
        }
      } catch {
        setError("Could not reach backend.");
      }
    };

    poll();
    pollRef.current = setInterval(poll, 4000);

    return () => {
      ws.close();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [id, navigate]);

  const activeStep = getStepFromProgress(progress);

  return (
    <>
      <nav className="navbar">
        <a href="/" className="navbar-logo">
          <div className="logo-icon">🛡️</div>
          WEB3<span className="logo-dot">.</span>SCANNER
        </a>
        <span className="nav-badge">SCANNING</span>
      </nav>

      <div className="scan-page">
        <div className="container">
          <h1 className="page-heading">
            <span className="accent-red">SCAN</span>{" "}
            <span className="accent-blue">IN</span>{" "}
            <span className="accent-yellow">PROGRESS</span>
          </h1>
          <div className="address-display">{id}</div>

          {error && (
            <div className="card error-card">
              <div style={{ color: "var(--red)", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", fontSize: "14px" }}>
                ✖ {error}
              </div>
            </div>
          )}

          {/* Progress Bar */}
          <div className="card progress-card">
            <div className="progress-header">
              <span className="progress-label">
                {progress >= 100
                  ? "✔ COMPLETE!"
                  : PIPELINE_STEPS[Math.min(activeStep, 6)].label.toUpperCase()}
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
                    <div
                      className={`step-indicator ${
                        isDone ? "step-done" : isActive ? "step-active" : "step-pending"
                      }`}
                    >
                      {isDone ? "✓" : isActive ? "⟳" : i + 1}
                    </div>
                    <div>
                      <div
                        className="step-name"
                        style={{
                          color: isDone
                            ? "var(--green)"
                            : isActive
                            ? "var(--yellow)"
                            : "var(--text-3)",
                        }}
                      >
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
            {logs.map((log, i) =>
              typeof log === "string" ? (
                <div key={i} className="log-line">
                  <span className="log-msg">{log}</span>
                </div>
              ) : (
                <div key={i} className="log-line">
                  <span className="log-time">[{(log as LogEntry).time}]</span>
                  <span className="log-msg">{(log as LogEntry).msg}</span>
                </div>
              )
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </>
  );
}
