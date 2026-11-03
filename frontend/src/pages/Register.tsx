import React, { useState } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { API, errorMessage } from "../api";
import AuthLayout from "../components/AuthLayout";

export default function Register() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login, user } = useAuth();
  const navigate = useNavigate();

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await axios.post(`${API}/api/accounts/register/`, { username, email, password });
      const res = await axios.post(`${API}/api/accounts/login/`, { username, password });
      login(res.data.access, res.data.refresh);
      navigate("/");
    } catch (err) {
      setError(errorMessage(err, "Failed to register. Username might be taken."));
    } finally {
      setSubmitting(false);
    }
  };

  const strength = password.length === 0 ? 0 : password.length < 10 ? 1 : password.length < 14 ? 2 : 3;

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Free and self-hosted. Start your first scan in under a minute."
      footer={
        <>
          Already have an account? <Link to="/login" className="text-link">Sign in</Link>
        </>
      }
    >
      {error && <div className="notice notice-red" role="alert">{error}</div>}
      <form onSubmit={handleSubmit} className="form-grid">
        <div>
          <label className="field-label" htmlFor="reg-username">Username</label>
          <input
            id="reg-username"
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
          <label className="field-label" htmlFor="reg-email">Email</label>
          <input
            id="reg-email"
            type="email"
            className="form-input input-block"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div>
          <label className="field-label" htmlFor="reg-password">Password</label>
          <input
            id="reg-password"
            type="password"
            className="form-input input-block"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={10}
            aria-describedby="pw-hint"
            required
          />
          <div className="pw-meter" data-strength={strength} aria-hidden="true">
            <span /><span /><span />
          </div>
          <div id="pw-hint" className="field-hint">
            At least 10 characters, not too common, not similar to your username.
          </div>
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? <><span className="btn-spinner" aria-hidden="true" /> Creating account…</> : "Create account"}
        </button>
      </form>
    </AuthLayout>
  );
}
