import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { API, errorMessage, scanSocketUrl } from "../api";
import Navbar from "../components/Navbar";

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
  address?: string;
  network?: string;
  contract_name?: string;
}

const PIPELINE_STEPS: PipelineStep[] = [
  { id: "fetch",    label: "Fetching Source",       sub: "Retrieving verified code from Etherscan" },
  { id: "slither",  label: "Slither Analysis",       sub: "Running 90+ static detectors" },
  { id: "mythril",  label: "Mythril Symbolic Exec",  sub: "Exploring all execution paths (may take a while)" },
  { id: "gas",      label: "Gas Optimization",       sub: "Finding costly loops & storage patterns" },
  { id: "honeypot", label: "Honeypot Detection",     sub: "Transfer simulation + ABI red flags" },
  { id: "ai",       label: "AI Semantic Review",     sub: "LLM reasoning over business logic" },
  { id: "scoring",  label: "Risk Scoring",           sub: "Calculating weighted vulnerability score" },
  { id: "report",   label: "Generating Report",      sub: "Creating PDF audit report" },
];

function getStepFromProgress(progress: number): number {
  if (progress < 15) return 0;
  if (progress < 40) return 1;
  if (progress < 62) return 2;
  if (progress < 65) return 3;
  if (progress < 73) return 4;
  if (progress < 90) return 5;
  if (progress < 95) return 6;
  return 7;
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
    if (!id) return;
    let done = false;
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const finish = (target: "report" | "failed", detail?: string) => {
      if (done) return;
      done = true;
      if (pollRef.current) clearInterval(pollRef.current);
      if (target === "failed") setError(detail || "Scan failed.");
      else setTimeout(() => navigate(`/report/${id}`), 1500);
    };

    const connect = () => {
      ws = new WebSocket(scanSocketUrl(id));
      wsRef.current = ws;
      ws.onopen = () => (attempts = 0);
      ws.onmessage = (e: MessageEvent) => {
        let data: any;
        try {
          data = JSON.parse(e.data);
        } catch {
          return;
        }
        if (data.type !== "progress") return;
        if (typeof data.progress === "number") setProgress(data.progress);
        if (data.message) addLog(data.message);
        if (data.status === "failed") finish("failed", data.message);
        else if (data.status === "complete" || data.progress >= 100) finish("report");
      };
      ws.onclose = (ev) => {
        // 4403 = not allowed to watch this scan; don't hammer the server.
        if (done || ev.code === 4403 || attempts >= 5) return;
        attempts += 1;
        retryTimer = setTimeout(connect, Math.min(1000 * 2 ** attempts, 15000));
      };
      ws.onerror = () => {
        if (attempts === 0) addLog("Live updates unavailable — polling for progress...");
      };
    };
    connect();

    const poll = async () => {
      try {
        const res = await axios.get(`${API}/api/scans/${id}/`);
        const j: ScanJob = res.data;
        setJob(j);
        setProgress((p) => Math.max(p, j.progress));
        if (j.status === "failed") finish("failed", j.error_detail);
        if (j.status === "complete") finish("report");
      } catch (err) {
        setError(errorMessage(err, "Could not reach backend."));
      }
    };

    poll();
    pollRef.current = setInterval(poll, 4000);

    return () => {
      done = true;
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [id, navigate]);

  const activeStep = getStepFromProgress(progress);

  return (
    <>
      <Navbar badge={error ? "FAILED" : "SCANNING"} />

      <div className="scan-page">
        <div className="container">
          <h1 className="page-heading">
            <span className="accent-red">SCAN</span>{" "}
            <span className="accent-blue">IN</span>{" "}
            <span className="accent-yellow">PROGRESS</span>
          </h1>
          <div className="address-display">
            {job?.contract_name ? `${job.contract_name} · ` : ""}
            {job?.address ?? id}
            {job?.network ? ` · ${job.network}` : ""}
          </div>

          {error && (
            <div className="card error-card">
              <div style={{ color: "var(--red)", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", fontSize: "14px" }}>
                ✖ {error}
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                <a href="/" className="btn btn-secondary btn-sm">← New scan</a>
                <a href="/dashboard" className="btn btn-outline btn-sm">Dashboard</a>
              </div>
            </div>
          )}

          {/* Progress Bar */}
          <div className="card progress-card">
            <div className="progress-header">
              <span className="progress-label">
                {progress >= 100
                  ? "✔ COMPLETE!"
                  : PIPELINE_STEPS[Math.min(activeStep, PIPELINE_STEPS.length - 1)].label.toUpperCase()}
              </span>
              <span className="progress-pct">{progress}%</span>
            </div>
            <div className="progress-bar-track" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {/* Pipeline Steps */}
          <div className="card">
            <div className="pipeline">
              {PIPELINE_STEPS.map((step, i) => {
                const isDone = i < activeStep;
                const isActive = i === activeStep && progress < 100 && !error;
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
