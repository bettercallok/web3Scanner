import React, { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { API } from "../api";
import { useAuth } from "../context/AuthContext";
import Icon, { IconName } from "./Icon";

export function Brand({ sub }: { sub?: string }) {
  return (
    <Link to="/" className="brand">
      <span className="brand-mark"><Icon name="shieldCheck" size={16} /></span>
      <span>
        Web3 Scanner
        {sub && <span className="brand-sub">{sub}</span>}
      </span>
    </Link>
  );
}

const NAV: { to: string; label: string; icon: IconName; end?: boolean; badge?: "active" | "watch" }[] = [
  { to: "/", label: "New scan", icon: "search", end: true },
  { to: "/dashboard", label: "Scans", icon: "grid", badge: "active" },
  { to: "/watchlist", label: "Watchlist", icon: "eye", badge: "watch" },
  { to: "/diff", label: "Compare", icon: "compare" },
];

/** Authenticated layout: persistent sidebar on desktop, top bar + drawer on mobile. */
export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<{ active: number; watch: number }>({ active: 0, watch: 0 });

  // Close the mobile drawer on navigation and refresh sidebar counters.
  useEffect(() => {
    setOpen(false);
    axios
      .get(`${API}/api/scans/stats/`)
      .then((r) => setCounts({ active: r.data.active || 0, watch: r.data.watchlist || 0 }))
      .catch(() => undefined);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const initials = (user?.username || "?").slice(0, 2).toUpperCase();

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? "open" : ""}`} aria-label="Primary">
        <Brand sub="Smart contract security" />
        <Link to="/" className="btn btn-primary sidebar-cta">
          <Icon name="plus" size={16} /> New scan
        </Link>

        <div className="side-section">Workspace</div>
        <nav className="side-nav">
          {NAV.map((item) => {
            const n = item.badge === "active" ? counts.active : item.badge === "watch" ? counts.watch : 0;
            return (
              <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}>
                <Icon name={item.icon} size={17} />
                {item.label}
                {n > 0 && (
                  <span className="side-badge" title={item.badge === "active" ? "Running scans" : "Watched contracts"}>
                    {n}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="side-section">Account</div>
        <nav className="side-nav">
          <NavLink to="/settings" className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}>
            <Icon name="settings" size={17} /> Settings
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <span className="avatar" aria-hidden="true">{initials}</span>
          <div className="user-meta">
            <div className="user-name">{user?.username}</div>
            <div className="user-email">{user?.email}</div>
          </div>
          <button className="icon-btn" onClick={handleLogout} title="Sign out" aria-label="Sign out">
            <Icon name="logout" size={16} />
          </button>
        </div>
      </aside>

      <div className={`scrim ${open ? "open" : ""}`} onClick={() => setOpen(false)} aria-hidden="true" />

      <div className="shell-main">
        <header className="topbar">
          <Brand />
          <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}>
            <Icon name="menu" size={18} />
          </button>
        </header>
        <main className="shell-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
