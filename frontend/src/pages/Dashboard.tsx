import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/AuthContext";

const API = import.meta.env.VITE_API_BASE_URL || "";

interface ScanJob {
  id: string;
  address: string;
  network: string;
  status: string;
  risk_score: number | null;
  risk_level: string | null;
  contract_name: string | null;
  created_at: string;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [scans, setScans] = useState<ScanJob[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Note: To filter by user, the backend API should return only the user's scans
    // This assumes /api/scans/ will return scans tied to the user if auth token is present
    axios.get(`${API}/api/scans/`)
      .then(res => setScans(res.data.results || res.data))
      .catch(err => console.error("Failed to fetch scans", err))
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  if (!user) {
    return <div style={{ padding: 40, textAlign: "center" }}>Please <Link to="/login">login</Link> to view dashboard.</div>;
  }

  return (
    <div className="dashboard-page" style={{ padding: "40px 20px", maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <h1 style={{ fontFamily: "'JetBrains Mono', monospace", margin: 0 }}>DASHBOARD</h1>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <span style={{ color: "var(--text-3)" }}>Logged in as <strong style={{ color: "var(--text-1)" }}>{user.username}</strong></span>
          <button onClick={handleLogout} className="btn btn-outline" style={{ fontSize: 12 }}>Logout</button>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2>Your Scans</h2>
        <div style={{ display: "flex", gap: 16 }}>
          <Link to="/watchlist" className="btn btn-secondary">Portfolio Watchlist</Link>
          <Link to="/" className="btn btn-primary">+ New Scan</Link>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>Loading scans...</div>
      ) : scans.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 60, color: "var(--text-3)" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
          <p>No scans found. Start by scanning a smart contract.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead style={{ background: "rgba(255,255,255,0.05)", borderBottom: "1px solid var(--border)" }}>
              <tr>
                <th style={{ padding: "16px 20px" }}>Contract</th>
                <th style={{ padding: "16px 20px" }}>Address</th>
                <th style={{ padding: "16px 20px" }}>Status</th>
                <th style={{ padding: "16px 20px" }}>Risk</th>
                <th style={{ padding: "16px 20px" }}>Date</th>
                <th style={{ padding: "16px 20px" }}></th>
              </tr>
            </thead>
            <tbody>
              {scans.map(scan => (
                <tr key={scan.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "16px 20px", fontWeight: "bold" }}>{scan.contract_name || "Unknown"}</td>
                  <td style={{ padding: "16px 20px", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "var(--text-3)" }}>
                    {scan.address.substring(0, 8)}...{scan.address.slice(-4)}
                  </td>
                  <td style={{ padding: "16px 20px" }}>
                    <span style={{ 
                      display: "inline-block", 
                      padding: "4px 8px", 
                      borderRadius: 4, 
                      fontSize: 12,
                      background: scan.status === "complete" ? "rgba(0,255,136,0.1)" : "rgba(255,255,255,0.1)",
                      color: scan.status === "complete" ? "var(--green)" : "var(--text-1)"
                    }}>
                      {scan.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: "16px 20px" }}>
                    {scan.risk_score ? (
                      <span style={{ 
                        color: scan.risk_level === "Critical" ? "var(--red)" : 
                               scan.risk_level === "High" ? "#FF6B1A" : 
                               scan.risk_level === "Medium" ? "#FFD700" : "var(--green)" 
                      }}>
                        {Math.round(scan.risk_score)}/100
                      </span>
                    ) : "—"}
                  </td>
                  <td style={{ padding: "16px 20px", color: "var(--text-3)", fontSize: 14 }}>
                    {new Date(scan.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: "16px 20px", textAlign: "right" }}>
                    <Link to={`/report/${scan.id}`} className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: 12 }}>View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
