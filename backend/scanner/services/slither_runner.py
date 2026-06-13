"""
Slither static analysis runner.
Writes source to a temp file, executes Slither, returns parsed JSON.
"""
import os
import json
import logging
import subprocess
import tempfile
from django.conf import settings

logger = logging.getLogger(__name__)


def run_slither(source_code: str, compiler_version: str, job_id: str) -> dict:
    """
    Run Slither on a Solidity source code string.
    Returns the raw Slither JSON output dict.
    """
    work_dir = os.path.join(settings.SCAN_TMP_DIR, str(job_id))
    os.makedirs(work_dir, exist_ok=True)
    sol_file = os.path.join(work_dir, "contract.sol")

    with open(sol_file, "w", encoding="utf-8") as f:
        f.write(source_code)

    import re
    if not re.fullmatch(r"\d+\.\d+\.\d+", compiler_version):
        raise ValueError(f"Invalid compiler version: {compiler_version!r}")

    # Set correct solc version for this contract
    try:
        subprocess.run(
            ["solc-select", "install", compiler_version],
            capture_output=True,
            timeout=60,
        )
        subprocess.run(
            ["solc-select", "use", compiler_version],
            capture_output=True,
            timeout=10,
        )
    except Exception as e:
        logger.warning(f"solc-select failed: {e}. Using default version.")

    result = subprocess.run(
        [
            "slither",
            sol_file,
            "--json", "-",           # output JSON to stdout
            "--no-fail-pedantic",
            "--exclude-dependencies",
        ],
        capture_output=True,
        text=True,
        timeout=120,
        cwd=work_dir,
    )

    # Slither exits 1 when it finds issues — that's expected
    stdout = result.stdout.strip()
    if not stdout:
        return {"success": False, "error": result.stderr[:500], "results": {"detectors": []}}

    try:
        return json.loads(stdout)
    except json.JSONDecodeError:
        return {"success": False, "error": "JSON parse error", "raw": stdout[:500], "results": {"detectors": []}}
