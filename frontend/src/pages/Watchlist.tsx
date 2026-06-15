import React, { useState, useEffect } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const API = import.meta.env.VITE_API_BASE_URL || "";

interface WatchedContract {
  id: number;
  address: string;
  network: string;
  label: string;
  last_scanned: string | null;
  alert_on_new_vuln: boolean;
  created_at: string;
  last_scan_summary?: {
    id: string;
    risk_score: number | null;
    risk_level: string | null;
    created_at: string;
    high_vulns: number;
    critical_vulns: number;
  };
}

export default function Watchlist() {
  const { user } = useAuth();
  const [watchlist, setWatchlist] = useState<WatchedContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  
  // Add new state
  const [newAddress, setNewAddress] = useState("");
  const [newNetwork, setNewNetwork] = useState("mainnet");
  const [newLabel, setNewLabel] = useState("");
  const [addError, setAddError] = useState("");
  const [rescanStatus, setRescanStatus] = useState<Record<number, "idle" | "loading" | "success" | "error">>({});

  useEffect(() => {
    fetchWatchlist();
  }, []);

  const fetchWatchlist = () => {
    axios.get(`${API}/api/watchlist/`)
      .then(res => setWatchlist(res.data.results || res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError("");
    try {
      await axios.post(`${API}/api/watchlist/`, {
        address: newAddress.toLowerCase(),
        network: newNetwork,
        label: newLabel,
      });
      setNewAddress("");
      setNewLabel("");
      fetchWatchlist();
    } catch (err) {
      console.error("Failed to add to watchlist", err);
      setAddError("Failed to add to watchlist. Please check the address.");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await axios.delete(`${API}/api/watchlist/${id}/`);
      fetchWatchlist();
    } catch (err) {
      console.error("Failed to delete", err);
    }
  };

  const handleRescan = async (contract: WatchedContract) => {
    setRescanStatus(prev => ({ ...prev, [contract.id]: "loading" }));
    try {
      await axios.post(`${API}/api/scans/create/`, {
        address: contract.address,
        network: contract.network,
      });
      setRescanStatus(prev => ({ ...prev, [contract.id]: "success" }));
      setTimeout(() => setRescanStatus(prev => ({ ...prev, [contract.id]: "idle" })), 3000);
    } catch (err) {
      console.error("Failed to rescan", err);
      setRescanStatus(prev => ({ ...prev, [contract.id]: "error" }));
      setTimeout(() => setRescanStatus(prev => ({ ...prev, [contract.id]: "idle" })), 3000);
    }
  };

  if (!user) {
    return <div style={{ padding: 40, textAlign: "center" }}>Please <Link to="/login">login</Link> to view your watchlist.</div>;
  }

  return (
    <div className="watchlist-page" style={{ padding: "40px 20px", maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <h1 style={{ fontFamily: "'JetBrains Mono', monospace", margin: 0 }}>PORTFOLIO WATCHLIST</h1>
        <Link to="/dashboard" className="btn btn-outline" style={{ fontSize: 13 }}>← Back to Dashboard</Link>
      </div>

      <div className="card" style={{ marginBottom: 32, padding: 24 }}>
        <h3>Add Contract to Watchlist</h3>
        <p style={{ color: "var(--text-3)", fontSize: 14, marginBottom: 16 }}>
          We will monitor this contract for upgrades, byte-code changes, and automatically rescan when triggered.
        </p>
        <form onSubmit={handleAdd} style={{ display: "flex", gap: 16, alignItems: "flex-end", marginBottom: addError ? 12 : 0 }}>
          <div style={{ flex: 2 }}>
            <label style={{ display: "block", marginBottom: 8, fontSize: 12 }}>Address</label>
            <input type="text" className="form-input" style={{ width: "100%" }} required
              value={newAddress} onChange={e => setNewAddress(e.target.value)} placeholder="0x..." />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", marginBottom: 8, fontSize: 12 }}>Network</label>
            <select className="form-input" style={{ width: "100%", height: 44 }} value={newNetwork} onChange={e => setNewNetwork(e.target.value)}>
              <option value="mainnet">Ethereum</option>
              <option value="polygon">Polygon</option>
              <option value="bsc">BSC</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", marginBottom: 8, fontSize: 12 }}>Label (Optional)</label>
            <input type="text" className="form-input" style={{ width: "100%" }} 
              value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="e.g. Yield Vault" />
          </div>
          <button type="submit" className="btn btn-primary" style={{ height: 44 }}>Add</button>
        </form>
        {addError && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 8 }}>{addError}</div>}
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead style={{ background: "rgba(255,255,255,0.05)", borderBottom: "1px solid var(--border)" }}>
            <tr>
              <th style={{ padding: "16px 20px" }}>Label</th>
              <th style={{ padding: "16px 20px" }}>Address</th>
              <th style={{ padding: "16px 20px" }}>Network</th>
              <th style={{ padding: "16px 20px" }}>Last Scanned</th>
              <th style={{ padding: "16px 20px" }}></th>
            </tr>
          </thead>
          <tbody onMouseLeave={() => setHoveredId(null)}>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: 20, textAlign: "center" }}>Loading...</td></tr>
            ) : watchlist.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "var(--text-3)" }}>Your watchlist is empty.</td></tr>
            ) : (
              watchlist.map(item => (
                <React.Fragment key={item.id}>
                  <tr 
                    onMouseEnter={() => setHoveredId(item.id)}
                    style={{ borderBottom: hoveredId === item.id ? "none" : "1px solid var(--border)", cursor: "pointer", transition: "background 0.2s" }}
                  >
                    <td style={{ padding: "16px 20px", fontWeight: "bold" }}>{item.label || "—"}</td>
                    <td style={{ padding: "16px 20px", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "var(--text-3)" }}>
                      {item.address.substring(0, 8)}...{item.address.slice(-4)}
                    </td>
                    <td style={{ padding: "16px 20px" }}>
                      <span style={{ background: "rgba(255,255,255,0.1)", padding: "4px 8px", borderRadius: 4, fontSize: 12 }}>
                        {item.network.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: "16px 20px", color: "var(--text-3)", fontSize: 14 }}>
                      {item.last_scanned ? new Date(item.last_scanned).toLocaleDateString() : "Never"}
                    </td>
                    <td style={{ padding: "16px 20px", textAlign: "right" }}>
                      <button onClick={() => handleDelete(item.id)} className="btn btn-outline" style={{ padding: "6px 12px", fontSize: 12, color: "var(--red)", borderColor: "var(--red)" }}>
                        Remove
                      </button>
                    </td>
                  </tr>
                  
                  {hoveredId === item.id && (
                    <tr style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid var(--border)" }}>
                      <td colSpan={5} style={{ padding: "0 20px 20px 20px" }}>
                        <div style={{ padding: "16px", background: "rgba(0,0,0,0.3)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 4, fontFamily: "'JetBrains Mono', monospace" }}>LATEST SCAN RESULTS</div>
                            {item.last_scan_summary ? (
                              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                                <div style={{ fontSize: 14 }}>
                                  Risk Level: <strong style={{ color: item.last_scan_summary.risk_level === 'Critical' ? 'var(--red)' : item.last_scan_summary.risk_level === 'High' ? '#FF6B1A' : item.last_scan_summary.risk_level === 'Medium' ? '#FFD700' : 'var(--green)' }}>{item.last_scan_summary.risk_level}</strong>
                                </div>
                                <div style={{ fontSize: 14 }}>
                                  Score: <strong>{item.last_scan_summary.risk_score ? Math.round(item.last_scan_summary.risk_score) : '—'}/100</strong>
                                </div>
                                <div style={{ display: "flex", gap: 8, fontSize: 12, marginLeft: 16 }}>
                                  <span style={{ background: "rgba(255, 68, 68, 0.1)", color: "var(--red)", padding: "2px 6px", borderRadius: 4 }}>{item.last_scan_summary.critical_vulns} Critical</span>
                                  <span style={{ background: "rgba(255, 107, 26, 0.1)", color: "#FF6B1A", padding: "2px 6px", borderRadius: 4 }}>{item.last_scan_summary.high_vulns} High</span>
                                </div>
                                <Link to={`/report/${item.last_scan_summary.id}`} className="btn btn-outline" style={{ fontSize: 11, padding: "4px 8px", marginLeft: 16 }}>View Full Report</Link>
                              </div>
                            ) : (
                              <div style={{ fontSize: 14, color: "var(--text-3)" }}>No scan history found for this contract.</div>
                            )}
                          </div>
                          
                          <button 
                            onClick={() => handleRescan(item)} 
                            disabled={rescanStatus[item.id] === "loading" || rescanStatus[item.id] === "success"}
                            className="btn btn-primary" 
                            style={{ 
                              fontSize: 13, 
                              padding: "8px 16px",
                              background: rescanStatus[item.id] === "success" ? "rgba(0,255,136,0.2)" : undefined,
                              color: rescanStatus[item.id] === "success" ? "var(--green)" : undefined,
                              borderColor: rescanStatus[item.id] === "success" ? "var(--green)" : undefined,
                            }}
                          >
                            {rescanStatus[item.id] === "loading" ? "↻ Queuing..." : 
                             rescanStatus[item.id] === "success" ? "✅ Queued!" : 
                             rescanStatus[item.id] === "error" ? "✖ Failed" : "↻ Scan Again"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
