import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { API, errorMessage } from "../api";
import Icon from "../components/Icon";
import { ACTIVE_STATUSES, NETWORKS, RISK_COLORS, ScanListItem, shortAddress } from "../types";

interface Stats {
  total: number;
  complete: number;
  failed: number;
  active: number;
  honeypots: number;
  avg_risk: number | null;
  critical_findings: number;
  watchlist: number;
  by_risk_level: Record<string, number>;
}

function statusClass(status: string) {
  if (status === "complete") return "status-complete";
  if (status === "failed") return "status-failed";
  if (ACTIVE_STATUSES.includes(status)) return "status-active";
  return "";
}

function statusLabel(s: ScanListItem) {
  if (ACTIVE_STATUSES.includes(s.status)) return `${s.status === "ai_review" ? "AI review" : s.status.charAt(0).toUpperCase() + s.status.slice(1)} · ${s.progress}%`;
  return s.status.charAt(0).toUpperCase() + s.status.slice(1);
}

function RiskBar({ stats }: { stats: Stats }) {
  const levels = ["Critical", "High", "Medium", "Low"];
  const total = levels.reduce((a, l) => a + (stats.by_risk_level[l] || 0), 0);
  if (!total) return <div className="muted" style={{ fontSize: 13 }}>No completed scans yet.</div>;
  return (
    <>
      <div style={{ display: "flex", height: 8, borderRadius: 999, overflow: "hidden", background: "var(--surface-3)" }}>
        {levels.map((l) => {
          const n = stats.by_risk_level[l] || 0;
          return n ? <div key={l} title={`${l}: ${n}`} style={{ width: `${(n / total) * 100}%`, background: RISK_COLORS[l] }} /> : null;
        })}
      </div>
      <div className="legend" style={{ marginTop: 10, marginBottom: 0 }}>
        {levels.map((l) => (
          <span key={l}><i style={{ background: RISK_COLORS[l] }} />{l} · {stats.by_risk_level[l] || 0}</span>
        ))}
      </div>
    </>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [scans, setScans] = useState<ScanListItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [networkFilter, setNetworkFilter] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, st] = await Promise.all([axios.get(`${API}/api/scans/`), axios.get(`${API}/api/scans/stats/`)]);
      setScans(list.data.results || list.data);
      setStats(st.data);
      setError("");
    } catch (err) {
      setError(errorMessage(err, "Failed to load scans."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const hasActive = scans.some((s) => ACTIVE_STATUSES.includes(s.status));
  useEffect(() => {
    if (!hasActive) return;
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [hasActive, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scans.filter(
      (s) =>
        (!q || s.address.toLowerCase().includes(q) || (s.contract_name || "").toLowerCase().includes(q)) &&
        (!statusFilter || (statusFilter === "active" ? ACTIVE_STATUSES.includes(s.status) : s.status === statusFilter)) &&
        (!networkFilter || s.network === networkFilter)
    );
  }, [scans, query, statusFilter, networkFilter]);

  const toggleSelect = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev.slice(-1), id]));

  const handleDelete = async (scan: ScanListItem) => {
    if (!window.confirm(`Delete the scan of ${scan.contract_name || scan.address}? This cannot be undone.`)) return;
    setBusy(scan.id);
    try {
      await axios.delete(`${API}/api/scans/${scan.id}/`);
      setSelected((prev) => prev.filter((x) => x !== scan.id));
      await load();
    } catch (err) {
      setError(errorMessage(err, "Failed to delete scan."));
    } finally {
      setBusy(null);
    }
  };

  const handleRescan = async (scan: ScanListItem) => {
    setBusy(scan.id);
    try {
      const res = await axios.post(`${API}/api/scans/create/`, { address: scan.address, network: scan.network });
      navigate(`/scan/${res.data.id}`);
    } catch (err) {
      setError(errorMessage(err, "Failed to start rescan."));
      setBusy(null);
    }
  };

  const compareReady = selected.length === 2 && selected.every((id) => scans.find((s) => s.id === id)?.status === "complete");

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Scans</h1>
            <p className="page-subtitle">Every contract you've analysed, newest first.</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="btn btn-secondary"
              disabled={!compareReady}
              title={compareReady ? "Compare the two selected scans" : "Select two completed scans to compare"}
              onClick={() => navigate(`/diff?a=${selected[0]}&b=${selected[1]}`)}
            >
              <Icon name="compare" size={16} /> Compare{selected.length ? ` (${selected.length}/2)` : ""}
            </button>
            <Link to="/" className="btn btn-primary"><Icon name="plus" size={16} /> New scan</Link>
          </div>
        </div>

        {stats && (
          <>
            <div className="kpi-grid">
              <div className="kpi"><div className="kpi-label">Total scans</div><div className="kpi-value">{stats.total}</div></div>
              <div className="kpi"><div className="kpi-label">Running</div><div className="kpi-value" style={{ color: stats.active ? "var(--accent-text)" : undefined }}>{stats.active}</div></div>
              <div className="kpi"><div className="kpi-label">Average risk</div><div className="kpi-value">{stats.avg_risk ?? "—"}</div></div>
              <div className="kpi"><div className="kpi-label">Open critical findings</div><div className="kpi-value" style={{ color: stats.critical_findings ? "var(--sev-critical)" : undefined }}>{stats.critical_findings}</div></div>
              <div className="kpi"><div className="kpi-label">Honeypots flagged</div><div className="kpi-value" style={{ color: stats.honeypots ? "var(--sev-critical)" : undefined }}>{stats.honeypots}</div></div>
            </div>
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="card-header" style={{ marginBottom: 12 }}>
                <span className="card-title">Risk distribution</span>
                <span className="card-sub">{stats.complete} completed scans</span>
              </div>
              <RiskBar stats={stats} />
            </div>
          </>
        )}

        {error && <div className="notice notice-red" role="alert">{error}</div>}

        <div className="toolbar">
          <div style={{ position: "relative", flex: "1 1 260px" }}>
            <span style={{ position: "absolute", left: 10, top: 11, color: "var(--text-3)" }}><Icon name="search" size={16} /></span>
            <input className="form-input input-block" style={{ paddingLeft: 34 }} placeholder="Search by address or contract name" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search scans" />
          </div>
          <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="complete">Complete</option>
            <option value="active">Running</option>
            <option value="failed">Failed</option>
          </select>
          <select className="form-select" value={networkFilter} onChange={(e) => setNetworkFilter(e.target.value)} aria-label="Filter by network">
            <option value="">All networks</option>
            {NETWORKS.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="card muted">Loading scans…</div>
        ) : scans.length === 0 ? (
          <div className="card empty-state">
            <div className="empty-icon"><Icon name="search" size={20} /></div>
            <h3>No scans yet</h3>
            <p style={{ marginBottom: 16 }}>Scan your first contract to see results here.</p>
            <Link to="/" className="btn btn-primary">Scan a contract</Link>
          </div>
        ) : (
          <div className="card table-wrap" style={{ padding: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }} aria-label="Select" />
                  <th>Contract</th>
                  <th>Network</th>
                  <th>Status</th>
                  <th>Risk</th>
                  <th>Findings</th>
                  <th>Date</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="empty-state">No scans match these filters.</td></tr>
                )}
                {filtered.map((scan) => {
                  const active = ACTIVE_STATUSES.includes(scan.status);
                  return (
                    <tr key={scan.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.includes(scan.id)}
                          disabled={scan.status !== "complete"}
                          onChange={() => toggleSelect(scan.id)}
                          aria-label={`Select ${scan.contract_name || scan.address} for comparison`}
                        />
                      </td>
                      <td>
                        <Link to={active ? `/scan/${scan.id}` : `/report/${scan.id}`} style={{ textDecoration: "none" }}>
                          <div className="cell-title">
                            {scan.contract_name || "Unknown contract"}
                            {scan.is_proxy && <span className="status-chip plain">Proxy</span>}
                            {scan.is_honeypot && <span className="honeypot-badge">Honeypot</span>}
                          </div>
                          <div className="cell-sub">{shortAddress(scan.address)}</div>
                        </Link>
                      </td>
                      <td className="muted">{NETWORKS.find((n) => n.value === scan.network)?.label ?? scan.network}</td>
                      <td><span className={`status-chip ${statusClass(scan.status)}`}>{statusLabel(scan)}</span></td>
                      <td>
                        {scan.risk_score != null ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", color: RISK_COLORS[scan.risk_level] ?? "var(--text-2)" }}>
                              {Math.round(scan.risk_score)}
                            </span>
                            <span className="muted" style={{ fontSize: 12 }}>{scan.risk_level}</span>
                          </span>
                        ) : <span className="muted">—</span>}
                      </td>
                      <td>
                        {scan.status === "complete" ? (
                          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                            <span style={{ fontVariantNumeric: "tabular-nums" }}>{scan.finding_count}</span>
                            {scan.critical_count > 0 && <span className="sev-label label-critical">{scan.critical_count} critical</span>}
                            {scan.high_count > 0 && <span className="sev-label label-high">{scan.high_count} high</span>}
                          </span>
                        ) : <span className="muted">—</span>}
                      </td>
                      <td className="muted" style={{ whiteSpace: "nowrap" }}>{new Date(scan.created_at).toLocaleDateString()}</td>
                      <td style={{ textAlign: "right" }}>
                        <span className="row-actions">
                          {!active && (
                            <button className="icon-btn" disabled={busy === scan.id} onClick={() => handleRescan(scan)} title="Scan again" aria-label="Scan again">
                              <Icon name="refresh" size={15} />
                            </button>
                          )}
                          <button className="icon-btn" disabled={busy === scan.id} onClick={() => handleDelete(scan)} title="Delete scan" aria-label="Delete scan">
                            <Icon name="trash" size={15} />
                          </button>
                          <Link to={active ? `/scan/${scan.id}` : `/report/${scan.id}`} className="btn btn-outline btn-sm">
                            {active ? "Progress" : "Open"}
                          </Link>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
