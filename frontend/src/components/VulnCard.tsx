import React, { useState } from "react";
import { Vulnerability } from "../types";

export default function VulnCard({ vuln }: { vuln: Vulnerability }) {
  const [open, setOpen] = useState<boolean>(false);
  const sev = vuln.severity ?? "informational";

  return (
    <div className="vuln-card">
      <div className="vuln-card-header" onClick={() => setOpen((o) => !o)}>
        <div className={`sev-dot dot-${sev}`} />
        <div className={`sev-label label-${sev}`}>{sev}</div>
        <div className="vuln-title-text">{vuln.title}</div>
        {vuln.swc_id && <div className="swc-chip">{vuln.swc_id}</div>}
        <div className="tool-chip">{vuln.tool}</div>
        <span className={`chevron ${open ? "open" : ""}`}>▼</span>
      </div>
      {open && (
        <div className="vuln-card-body">
          {vuln.description && <p className="vuln-desc">{vuln.description}</p>}
          {vuln.file_path && (
            <p className="vuln-meta">
              📁 <span>{vuln.file_path}</span>
              {vuln.line_numbers && (
                <>
                  {" · "}Line <span>{vuln.line_numbers}</span>
                </>
              )}
              {vuln.confidence && (
                <>
                  {" · "}Confidence: <span>{vuln.confidence}</span>
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
              <div className="poc-label" style={{ color: "#ff6b1a", fontSize: 12, fontWeight: "bold", marginBottom: 8, fontFamily: "'JetBrains Mono', monospace" }}>
                🧪 AUTO-GENERATED FOUNDRY POC
              </div>
              <pre className="code-block" style={{ margin: 0, padding: 12, background: "#0d0d0d", borderRadius: 4 }}>
                <code>{vuln.poc_code}</code>
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
