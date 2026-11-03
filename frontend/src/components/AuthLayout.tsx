import React from "react";
import Icon from "./Icon";
import { Brand } from "./AppShell";

const POINTS = [
  "Slither, Mythril and AI review in one pipeline",
  "Honeypot and proxy-upgrade detection",
  "PDF, SARIF and shareable public reports",
];

const PREVIEW: { sev: string; title: string; swc: string }[] = [
  { sev: "critical", title: "Unprotected selfdestruct", swc: "SWC-106" },
  { sev: "high", title: "Reentrancy in withdraw()", swc: "SWC-107" },
  { sev: "medium", title: "Authorization through tx.origin", swc: "SWC-115" },
];

/** Two-column auth shell: product panel on the left, form on the right (stacks on mobile). */
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
        <Brand sub="Smart contract security" />
        <div>
          <h1 className="auth-headline">
            Find vulnerabilities <span>before attackers do.</span>
          </h1>
          <ul className="auth-points">
            {POINTS.map((p) => (
              <li key={p}>
                <span className="auth-check"><Icon name="check" size={13} /></span>
                {p}
              </li>
            ))}
          </ul>
          <div className="auth-preview" aria-hidden="true">
            {PREVIEW.map((r) => (
              <div key={r.title} className="auth-preview-row">
                <span className={`sev-dot dot-${r.sev}`} />
                <span className={`sev-label label-${r.sev}`}>{r.sev}</span>
                <span style={{ flex: 1 }}>{r.title}</span>
                <span className="swc-chip">{r.swc}</span>
              </div>
            ))}
          </div>
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
