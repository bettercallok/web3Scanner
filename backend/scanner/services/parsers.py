"""
Output parsers for Slither and Mythril JSON results.
Normalizes tool-specific schemas into a common vulnerability dict.
"""
import re


# ─────────────────── Slither ────────────────────────────────
# SWC ID mapping for common Slither check names
SLITHER_SWC_MAP = {
    "reentrancy-eth": "SWC-107",
    "reentrancy-no-eth": "SWC-107",
    "reentrancy-benign": "SWC-107",
    "tx-origin": "SWC-115",
    "timestamp": "SWC-116",
    "suicidal": "SWC-106",
    "arbitrary-send-eth": "SWC-105",
    "controlled-delegatecall": "SWC-112",
    "integer-overflow": "SWC-101",
    "uninitialized-local": "SWC-109",
    "shadowing-local": "SWC-119",
    "weak-prng": "SWC-120",
    "events-access": "SWC-117",
    "low-level-calls": "SWC-104",
    "unchecked-lowlevel": "SWC-104",
    "locked-ether": "SWC-132",
    "msg-value-loop": "SWC-113",
    "calls-loop": "SWC-113",
}

SLITHER_IMPACT_MAP = {
    "High": "high",
    "Medium": "medium",
    "Low": "low",
    "Informational": "informational",
    "Optimization": "informational",
}


def parse_slither_output(raw: dict) -> list[dict]:
    """Parse Slither JSON into normalized vulnerability list."""
    results = []
    detectors = raw.get("results", {}).get("detectors", [])
    for d in detectors:
        check = d.get("check", "unknown")
        elements = d.get("elements", [])
        file_path = ""
        lines = ""
        snippet = ""
        if elements:
            el = elements[0]
            src = el.get("source_mapping", {})
            file_path = src.get("filename_short", "")
            ln = src.get("lines", [])
            lines = ",".join(str(x) for x in ln[:5]) if ln else ""
            snippet = el.get("name", "")

        results.append({
            "check": check,
            "description": _clean_description(d.get("description", "")),
            "impact": SLITHER_IMPACT_MAP.get(d.get("impact", "Low"), "low"),
            "confidence": d.get("confidence", "Medium"),
            "file": file_path,
            "lines": lines,
            "snippet": snippet,
            "swc_id": SLITHER_SWC_MAP.get(check, ""),
        })
    return results


def _clean_description(desc: str) -> str:
    return re.sub(r"\n\s+", " ", desc).strip()


# ─────────────────── Mythril ────────────────────────────────
def parse_mythril_output(raw: dict) -> list[dict]:
    """Parse Mythril JSON into normalized vulnerability list."""
    issues = raw.get("issues", [])
    results = []
    for issue in issues:
        results.append({
            "title": issue.get("title", "Unknown Issue"),
            "description": issue.get("description", ""),
            "severity": _mythril_severity(issue.get("severity", "Low")),
            "swc_prefix": issue.get("swc-id", ""),
            "filename": issue.get("filename", ""),
            "lineno": issue.get("lineno", ""),
            "code": issue.get("code", ""),
        })
    return results


def _mythril_severity(s: str) -> str:
    mapping = {"High": "high", "Medium": "medium", "Low": "low"}
    return mapping.get(s, "low")
