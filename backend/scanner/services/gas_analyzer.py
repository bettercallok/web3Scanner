"""
Gas Optimization Scanner.
Runs Slither with gas-specific detectors to identify costly patterns and
estimate potential gas savings per finding.
"""
import re
import json
import logging
import subprocess

logger = logging.getLogger(__name__)

# Slither gas-relevant detectors and their estimated savings
GAS_DETECTORS = [
    "costly-loop",
    "cache-array-length",
    "divide-before-multiply",
    "incorrect-strict-equality",
    "dead-code",
    "unused-return",
    "storage-array",
    "msg-value-loop",
    "calls-loop",
    "tautology",
    "boolean-equality",
    "uninitialized-local",
]

# Estimated gas savings per finding type (rough, in gas units)
GAS_SAVINGS_ESTIMATES: dict[str, int] = {
    "costly-loop":              5000,
    "cache-array-length":       200,
    "divide-before-multiply":   50,
    "incorrect-strict-equality": 20,
    "dead-code":                500,
    "unused-return":            100,
    "storage-array":            2000,
    "msg-value-loop":           3000,
    "calls-loop":               10000,
    "tautology":                30,
    "boolean-equality":         50,
    "uninitialized-local":      200,
}

SLITHER_IMPACT_MAP = {
    "High":          "high",
    "Medium":        "medium",
    "Low":           "low",
    "Informational": "informational",
    "Optimization":  "optimization",
}


def run_gas_analysis(
    source_code: str,
    compiler_version: str,
    job_id: str,
    source_map: dict | None = None,
) -> list[dict]:
    """
    Run Slither with gas-optimization detectors.

    Returns a list of gas issue dicts:
    [
      {
        "title": str,
        "description": str,
        "detector": str,
        "impact": str,
        "file_path": str,
        "line_numbers": str,
        "snippet": str,
        "estimated_gas_saving": int,
      },
      ...
    ]
    """
    from .slither_runner import ensure_solc, write_sources
    from scanner.security import scan_work_dir, solc_env, validate_solc_version

    validate_solc_version(compiler_version)
    work_dir = scan_work_dir(job_id, suffix="_gas")
    try:
        target = write_sources(work_dir, source_code, source_map)
        ensure_solc(compiler_version)
        result = subprocess.run(
            [
                "slither",
                target,
                "--detect", ",".join(GAS_DETECTORS),
                "--json", "-",
                "--no-fail-pedantic",
                "--exclude-dependencies",
            ],
            capture_output=True,
            text=True,
            timeout=120,
            cwd=work_dir,
            env=solc_env(compiler_version),
        )
    finally:
        import shutil
        shutil.rmtree(work_dir, ignore_errors=True)

    stdout = result.stdout.strip()
    if not stdout:
        logger.warning(f"[gas] Slither returned no output: {result.stderr[:200]}")
        return []

    try:
        raw = json.loads(stdout)
    except json.JSONDecodeError:
        logger.warning("[gas] JSON parse error from Slither gas run")
        return []

    return _parse_gas_output(raw)


def _parse_gas_output(raw: dict) -> list[dict]:
    """Parse Slither JSON into gas issue list."""
    detectors = raw.get("results", {}).get("detectors", [])
    issues = []

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

        raw_desc = d.get("description", "")
        description = re.sub(r"\n\s+", " ", raw_desc).strip()

        issues.append({
            "title":                _humanize_detector(check),
            "description":          description,
            "detector":             check,
            "impact":               SLITHER_IMPACT_MAP.get(d.get("impact", "Low"), "low"),
            "file_path":            file_path,
            "line_numbers":         lines,
            "snippet":              snippet,
            "estimated_gas_saving": GAS_SAVINGS_ESTIMATES.get(check, 0),
        })

    logger.info(f"[gas] found {len(issues)} gas optimization opportunities")
    return issues


def _humanize_detector(check: str) -> str:
    """Convert detector name to human-readable title."""
    mapping = {
        "costly-loop":               "Costly Loop — Unbounded Iterations",
        "cache-array-length":        "Array Length Not Cached in Loop",
        "divide-before-multiply":    "Division Before Multiplication (Precision Loss)",
        "incorrect-strict-equality": "Strict Equality on Balance/Hash",
        "dead-code":                 "Dead Code — Unreachable Function",
        "unused-return":             "Unused Return Value",
        "storage-array":             "Storage Array Manipulation — High Cost",
        "msg-value-loop":            "msg.value Used Inside Loop",
        "calls-loop":                "External Calls Inside Loop",
        "tautology":                 "Tautological Condition",
        "boolean-equality":          "Redundant Boolean Comparison",
        "uninitialized-local":       "Uninitialized Local Variable",
    }
    return mapping.get(check, check.replace("-", " ").title())
