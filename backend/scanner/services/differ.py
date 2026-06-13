"""
Differential contract analysis.
Compares two completed ScanJob vulnerability sets and returns:
  - new_vulns:       found in B but not A  (regressions)
  - fixed_vulns:     found in A but not B  (improvements)
  - unchanged_vulns: identical in both
"""
import logging

logger = logging.getLogger(__name__)


def _vuln_key(v) -> str:
    """Stable identity key for a vulnerability (model instance or dict)."""
    if hasattr(v, "title"):
        # ORM model instance
        return f"{v.title.lower().strip()}|{v.severity}"
    # Dict (e.g. from serializer)
    return f"{str(v.get('title', '')).lower().strip()}|{v.get('severity', '')}"


def diff_scan_jobs(job_a, job_b) -> dict:
    """
    Diff two ScanJob ORM instances by their vulnerability sets.

    Returns:
    {
        "new_vulns":       [...],   # regressions (in B, not A)
        "fixed_vulns":     [...],   # improvements (in A, not B)
        "unchanged_vulns": [...],   # present in both
        "risk_delta":      float,   # job_b.risk_score - job_a.risk_score
        "summary": {
            "new_count": int,
            "fixed_count": int,
            "unchanged_count": int,
        }
    }
    """
    a_vulns = {_vuln_key(v): v for v in job_a.vulnerabilities.filter(is_false_positive=False)}
    b_vulns = {_vuln_key(v): v for v in job_b.vulnerabilities.filter(is_false_positive=False)}

    a_keys = set(a_vulns)
    b_keys = set(b_vulns)

    new_keys       = b_keys - a_keys
    fixed_keys     = a_keys - b_keys
    unchanged_keys = a_keys & b_keys

    def _serialize(v):
        return {
            "title":       v.title,
            "severity":    v.severity,
            "description": v.description,
            "swc_id":      v.swc_id,
            "tool":        v.tool,
            "confidence":  v.confidence,
            "file_path":   v.file_path,
            "line_numbers": v.line_numbers,
        }

    risk_a = job_a.risk_score or 0.0
    risk_b = job_b.risk_score or 0.0

    result = {
        "job_a": {"id": str(job_a.id), "address": job_a.address, "risk_score": risk_a},
        "job_b": {"id": str(job_b.id), "address": job_b.address, "risk_score": risk_b},
        "new_vulns":       [_serialize(b_vulns[k]) for k in sorted(new_keys)],
        "fixed_vulns":     [_serialize(a_vulns[k]) for k in sorted(fixed_keys)],
        "unchanged_vulns": [_serialize(b_vulns[k]) for k in sorted(unchanged_keys)],
        "risk_delta": round(risk_b - risk_a, 2),
        "summary": {
            "new_count":       len(new_keys),
            "fixed_count":     len(fixed_keys),
            "unchanged_count": len(unchanged_keys),
        },
    }

    logger.info(
        f"[differ] {job_a.id} vs {job_b.id} — "
        f"new={len(new_keys)}, fixed={len(fixed_keys)}, unchanged={len(unchanged_keys)}"
    )
    return result
