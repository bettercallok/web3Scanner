import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, errorMessage } from "../api";
import Navbar from "../components/Navbar";
import { useAuth } from "../context/AuthContext";

interface NotificationSettings {
  email_enabled: boolean;
  slack_webhook_url: string | null;
  telegram_chat_id: string | null;
  alert_on_critical: boolean;
  alert_on_high: boolean;
  alert_on_medium: boolean;
  telegram_available: boolean;
}

function Status({ ok, err }: { ok: string; err: string }) {
  if (err) return <div className="error-text" role="alert">{err}</div>;
  if (ok) return <div className="success-text">{ok}</div>;
  return null;
}

function NotificationsCard() {
  const [s, setS] = useState<NotificationSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    axios.get(`${API}/api/notifications/settings/`).then((r) => setS(r.data)).catch((e) => setErr(errorMessage(e)));
  }, []);

  if (!s) return <div className="card" style={{ padding: 24 }}>{err ? <Status ok="" err={err} /> : <span className="muted">Loading…</span>}</div>;

  const set = <K extends keyof NotificationSettings>(k: K, v: NotificationSettings[K]) => setS({ ...s, [k]: v });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setOk("");
    setErr("");
    try {
      const { telegram_available, ...payload } = s;
      const r = await axios.put(`${API}/api/notifications/settings/`, {
        ...payload,
        slack_webhook_url: payload.slack_webhook_url || "",
        telegram_chat_id: payload.telegram_chat_id || "",
      });
      setS(r.data);
      setOk("Notification settings saved.");
    } catch (e2) {
      setErr(errorMessage(e2, "Failed to save."));
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setOk("");
    setErr("");
    try {
      const r = await axios.post(`${API}/api/notifications/test/`);
      const d: string[] = r.data.delivered || [];
      d.length ? setOk(`Test alert delivered via: ${d.join(", ")}.`) : setErr("No channel accepted the test alert — check your settings.");
    } catch (e2) {
      setErr(errorMessage(e2, "Test failed."));
    }
  };

  return (
    <form className="card" style={{ padding: 24 }} onSubmit={save}>
      <h3 style={{ marginBottom: 4 }}>🔔 Alerts</h3>
      <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
        Sent when a scan finishes at or above the chosen risk level, and when a watched contract is upgraded.
      </p>

      <div className="switch-row">
        <span>Email alerts</span>
        <input type="checkbox" checked={s.email_enabled} onChange={(e) => set("email_enabled", e.target.checked)} />
      </div>
      <div className="switch-row">
        <span>Alert on <strong style={{ color: "var(--red)" }}>Critical</strong> risk</span>
        <input type="checkbox" checked={s.alert_on_critical} onChange={(e) => set("alert_on_critical", e.target.checked)} />
      </div>
      <div className="switch-row">
        <span>Alert on <strong style={{ color: "var(--orange)" }}>High</strong> risk</span>
        <input type="checkbox" checked={s.alert_on_high} onChange={(e) => set("alert_on_high", e.target.checked)} />
      </div>
      <div className="switch-row">
        <span>Alert on <strong style={{ color: "var(--yellow)" }}>Medium</strong> risk</span>
        <input type="checkbox" checked={s.alert_on_medium} onChange={(e) => set("alert_on_medium", e.target.checked)} />
      </div>

      <div className="form-grid" style={{ marginTop: 16 }}>
        <div>
          <label className="field-label" htmlFor="slack">Slack incoming webhook</label>
          <input id="slack" className="form-input" style={{ width: "100%" }} placeholder="https://hooks.slack.com/services/…"
            value={s.slack_webhook_url || ""} onChange={(e) => set("slack_webhook_url", e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="tg">Telegram chat ID</label>
          <input id="tg" className="form-input" style={{ width: "100%" }} placeholder={s.telegram_available ? "123456789 or @channel" : "Not configured on this server"}
            disabled={!s.telegram_available} value={s.telegram_chat_id || ""} onChange={(e) => set("telegram_chat_id", e.target.value)} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 20, flexWrap: "wrap" }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        <button type="button" className="btn btn-outline btn-sm" onClick={test}>Send test alert</button>
        <Status ok={ok} err={err} />
      </div>
    </form>
  );
}

function AccountCard() {
  const { user, refreshProfile, logout } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState(user?.email || "");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");

  const saveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setOk("");
    setErr("");
    try {
      await axios.patch(`${API}/api/accounts/profile/`, { email });
      await refreshProfile();
      setOk("Email updated.");
    } catch (e2) {
      setErr(errorMessage(e2, "Failed to update email."));
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setOk("");
    setErr("");
    try {
      await axios.post(`${API}/api/accounts/password/`, { current_password: current, new_password: next });
      await logout();
      navigate("/login", { replace: true });
    } catch (e2) {
      setErr(errorMessage(e2, "Failed to change password."));
    }
  };

  return (
    <div className="card" style={{ padding: 24 }}>
      <h3 style={{ marginBottom: 4 }}>👤 Account</h3>
      <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
        Signed in as <strong>{user?.username}</strong>
        {user?.date_joined && ` · member since ${new Date(user.date_joined).toLocaleDateString()}`}
      </p>
      <form onSubmit={saveEmail} className="toolbar" style={{ alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 240px" }}>
          <label className="field-label" htmlFor="email">Email</label>
          <input id="email" type="email" className="form-input" style={{ width: "100%" }} value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <button className="btn btn-outline btn-sm" type="submit">Update email</button>
      </form>

      <form onSubmit={changePassword} className="form-grid" style={{ marginTop: 12 }}>
        <div>
          <label className="field-label" htmlFor="cur">Current password</label>
          <input id="cur" type="password" autoComplete="current-password" className="form-input" style={{ width: "100%" }} value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </div>
        <div>
          <label className="field-label" htmlFor="new">New password (min. 10 characters)</label>
          <input id="new" type="password" autoComplete="new-password" minLength={10} className="form-input" style={{ width: "100%" }} value={next} onChange={(e) => setNext(e.target.value)} required />
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn btn-secondary btn-sm" type="submit">Change password</button>
          <span className="muted" style={{ fontSize: 12 }}>You will be signed out of all sessions.</span>
        </div>
      </form>
      <div style={{ marginTop: 12 }}><Status ok={ok} err={err} /></div>
    </div>
  );
}

export default function Settings() {
  return (
    <>
      <Navbar />
      <div className="page">
        <div className="container" style={{ maxWidth: 760 }}>
          <div className="page-header">
            <h1 className="page-title">SETTINGS</h1>
          </div>
          <div className="form-grid" style={{ gap: 24 }}>
            <NotificationsCard />
            <AccountCard />
          </div>
        </div>
      </div>
    </>
  );
}
