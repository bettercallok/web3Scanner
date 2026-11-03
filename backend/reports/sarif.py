"""
SARIF 2.1.0 export.

SARIF is the format GitHub Code Scanning, VS Code's SARIF viewer and most
CI security dashboards ingest, so exporting it lets users push scanner
findings straight into their existing review workflow, e.g.:

    gh api repos/{owner}/{repo}/code-scanning/sarifs -f sarif=$(gzip -c report.sarif | base64 -w0) ...
"""
import re

SARIF_SCHEMA = "https://json.schemastore.org/sarif-2.1.0.json"

_LEVEL = {
    "critical": "error",
    "high": "error",
    "medium": "warning",
    "low": "note",
    "informational": "note",
}
# GitHub uses `security-severity` (0.0–10.0) to bucket alerts.
_SECURITY_SEVERITY = {
    "critical": "9.5",
    "high": "8.0",
    "medium": "5.5",
    "low": "3.0",
    "informational": "1.0",
}


def _rule_id(v) -> str:
    base = v.swc_id or v.title
    slug = re.sub(r"[^a-z0-9]+", "-", f"{v.tool}/{base}".lower()).strip("-")
    return slug[:120] or "finding"


def _first_line(line_numbers: str) -> int | None:
    m = re.search(r"\d+", line_numbers or "")
    if not m:
        return None
    n = int(m.group(0))
    return n if n >= 1 else None


def build_sarif(job, version: str = "1.0.0") -> dict:
    rules: dict[str, dict] = {}
    results = []

    for v in job.vulnerabilities.filter(is_false_positive=False):
        rid = _rule_id(v)
        if rid not in rules:
            rule = {
                "id": rid,
                "name": v.title[:200],
                "shortDescription": {"text": v.title[:200]},
                "fullDescription": {"text": (v.description or v.title)[:1000]},
                "properties": {
                    "tags": ["security", "smart-contract", v.tool or "scanner"] + ([v.swc_id] if v.swc_id else []),
                    "security-severity": _SECURITY_SEVERITY.get(v.severity, "5.0"),
                },
            }
            if v.swc_id:
                rule["helpUri"] = f"https://swcregistry.io/docs/{v.swc_id}"
            if v.remediation:
                rule["help"] = {"text": v.remediation[:2000]}
            rules[rid] = rule

        location = {
            "physicalLocation": {
                "artifactLocation": {"uri": (v.file_path or f"{job.contract_name or 'contract'}.sol").lstrip("/")},
            }
        }
        line = _first_line(v.line_numbers)
        if line:
            location["physicalLocation"]["region"] = {"startLine": line}

        results.append({
            "ruleId": rid,
            "level": _LEVEL.get(v.severity, "warning"),
            "message": {"text": (v.description or v.title)[:2000]},
            "locations": [location],
            "properties": {"severity": v.severity, "confidence": v.confidence, "tool": v.tool},
        })

    return {
        "$schema": SARIF_SCHEMA,
        "version": "2.1.0",
        "runs": [
            {
                "tool": {
                    "driver": {
                        "name": "web3-security-scanner",
                        "informationUri": "https://github.com/bettercallok/web3Scanner",
                        "version": version,
                        "rules": list(rules.values()),
                    }
                },
                "results": results,
                "properties": {
                    "address": job.address,
                    "network": job.network,
                    "riskScore": job.risk_score,
                    "riskLevel": job.risk_level,
                    "isHoneypot": job.is_honeypot,
                },
            }
        ],
    }
