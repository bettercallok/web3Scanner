"""
Multi-file contract flattener.
Parses Etherscan's source format (single file, multi-file JSON {{ }}, standard JSON)
into a {filename: content} map and writes files to disk preserving directory structure.
"""
import os
import re
import json
import logging

logger = logging.getLogger(__name__)


def build_source_map(raw_source: str, contract_name: str) -> dict:
    """
    Parse Etherscan raw source into a {filename: content} dict.

    Handles three Etherscan formats:
      1. Multi-file JSON wrapped in {{ ... }}
      2. Standard Solidity Input JSON { "sources": { ... } }
      3. Single flat .sol file (plain string)
    """
    if not raw_source:
        return {}

    # Format 1: Etherscan multi-file — wrapped in double braces {{ }}
    if raw_source.startswith("{{"):
        try:
            parsed = json.loads(raw_source[1:-1])
            sources = parsed.get("sources", {})
            if sources:
                return {fname: fdata.get("content", "") for fname, fdata in sources.items()}
        except json.JSONDecodeError:
            pass

    # Format 2: Standard Solidity Input JSON
    if raw_source.lstrip().startswith("{"):
        try:
            parsed = json.loads(raw_source)
            sources = parsed.get("sources", {})
            if sources:
                return {fname: fdata.get("content", "") for fname, fdata in sources.items()}
        except json.JSONDecodeError:
            pass

    # Format 3: Single flat file
    fname = f"{contract_name}.sol" if contract_name else "contract.sol"
    return {fname: raw_source}


def write_source_files(source_map: dict, work_dir: str) -> str:
    """
    Write all contract files to disk, preserving relative directory structure.

    Returns the path to the entry-point file (the one not imported by others).
    """
    if not source_map:
        return os.path.join(work_dir, "contract.sol")

    written = []
    for filename, content in source_map.items():
        safe_name = _sanitize_path(filename)
        file_path = os.path.join(work_dir, safe_name)
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, "w", encoding="utf-8") as fh:
            fh.write(content)
        written.append((filename, file_path))
        logger.debug(f"[flattener] wrote {safe_name}")

    logger.info(f"[flattener] wrote {len(written)} contract files to {work_dir}")

    # Determine the entry file: the .sol file that isn't imported by any other
    entry = _find_entry_file(source_map, work_dir)
    return entry


def _find_entry_file(source_map: dict, work_dir: str) -> str:
    """
    Heuristic to find the main/entry contract file.
    The entry file is the one not referenced in any other file's import statements.
    """
    all_basenames = {os.path.basename(f).lower() for f in source_map}
    imported = set()

    for content in source_map.values():
        for imp in re.findall(r'import\s+["\']([^"\']+)["\']', content):
            imported.add(os.path.basename(imp).lower())

    candidates = all_basenames - imported
    # Prefer candidates that are not interfaces or libraries
    for fname in source_map:
        base = os.path.basename(fname).lower()
        if base in candidates and not base.startswith("i") and "interface" not in base:
            safe = _sanitize_path(fname)
            return os.path.join(work_dir, safe)

    # Fall back to first file
    first = _sanitize_path(next(iter(source_map)))
    return os.path.join(work_dir, first)


def _sanitize_path(filename: str) -> str:
    """Remove dangerous path components (traversal, absolute paths)."""
    filename = filename.replace("\\", "/").lstrip("/")
    parts = [p for p in filename.split("/") if p not in ("", "..", ".")]
    return "/".join(parts) if parts else "contract.sol"
