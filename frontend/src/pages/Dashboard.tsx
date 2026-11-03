import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { API, errorMessage } from "../api";
import Navbar from "../components/Navbar";
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
      const [list, st] = await Promise.all([
        axios.get(`${API}/api/scans/`),
        axios.get(`${API}/api/scans/stats/`),
      ]);
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

  // Keep running scans fresh without a manual reload.
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
        (!statusFilter ||
          (statusFilter === "active" ? ACTIVE_STATUSES.includes(s.status) : s.status === statusFilter)) &&
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

  const compareReady =
    selected.length === 2 && selected.every((id) => scans.find((s) => s.id === id)?.status === "complete");

  return (
    <>
      <Navbar />
      <div className="page">
        <div className="container">
          <div className="page-header">
            <h1 className="page-title">DASHBOARD</h1>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button
                className="btn btn-outline btn-sm"
                disabled={!compareReady}
                title={compareReady ? "Compare the two selected scans" : "Select two completed scans to compare"}
                onClick={() => navigate(`/diff?a=${selected[0]}&b=${selected[1]}`)}
              >
                ⇄ Compare selected ({selected.length}/2)
              </button>
              <Link to="/" className="btn btn-primary btn-sm">+ New Scan</Link>
            </div>
          </div>

          {stats && (
            <div className="kpi-grid">
              <div className="kpi">
                <div className="kpi-value">{stats.total}</div>
                <div className="kpi-label">Total scans</div>
              </div>
              <div className="kpi">
                <div className="kpi-value" style={{ color: "var(--yellow)" }}>{stats.active}</div>
                <div className="kpi-label">Running</div>
              </div>
              <div className="kpi">
                <div className="kpi-value">{stats.avg_risk ?? "—"}</div>
                <div className="kpi-label">Avg risk score</div>
              </div>
              <div className="kpi">
                <div className="kpi-value" style={{ color: "var(--red)" }}>{stats.critical_findings}</div>
                <div className="kpi-label">Open critical findings</div>
              </div>
              <div className="kpi">
                <div className="kpi-value" style={{ color: stats.honeypots ? "var(--red)" : undefined }}>{stats.honeypots}</div>
                <div className="kpi-label">Honeypots flagged</div>
              </div>
              <Link to="/watchlist" className="kpi" style={{ textDecoration: "none", color: "inherit" }}>
                <div className="kpi-value" style={{ color: "var(--blue-bright)" }}>{stats.watchlist}</div>
                <div className="kpi-label">Watched contracts →</div>
              </Link>
            </div>
          )}

          {error && <div className="notice notice-red" role="alert">{error}</div>}

          <div className="toolbar">
            <input
              className="form-input"
              style={{ flex: "1 1 240px" }}
              placeholder="Search address or contract name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search scans"
            />
            <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
              <option value="">All statuses</option>
              <option value="complete">Complete</option>
              <option value="active">Running</option>
              <option value="failed">Failed</option>
            </select>
            <select className="form-select" value={networkFilter} onChange={(e) => setNetworkFilter(e.target.value)} aria-label="Filter by network">
              <option value="">All networks</option>
              {NETWORKS.map((n) => (
                <option key={n.value} value={n.value}>{n.label}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="empty-state">Loading scans…</div>
          ) : scans.length === 0 ? (
            <div className="card empty-state">
              <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
              <p>No scans yet. Start by scanning a smart contract.</p>
              <Link to="/" className="btn btn-primary btn-sm" style={{ marginTop: 16 }}>Scan a contract</Link>
            </div>
          ) : (
            <div className="card table-wrap" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }} aria-label="Select" />
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
                    <tr>
                      <td colSpan={8} className="empty-state">No scans match these filters.</td>
                    </tr>
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
                          <div style={{ fontWeight: 700 }}>
                            {scan.contract_name || "Unknown"}
                            {scan.is_proxy && <span className="swc-chip" style={{ marginLeft: 8 }}>PROXY</span>}
                            {scan.is_honeypot && <span className="honeypot-badge" style={{ marginLeft: 8, fontSize: 10, padding: "2px 6px" }}>HONEYPOT</span>}
                          </div>
                          <div className="mono muted" style={{ fontSize: 12 }}>{shortAddress(scan.address)}</div>
                        </td>
                        <td><span className="status-chip">{scan.network}</span></td>
                        <td>
                          <span className={`status-chip ${statusClass(scan.status)}`}>
                            {active ? `${scan.status.replace("_", " ")} ${scan.progress}%` : scan.status}
                          </span>
                        </td>
                        <td className="mono">
                          {scan.risk_score != null ? (
                            <span style={{ color: RISK_COLORS[scan.risk_level] ?? "var(--text-2)" }}>
                              {Math.round(scan.risk_score)}/100
                            </span>
                          ) : "—"}
                        </td>
                        <td className="mono" style={{ fontSize: 13 }}>
                          {scan.status === "complete" ? (
                            <>
                              {scan.finding_count}
                              {scan.critical_count > 0 && <span style={{ color: "var(--red)" }}> · {scan.critical_count}C</span>}
                              {scan.high_count > 0 && <span style={{ color: "var(--orange)" }}> · {scan.high_count}H</span>}
                            </>
                          ) : "—"}
                        </td>
                        <td className="muted" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                          {new Date(scan.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <Link
                            to={active ? `/scan/${scan.id}` : `/report/${scan.id}`}
                            className="btn btn-secondary btn-sm"
                          >
                            {active ? "Progress" : "View"}
                          </Link>{" "}
                          {!active && (
                            <button className="btn btn-outline btn-sm" disabled={busy === scan.id} onClick={() => handleRescan(scan)} title="Scan this contract again">
                              ↻
                            </button>
                          )}{" "}
                          <button className="btn btn-danger btn-sm" disabled={busy === scan.id} onClick={() => handleDelete(scan)} aria-label="Delete scan">
                            ✕
                          </button>
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
    </>
  );
}
