"""
Risk Score Calculator — implements R = Σ(Wᵢ × Sᵢ × Pᵢ)
"""

# Base weights per SWC ID + severity (derived from historical economic impact)
SEVERITY_WEIGHTS = {
    "critical": 30.0,
    "high": 15.0,
    "medium": 6.0,
    "low": 2.0,
    "informational": 0.3,
}

# SWC-specific multipliers (high-impact vulnerabilities get boosted)
SWC_MULTIPLIERS = {
    "SWC-107": 1.8,   # Reentrancy
    "SWC-101": 1.5,   # Integer Overflow
    "SWC-106": 2.0,   # Unprotected Self-Destruct
    "SWC-105": 1.7,   # Unprotected ETH Withdrawal
    "SWC-115": 1.3,   # tx.origin auth
    "SWC-112": 1.6,   # Delegatecall to untrusted
    "SWC-120": 1.2,   # Weak PRNG
    "SWC-132": 1.4,   # Unexpected Ether
}

TOOL_CONFIDENCE_WEIGHTS = {
    "slither": 0.75,
    "mythril": 0.90,
    "ai": 0.85,
    "manual": 1.0,
}

CONFIDENCE_MULTIPLIERS = {
    "high": 1.0,
    "medium": 0.7,
    "low": 0.4,
}

RISK_THRESHOLDS = [
    (80, "Critical"),
    (60, "High"),
    (35, "Medium"),
    (0, "Low"),
]


def calculate_risk_score(job) -> tuple[float, str]:
    """
    Compute aggregate risk score and level for a ScanJob.
    Returns (score: float 0–100, level: str).
    """
    vulns = job.vulnerabilities.filter(is_false_positive=False)
    if not vulns.exists():
        raw_score = 0.0
    else:
        raw_score = 0.0
        for v in vulns:
            w = SEVERITY_WEIGHTS.get(v.severity, 2.0)
            swc_mult = SWC_MULTIPLIERS.get(v.swc_id, 1.0)
            tool_conf = TOOL_CONFIDENCE_WEIGHTS.get(v.tool, 0.75)
            conf_mult = CONFIDENCE_MULTIPLIERS.get(v.confidence, 0.7)
            s = swc_mult * conf_mult        # severity context (Sᵢ)
            p = tool_conf                   # confidence/probability (Pᵢ)
            raw_score += w * s * p

    # Honeypot flag adds a heavy penalty
    if job.is_honeypot:
        raw_score += 40.0

    # Normalize to 0–100 using a soft cap (diminishing returns above 100)
    score = min(100.0, raw_score)

    level = "Low"
    for threshold, label in RISK_THRESHOLDS:
        if score >= threshold:
            level = label
            break

    return score, level
