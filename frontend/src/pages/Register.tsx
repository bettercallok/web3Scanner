import React, { useState } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/AuthContext";

const API = import.meta.env.VITE_API_BASE_URL || "";

export default function Register() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
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
      // 1. Register
      await axios.post(`${API}/api/accounts/register/`, { username, email, password });
      // 2. Login
      const res = await axios.post(`${API}/api/accounts/login/`, { username, password });
      login(res.data.access, res.data.refresh);
      navigate("/dashboard");
    } catch (err: any) {
      if (err.response && err.response.data) {
        const data = err.response.data;
        const messages: string[] = [];
        for (const key in data) {
          const fieldName = key.charAt(0).toUpperCase() + key.slice(1);
          if (Array.isArray(data[key])) {
            messages.push(`${fieldName}: ${data[key].join(' ')}`);
          } else if (typeof data[key] === 'string') {
            messages.push(data[key]);
          }
        }
        if (messages.length > 0) {
          setError(messages.join(' | '));
          return;
        }
      }
      setError("Failed to register. Username might be taken.");
    }
  };

  return (
    <div style={{ minHeight: "100vh", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* Background from Home */}
      <div className="hero" style={{ position: "absolute", inset: 0, minHeight: "100vh", padding: 0, zIndex: 0 }} />

      {/* Full-page Blur Overlay */}
      <div style={{ 
        position: "absolute", 
        inset: 0,
        backdropFilter: "blur(16px)", 
        WebkitBackdropFilter: "blur(16px)",
        background: "rgba(10, 10, 12, 0.6)",
        zIndex: 1
      }} />

      {/* Clear Content on top */}
      <div style={{ position: "relative", zIndex: 10, display: "flex", flexDirection: "column", flex: 1 }}>
        <nav className="navbar" style={{ background: "transparent", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <a href="/" className="navbar-logo">
            WEB3<span className="logo-dot">.</span>SCANNER
          </a>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <span className="nav-badge">AI-POWERED</span>
          </div>
        </nav>

        <div className="container hero-inner" style={{ textAlign: "center", paddingTop: "60px", paddingBottom: "20px" }}>
          <h1 className="hero-title" style={{ fontSize: "clamp(40px, 6vw, 72px)", marginBottom: 0 }}>
            <span className="title-line-1">AUDIT SMART CONTRACTS</span>
          </h1>
        </div>

        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div className="card" style={{ width: "100%", maxWidth: 400, padding: 32, background: "rgba(18, 18, 20, 0.8)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 24px 48px rgba(0,0,0,0.5)" }}>
            <h2 style={{ marginBottom: 24, textAlign: "center", fontFamily: "'JetBrains Mono', monospace" }}>REGISTER</h2>
            {error && <div style={{ color: "var(--red)", marginBottom: 16, fontSize: 14 }}>{error}</div>}
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ display: "block", marginBottom: 8, fontSize: 14, color: "var(--text-2)" }}>Username</label>
                <input
                  type="text"
                  className="form-input"
                  style={{ width: "100%" }}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 8, fontSize: 14, color: "var(--text-2)" }}>Email</label>
                <input
                  type="email"
                  className="form-input"
                  style={{ width: "100%" }}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 8, fontSize: 14, color: "var(--text-2)" }}>Password</label>
                <input
                  type="password"
                  className="form-input"
                  style={{ width: "100%" }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ marginTop: 16, width: "100%" }}>
                Create Account
              </button>
            </form>
            <p style={{ marginTop: 24, textAlign: "center", fontSize: 14, color: "var(--text-3)" }}>
              Already have an account? <Link to="/login" style={{ color: "var(--blue)" }}>Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
