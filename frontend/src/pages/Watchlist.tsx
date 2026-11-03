import React, { useEffect, useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { API, errorMessage } from "../api";
import Navbar from "../components/Navbar";
import { EVM_ADDRESS, NETWORKS, RISK_COLORS, shortAddress } from "../types";

interface WatchedContract {
  id: number;
  address: string;
  network: string;
  label: string;
  last_scanned: string | null;
  alert_on_new_vuln: boolean;
  rescan_frequency_days: number;
  created_at: string;
  last_scan_summary?: {
    id: string;
    risk_score: number | null;
    risk_level: string | null;
    created_at: string;
    high_vulns: number;
    critical_vulns: number;
  } | null;
}

const FREQUENCIES = [
  { value: 0, label: "Upgrades only" },
  { value: 1, label: "Daily" },
  { value: 7, label: "Weekly" },
  { value: 30, label: "Monthly" },
];

export default function Watchlist() {
  const navigate = useNavigate();
  const [watchlist, setWatchlist] = useState<WatchedContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newAddress, setNewAddress] = useState("");
  const [newNetwork, setNewNetwork] = useState("mainnet");
  const [newLabel, setNewLabel] = useState("");
  const [newFrequency, setNewFrequency] = useState(7);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const fetchWatchlist = () =>
    axios
      .get(`${API}/api/watchlist/`)
      .then((res) => setWatchlist(res.data.results || res.data))
      .catch((err) => setError(errorMessage(err, "Failed to load watchlist.")))
      .finally(() => setLoading(false));

  useEffect(() => {
    fetchWatchlist();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const address = newAddress.trim();
    if (!EVM_ADDRESS.test(address)) {
      setError("Please enter a valid contract address (0x + 40 hex chars).");
      return;
    }
    setAdding(true);
    try {
      await axios.post(`${API}/api/watchlist/`, {
        address,
        network: newNetwork,
        label: newLabel.trim(),
        rescan_frequency_days: newFrequency,
      });
      setNewAddress("");
      setNewLabel("");
      await fetchWatchlist();
    } catch (err) {
      setError(errorMessage(err, "Failed to add to watchlist."));
    } finally {
      setAdding(false);
    }
  };

  const update = async (item: WatchedContract, patch: Partial<WatchedContract>) => {
    setBusyId(item.id);
    setWatchlist((list) => list.map((w) => (w.id === item.id ? { ...w, ...patch } : w)));
    try {
      await axios.patch(`${API}/api/watchlist/${item.id}/`, patch);
    } catch (err) {
      setError(errorMessage(err, "Failed to update."));
      fetchWatchlist();
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (item: WatchedContract) => {
    if (!window.confirm(`Stop watching ${item.label || item.address}?`)) return;
    setBusyId(item.id);
    try {
      await axios.delete(`${API}/api/watchlist/${item.id}/`);
      setWatchlist((list) => list.filter((w) => w.id !== item.id));
    } catch (err) {
      setError(errorMessage(err, "Failed to remove."));
    } finally {
      setBusyId(null);
    }
  };

  const handleRescan = async (item: WatchedContract) => {
    setBusyId(item.id);
    try {
      const res = await axios.post(`${API}/api/scans/create/`, { address: item.address, network: item.network });
      navigate(`/scan/${res.data.id}`);
    } catch (err) {
      setError(errorMessage(err, "Failed to start scan."));
      setBusyId(null);
    }
  };

  return (
    <>
      <Navbar />
      <div className="page">
        <div className="container">
          <div className="page-header">
            <h1 className="page-title">PORTFOLIO WATCHLIST</h1>
          </div>

          <div className="card" style={{ marginBottom: 28, padding: 24 }}>
            <h3 style={{ marginBottom: 6 }}>Add contract</h3>
            <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
              We fingerprint the deployed bytecode (and proxy implementation) daily and rescan automatically when it changes.
              You can also schedule periodic rescans. Configure alert channels in <Link to="/settings" style={{ color: "var(--blue-bright)" }}>Settings</Link>.
            </p>
            <form onSubmit={handleAdd} className="toolbar" style={{ alignItems: "flex-end", marginBottom: 0 }}>
              <div style={{ flex: "2 1 260px" }}>
                <label className="field-label" htmlFor="wl-address">Address</label>
                <input id="wl-address" type="text" className="form-input" style={{ width: "100%" }} required
                  value={newAddress} onChange={(e) => setNewAddress(e.target.value)} placeholder="0x…" spellCheck={false} />
              </div>
              <div style={{ flex: "1 1 150px" }}>
                <label className="field-label" htmlFor="wl-network">Network</label>
                <select id="wl-network" className="form-select" style={{ width: "100%" }} value={newNetwork} onChange={(e) => setNewNetwork(e.target.value)}>
                  {NETWORKS.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
                </select>
              </div>
              <div style={{ flex: "1 1 150px" }}>
                <label className="field-label" htmlFor="wl-label">Label (optional)</label>
                <input id="wl-label" type="text" className="form-input" style={{ width: "100%" }} maxLength={100}
                  value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Yield Vault" />
              </div>
              <div style={{ flex: "1 1 140px" }}>
                <label className="field-label" htmlFor="wl-freq">Rescan</label>
                <select id="wl-freq" className="form-select" style={{ width: "100%" }} value={newFrequency} onChange={(e) => setNewFrequency(Number(e.target.value))}>
                  {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <button type="submit" className="btn btn-primary" disabled={adding}>{adding ? "Adding…" : "Add"}</button>
            </form>
          </div>

          {error && <div className="notice notice-red" role="alert">{error}</div>}

          <div className="card table-wrap" style={{ padding: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Contract</th>
                  <th>Network</th>
                  <th>Latest result</th>
                  <th>Rescan</th>
                  <th>Alerts</th>
                  <th>Last scanned</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="empty-state">Loading…</td></tr>
                ) : watchlist.length === 0 ? (
                  <tr><td colSpan={7} className="empty-state">Your watchlist is empty.</td></tr>
                ) : (
                  watchlist.map((item) => {
                    const s = item.last_scan_summary;
                    return (
                      <tr key={item.id}>
                        <td>
                          <div style={{ fontWeight: 700 }}>{item.label || "—"}</div>
                          <div className="mono muted" style={{ fontSize: 12 }} title={item.address}>{shortAddress(item.address)}</div>
                        </td>
                        <td><span className="status-chip">{item.network}</span></td>
                        <td style={{ fontSize: 13 }}>
                          {s ? (
                            <Link to={`/report/${s.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                              <strong style={{ color: RISK_COLORS[s.risk_level || ""] ?? "var(--text-2)" }}>
                                {s.risk_level || "—"} {s.risk_score != null ? `(${Math.round(s.risk_score)})` : ""}
                              </strong>
                              <div className="mono" style={{ fontSize: 11 }}>
                                <span style={{ color: "var(--red)" }}>{s.critical_vulns}C</span> ·{" "}
                                <span style={{ color: "var(--orange)" }}>{s.high_vulns}H</span> · view →
                              </div>
                            </Link>
                          ) : (
                            <span className="muted">No scans yet</span>
                          )}
                        </td>
                        <td>
                          <select
                            className="form-select"
                            style={{ padding: "6px 10px", fontSize: 12 }}
                            value={item.rescan_frequency_days}
                            disabled={busyId === item.id}
                            onChange={(e) => update(item, { rescan_frequency_days: Number(e.target.value) })}
                            aria-label="Rescan frequency"
                          >
                            {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                            {!FREQUENCIES.some((f) => f.value === item.rescan_frequency_days) && (
                              <option value={item.rescan_frequency_days}>Every {item.rescan_frequency_days} days</option>
                            )}
                          </select>
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={item.alert_on_new_vuln}
                            disabled={busyId === item.id}
                            onChange={(e) => update(item, { alert_on_new_vuln: e.target.checked })}
                            aria-label="Alert on changes"
                            style={{ width: 18, height: 18, accentColor: "var(--yellow)" }}
                          />
                        </td>
                        <td className="muted" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                          {item.last_scanned ? new Date(item.last_scanned).toLocaleDateString() : "Never"}
                        </td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <button className="btn btn-primary btn-sm" disabled={busyId === item.id} onClick={() => handleRescan(item)}>
                            ↻ Scan
                          </button>{" "}
                          <button className="btn btn-danger btn-sm" disabled={busyId === item.id} onClick={() => handleDelete(item)} aria-label="Remove from watchlist">
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
