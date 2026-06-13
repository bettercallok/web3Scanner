"""
Slither static analysis runner.
Supports both single-file and multi-file (directory) Solidity projects.
"""
import os
import re
import json
import uuid
import logging
import subprocess
from django.conf import settings

logger = logging.getLogger(__name__)


def run_slither(
    source_code: str,
    compiler_version: str,
    job_id: str,
    source_map: dict | None = None,
) -> dict:
    """
    Run Slither on a Solidity source code string or multi-file project.

    Args:
        source_code:      Flat/concatenated source (used if source_map is None)
        compiler_version: Semver string e.g. "0.8.20"
        job_id:           UUID of the scan job (used for temp directory)
        source_map:       Optional {filename: content} dict for multi-file projects

    Returns:
        Raw Slither JSON output dict.
    """
    # ── Validate job_id ──────────────────────────────────────────
    try:
        uuid.UUID(str(job_id))
    except ValueError:
        raise ValueError(f"Invalid job_id: {job_id}")

    work_dir = os.path.join(settings.SCAN_TMP_DIR, str(job_id))
    work_dir = os.path.realpath(work_dir)
    assert work_dir.startswith(
        os.path.realpath(settings.SCAN_TMP_DIR)
    ), "Path traversal detected"
    os.makedirs(work_dir, exist_ok=True)

    # ── Validate compiler version ────────────────────────────────
    if not re.fullmatch(r"\d+\.\d+\.\d+", compiler_version):
        raise ValueError(f"Invalid compiler version: {compiler_version!r}")

    # ── Write source files ───────────────────────────────────────
    if source_map and len(source_map) > 1:
        # Multi-file project: write files preserving directory structure
        from .flattener import write_source_files
        entry_file = write_source_files(source_map, work_dir)
        slither_target = work_dir   # run on the whole project directory
        logger.info(f"[slither] multi-file mode — {len(source_map)} files, entry: {entry_file}")
    else:
        # Single file fallback
        sol_file = os.path.join(work_dir, "contract.sol")
        with open(sol_file, "w", encoding="utf-8") as fh:
            fh.write(source_code)
        slither_target = sol_file
        logger.info(f"[slither] single-file mode — {sol_file}")

    # ── Set solc version ─────────────────────────────────────────
    try:
        subprocess.run(
            ["solc-select", "install", compiler_version],
            capture_output=True, timeout=60,
        )
        subprocess.run(
            ["solc-select", "use", compiler_version],
            capture_output=True, timeout=10,
        )
    except Exception as exc:
        logger.warning(f"[slither] solc-select failed: {exc}. Using default.")

    # ── Run Slither ───────────────────────────────────────────────
    result = subprocess.run(
        [
            "slither",
            slither_target,
            "--json", "-",
            "--no-fail-pedantic",
            "--exclude-dependencies",
        ],
        capture_output=True,
        text=True,
        timeout=120,
        cwd=work_dir,
    )

    stdout = result.stdout.strip()
    if not stdout:
        return {
            "success": False,
            "error":   result.stderr[:500],
            "results": {"detectors": []},
        }

    try:
        return json.loads(stdout)
    except json.JSONDecodeError:
        return {
            "success": False,
            "error":   "JSON parse error",
            "raw":     stdout[:500],
            "results": {"detectors": []},
        }
