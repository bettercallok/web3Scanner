import React, { useState } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/AuthContext";

const API = import.meta.env.VITE_API_BASE_URL || "";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login, user } = useAuth();
  const navigate = useNavigate();

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API}/api/accounts/login/`, { username, password });
      login(res.data.access, res.data.refresh);
      navigate("/dashboard");
    } catch (err: any) {
      setError("Invalid credentials. Please try again.");
    }
  };

  return (
    <div className="auth-page" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="card" style={{ width: "100%", maxWidth: 400, padding: 32 }}>
        <h2 style={{ marginBottom: 24, textAlign: "center", fontFamily: "'JetBrains Mono', monospace" }}>LOGIN</h2>
        {error && <div style={{ color: "var(--red)", marginBottom: 16, fontSize: 14 }}>{error}</div>}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ display: "block", marginBottom: 8, fontSize: 14 }}>Username</label>
            <input
              type="text"
              className="search-input"
              style={{ width: "100%" }}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: 8, fontSize: 14 }}>Password</label>
            <input
              type="password"
              className="search-input"
              style={{ width: "100%" }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ marginTop: 16, width: "100%" }}>
            Sign In
          </button>
        </form>
        <p style={{ marginTop: 24, textAlign: "center", fontSize: 14, color: "var(--text-3)" }}>
          Don't have an account? <Link to="/register" style={{ color: "var(--blue)" }}>Register</Link>
        </p>
      </div>
    </div>
  );
}
