"""
Mythril symbolic execution runner.
"""
import os
import json
import logging
import subprocess
from django.conf import settings

logger = logging.getLogger(__name__)


def run_mythril(source_code: str, compiler_version: str, job_id: str) -> dict:
    """
    Run Mythril on a Solidity source file.
    Returns parsed JSON output. Timeout is intentionally generous (5 min).
    """
    import uuid
    try:
        uuid.UUID(str(job_id))
    except ValueError:
        raise ValueError(f"Invalid job_id: {job_id}")

    work_dir = os.path.join(settings.SCAN_TMP_DIR, str(job_id))
    work_dir = os.path.realpath(work_dir)
    assert work_dir.startswith(os.path.realpath(settings.SCAN_TMP_DIR)), "Path traversal detected"

    os.makedirs(work_dir, exist_ok=True)
    sol_file = os.path.join(work_dir, "contract.sol")

    # Source code should already be written by Slither step
    if not os.path.exists(sol_file):
        with open(sol_file, "w", encoding="utf-8") as f:
            f.write(source_code)

    import re
    if not re.fullmatch(r"\d+\.\d+\.\d+", compiler_version):
        raise ValueError(f"Invalid compiler version: {compiler_version!r}")

    result = subprocess.run(
        [
            "myth", "analyze",
            sol_file,
            "--solv", compiler_version,
            "--output", "json",
            "--execution-timeout", "120",   # seconds per function
            "--max-depth", "22",
        ],
        capture_output=True,
        text=True,
        timeout=300,   # 5 min hard cap
        cwd=work_dir,
    )

    stdout = result.stdout.strip()
    if not stdout:
        stderr = result.stderr.strip()
        return {"error": stderr[:500] if stderr else "No output", "issues": []}

    try:
        return json.loads(stdout)
    except json.JSONDecodeError:
        return {"error": "JSON parse error", "raw": stdout[:500], "issues": []}
