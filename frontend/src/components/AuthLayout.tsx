import React from "react";
import { Link } from "react-router-dom";
import Icon from "./Icon";

const POINTS = [
  "Slither, Mythril & AI review in one pipeline",
  "Honeypot and proxy-upgrade detection",
  "PDF, SARIF and shareable public reports",
];

/** Two-column auth shell: brand panel on the left, form card on the right (stacks on mobile). */
export default function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="auth-page">
      <div className="auth-brand">
        <Link to="/" className="navbar-logo">
          WEB3<span className="logo-dot">.</span>SCANNER
        </Link>
        <div>
          <h1 className="auth-headline">
            Audit smart contracts
            <span className="title-line-accent">before attackers do</span>
          </h1>
          <ul className="auth-points">
            {POINTS.map((p) => (
              <li key={p}>
                <span className="auth-check"><Icon name="check" size={14} /></span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="muted auth-fine">Open source · locally hosted LLM · your code never leaves the server.</p>
      </div>

      <div className="auth-main">
        <div className="auth-card">
          <h2 className="auth-title">{title}</h2>
          <p className="auth-subtitle">{subtitle}</p>
          {children}
          <div className="auth-footer">{footer}</div>
        </div>
      </div>
    </div>
  );
}
