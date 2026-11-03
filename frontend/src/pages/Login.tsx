import React, { useState } from "react";
import { Link, useNavigate, Navigate, useLocation } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { API } from "../api";
import AuthLayout from "../components/AuthLayout";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const target = from && from !== "/login" ? from : "/";

  if (user) {
    return <Navigate to={target} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/api/accounts/login/`, { username, password });
      login(res.data.access, res.data.refresh);
      navigate(target, { replace: true });
    } catch (err: any) {
      setError(
        err?.response?.status === 429
          ? "Too many login attempts. Please wait a minute and try again."
          : "Invalid credentials. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your workspace to scan contracts and review reports."
      footer={
        <>
          Don't have an account? <Link to="/register" className="text-link">Create one</Link>
        </>
      }
    >
      {error && <div className="notice notice-red" role="alert">{error}</div>}
      <form onSubmit={handleSubmit} className="form-grid">
        <div>
          <label className="field-label" htmlFor="login-username">Username</label>
          <input
            id="login-username"
            type="text"
            className="form-input input-block"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </div>
        <div>
          <label className="field-label" htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            className="form-input input-block"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? <><span className="btn-spinner" aria-hidden="true" /> Signing in…</> : "Sign in"}
        </button>
      </form>
    </AuthLayout>
  );
}
