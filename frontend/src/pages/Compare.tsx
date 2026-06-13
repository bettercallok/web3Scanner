import React, { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import axios from "axios";

const API = import.meta.env.VITE_API_BASE_URL || "";

export default function Compare() {
  const [searchParams] = useSearchParams();
  const idA = searchParams.get("a");
  const idB = searchParams.get("b");

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!idA || !idB) {
      setError("Please provide two job IDs (?a=ID1&b=ID2)");
      setLoading(false);
      return;
    }

    axios.post(`${API}/api/diff/`, { job_a_id: idA, job_b_id: idB })
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.detail || "Failed to load comparison"))
      .finally(() => setLoading(false));
  }, [idA, idB]);

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}>Loading comparison...</div>;
  if (error) return <div style={{ padding: 40, textAlign: "center", color: "var(--red)" }}>{error}</div>;

  return (
    <div className="compare-page" style={{ padding: "40px 20px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <h1 style={{ fontFamily: "'JetBrains Mono', monospace", margin: 0 }}>VULNERABILITY DIFF</h1>
        <Link to="/dashboard" className="btn btn-outline" style={{ fontSize: 13 }}>← Dashboard</Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 32 }}>
        <div className="card" style={{ padding: 24 }}>
          <h3>Contract A (Old)</h3>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "var(--text-3)", marginTop: 8 }}>{data.job_a.address}</p>
        </div>
        <div className="card" style={{ padding: 24 }}>
          <h3>Contract B (New)</h3>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "var(--text-3)", marginTop: 8 }}>{data.job_b.address}</p>
        </div>
      </div>

      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <h3 style={{ color: "var(--red)", marginBottom: 16 }}>🔴 New Vulnerabilities Introduced</h3>
        {data.new.length === 0 ? <p style={{ color: "var(--text-3)", fontSize: 14 }}>None!</p> : (
          <ul style={{ paddingLeft: 20 }}>
            {data.new.map((v: any, i: number) => <li key={i} style={{ marginBottom: 8, fontSize: 14 }}><strong>{v.severity.toUpperCase()}</strong>: {v.title}</li>)}
          </ul>
        )}
      </div>

      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <h3 style={{ color: "var(--green)", marginBottom: 16 }}>🟢 Fixed Vulnerabilities</h3>
        {data.fixed.length === 0 ? <p style={{ color: "var(--text-3)", fontSize: 14 }}>None!</p> : (
          <ul style={{ paddingLeft: 20 }}>
            {data.fixed.map((v: any, i: number) => <li key={i} style={{ marginBottom: 8, fontSize: 14 }}><strong>{v.severity.toUpperCase()}</strong>: {v.title}</li>)}
          </ul>
        )}
      </div>

      <div className="card" style={{ padding: 24 }}>
        <h3 style={{ color: "var(--text-2)", marginBottom: 16 }}>⚪ Unchanged Vulnerabilities</h3>
        {data.unchanged.length === 0 ? <p style={{ color: "var(--text-3)", fontSize: 14 }}>None!</p> : (
          <ul style={{ paddingLeft: 20 }}>
            {data.unchanged.map((v: any, i: number) => <li key={i} style={{ marginBottom: 8, fontSize: 14, color: "var(--text-3)" }}><strong>{v.severity.toUpperCase()}</strong>: {v.title}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}
