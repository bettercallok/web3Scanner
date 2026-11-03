import React, { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const LINKS = [
  { to: "/", label: "Scan", end: true },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/watchlist", label: "Watchlist" },
  { to: "/diff", label: "Diff" },
  { to: "/settings", label: "Settings" },
];

export default function Navbar({ badge, brand }: { badge?: string; brand?: string }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-logo" onClick={() => setOpen(false)}>
        {brand ?? (
          <>
            WEB3<span className="logo-dot">.</span>SCANNER
          </>
        )}
      </Link>

      {user && (
        <button
          className="nav-toggle"
          aria-label="Toggle navigation"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "✕" : "☰"}
        </button>
      )}

      <div className={`nav-links ${open ? "open" : ""}`}>
        {badge && <span className="nav-badge">{badge}</span>}
        {user ? (
          <>
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                onClick={() => setOpen(false)}
              >
                {l.label}
              </NavLink>
            ))}
            <span className="nav-user" title={user.email}>
              {user.username}
            </span>
            <button className="nav-link nav-logout" onClick={handleLogout}>
              Logout
            </button>
          </>
        ) : (
          !brand && (
            <>
              <NavLink to="/login" className="nav-link">Login</NavLink>
              <NavLink to="/register" className="nav-link">Register</NavLink>
            </>
          )
        )}
      </div>
    </nav>
  );
}
