"""
Mythril symbolic execution runner.

- Source mode: analyses the entry-point Solidity file (multi-file projects are
  written to disk with their directory layout so relative imports resolve).
- Bytecode mode: analyses the raw on-chain runtime bytecode of unverified
  contracts (``myth analyze -f contract.bin --bin-runtime``).
"""
import json
import logging
import os
import re
import subprocess

from scanner.security import scan_work_dir, validate_solc_version

logger = logging.getLogger(__name__)

_HEX = re.compile(r"^(0x)?[0-9a-fA-F]+$")

EXECUTION_TIMEOUT = "120"  # seconds of symbolic execution
HARD_TIMEOUT = 300         # subprocess wall-clock cap


def _run(cmd: list[str], work_dir: str) -> dict:
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=HARD_TIMEOUT,
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


def run_mythril(
    source_code: str,
    compiler_version: str,
    job_id: str,
    source_map: dict | None = None,
) -> dict:
    """Run Mythril on Solidity source. Returns parsed JSON output."""
    validate_solc_version(compiler_version)
    work_dir = scan_work_dir(job_id)

    if source_map and len(source_map) > 1:
        from .flattener import write_source_files

        target = write_source_files(source_map, work_dir)
    else:
        target = os.path.join(work_dir, "contract.sol")
        if not os.path.exists(target):
            with open(target, "w", encoding="utf-8") as fh:
                fh.write(source_code or "")

    return _run(
        [
            "myth", "analyze",
            target,
            "--solv", compiler_version,
            "--output", "json",
            "--execution-timeout", EXECUTION_TIMEOUT,
            "--max-depth", "22",
        ],
        work_dir,
    )


def run_mythril_bytecode(bytecode_hex: str, job_id: str) -> dict:
    """Run Mythril directly on deployed runtime bytecode (no source needed)."""
    if not bytecode_hex or not _HEX.match(bytecode_hex):
        raise ValueError("Invalid bytecode")
    work_dir = scan_work_dir(job_id)

    from .decompiler import write_bytecode_file

    bin_path = write_bytecode_file(bytecode_hex, work_dir)
    return _run(
        [
            "myth", "analyze",
            "-f", bin_path,
            "--bin-runtime",
            "--output", "json",
            "--execution-timeout", EXECUTION_TIMEOUT,
            "--max-depth", "22",
        ],
        work_dir,
    )
