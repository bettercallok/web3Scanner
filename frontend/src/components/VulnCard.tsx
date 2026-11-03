import React, { useState } from "react";
import { Vulnerability } from "../types";

interface Props {
  vuln: Vulnerability;
  /** When provided (scan owner only), shows a "mark as false positive" control. */
  onToggleFalsePositive?: (vuln: Vulnerability) => Promise<void> | void;
}

export default function VulnCard({ vuln, onToggleFalsePositive }: Props) {
  const [open, setOpen] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const sev = vuln.severity ?? "informational";
  const dismissed = !!vuln.is_false_positive;

  const toggle = async () => {
    if (!onToggleFalsePositive) return;
    setBusy(true);
    try {
      await onToggleFalsePositive(vuln);
    } finally {
      setBusy(false);
    }
  };

  const copyPoc = async () => {
    try {
      await navigator.clipboard.writeText(vuln.poc_code || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="vuln-card" style={dismissed ? { opacity: 0.6 } : undefined}>
      <div
        className="vuln-card-header"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
      >
        <div className={`sev-dot dot-${sev}`} />
        <div className={`sev-label label-${sev}`}>{sev}</div>
        <div className="vuln-title-text" style={dismissed ? { textDecoration: "line-through" } : undefined}>
          {vuln.title}
        </div>
        {dismissed && (
          <div className="tool-chip" title="Dismissed as a false positive">
            FP · {vuln.false_positive_source === "user" ? "you" : "AI"}
          </div>
        )}
        {vuln.swc_id && <div className="swc-chip">{vuln.swc_id}</div>}
        <div className="tool-chip">{vuln.tool}</div>
        <span className={`chevron ${open ? "open" : ""}`}>▼</span>
      </div>
      {open && (
        <div className="vuln-card-body">
          {vuln.description && <p className="vuln-desc">{vuln.description}</p>}
          {(vuln.file_path || vuln.confidence) && (
            <p className="vuln-meta">
              {vuln.file_path && (
                <>
                  📁 <span>{vuln.file_path}</span>
                  {vuln.line_numbers && (
                    <>
                      {" · "}Line <span>{vuln.line_numbers}</span>
                    </>
                  )}
                </>
              )}
              {vuln.confidence && (
                <>
                  {vuln.file_path ? " · " : ""}Confidence: <span>{vuln.confidence}</span>
                </>
              )}
              {vuln.swc_id && (
                <>
                  {" · "}
                  <a href={`https://swcregistry.io/docs/${vuln.swc_id}`} target="_blank" rel="noreferrer noopener" style={{ color: "var(--blue-bright)" }}>
                    {vuln.swc_id} reference ↗
                  </a>
                </>
              )}
            </p>
          )}
          {vuln.code_snippet && (
            <pre className="code-block">
              <code>{vuln.code_snippet}</code>
            </pre>
          )}
          {vuln.remediation && (
            <div className="remediation-box">
              <div className="rem-label">✔ Remediation</div>
              <p>{vuln.remediation}</p>
            </div>
          )}
          {vuln.poc_code && (
            <div className="poc-box" style={{ marginTop: 16, background: "#1a1a1a", border: "1px solid #333", borderRadius: 6, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div className="poc-label" style={{ color: "var(--orange)", fontSize: 12, fontWeight: "bold", fontFamily: "'JetBrains Mono', monospace" }}>
                  🧪 AUTO-GENERATED FOUNDRY POC (unverified)
                </div>
                <button className="btn btn-outline btn-sm" onClick={copyPoc}>{copied ? "✓ Copied" : "Copy"}</button>
              </div>
              <pre className="code-block" style={{ margin: 0, padding: 12, background: "#0d0d0d", borderRadius: 4 }}>
                <code>{vuln.poc_code}</code>
              </pre>
            </div>
          )}
          {onToggleFalsePositive && (
            <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
              <button className={`btn btn-sm ${dismissed ? "btn-outline" : "btn-secondary"}`} disabled={busy} onClick={toggle}>
                {busy ? "Saving…" : dismissed ? "↺ Restore finding" : "Mark as false positive"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
