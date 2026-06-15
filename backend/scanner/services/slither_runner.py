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
import glob
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
            "--print", "call-graph",
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

    # ── Parse Call Graph (.dot) ──────────────────────────────────
    call_graph = {"nodes": [], "links": []}
    dot_files = glob.glob(os.path.join(work_dir, "*.dot"))
    
    node_pattern = re.compile(r'"([^"]+)"\s*\[label="([^"]+)"\]')
    edge_pattern = re.compile(r'"([^"]+)"\s*->\s*"([^"]+)"')
    
    for dot_file in dot_files:
        try:
            with open(dot_file, "r") as f:
                content = f.read()
            for match in node_pattern.finditer(content):
                call_graph["nodes"].append({
                    "id": match.group(1),
                    "label": match.group(2),
                    "group": 2
                })
            for match in edge_pattern.finditer(content):
                call_graph["links"].append({
                    "source": match.group(1),
                    "target": match.group(2)
                })
        except Exception as e:
            logger.error(f"Failed to parse dot file {dot_file}: {e}")

    # Deduplicate nodes just in case
    unique_nodes = {n["id"]: n for n in call_graph["nodes"]}
    
    # Ensure all links point to valid nodes
    valid_links = []
    for link in call_graph["links"]:
        if link["source"] not in unique_nodes:
            unique_nodes[link["source"]] = {"id": link["source"], "label": link["source"], "group": 3}
        if link["target"] not in unique_nodes:
            unique_nodes[link["target"]] = {"id": link["target"], "label": link["target"], "group": 3}
        valid_links.append(link)

    call_graph["nodes"] = list(unique_nodes.values())
    call_graph["links"] = valid_links

    # Prevent massive graphs from crashing the browser (limit to 300 nodes)
    if len(call_graph["nodes"]) > 300:
        call_graph["nodes"] = call_graph["nodes"][:300]
        allowed_ids = {n["id"] for n in call_graph["nodes"]}
        call_graph["links"] = [l for l in call_graph["links"] if l["source"] in allowed_ids and l["target"] in allowed_ids]

    try:
        data = json.loads(stdout)
        data["call_graph_data"] = call_graph
        return data
    except json.JSONDecodeError:
        return {
            "success": False,
            "error":   "JSON parse error",
            "raw":     stdout[:500],
            "results": {"detectors": []},
            "call_graph_data": call_graph
        }


def extract_call_graph(
    source_code: str,
    compiler_version: str,
    job_id: str,
    source_map: dict | None = None,
) -> dict:
    """
    Run Slither ONLY for the call-graph printer and return the parsed graph.
    Used to back-fill old scans that predate the call-graph feature.

    Returns:
        {"nodes": [...], "links": [...]}
    """
    try:
        uuid.UUID(str(job_id))
    except ValueError:
        raise ValueError(f"Invalid job_id: {job_id}")

    if not re.fullmatch(r"\d+\.\d+\.\d+", compiler_version):
        raise ValueError(f"Invalid compiler version: {compiler_version!r}")

    work_dir = os.path.join(settings.SCAN_TMP_DIR, f"{job_id}_graph")
    work_dir = os.path.realpath(work_dir)
    assert work_dir.startswith(os.path.realpath(settings.SCAN_TMP_DIR)), "Path traversal"
    os.makedirs(work_dir, exist_ok=True)

    # Write source
    if source_map and len(source_map) > 1:
        from .flattener import write_source_files
        write_source_files(source_map, work_dir)
        slither_target = work_dir
    else:
        sol_file = os.path.join(work_dir, "contract.sol")
        with open(sol_file, "w", encoding="utf-8") as fh:
            fh.write(source_code or "")
        slither_target = sol_file

    # Set solc version
    try:
        subprocess.run(["solc-select", "install", compiler_version], capture_output=True, timeout=60)
        subprocess.run(["solc-select", "use", compiler_version], capture_output=True, timeout=10)
    except Exception as exc:
        logger.warning(f"[graph] solc-select failed: {exc}")

    # Run slither ONLY for the call-graph printer
    subprocess.run(
        ["slither", slither_target, "--print", "call-graph", "--no-fail-pedantic", "--exclude-dependencies"],
        capture_output=True,
        text=True,
        timeout=120,
        cwd=work_dir,
    )

    # Parse all .dot files
    call_graph = {"nodes": [], "links": []}
    dot_files = glob.glob(os.path.join(work_dir, "*.dot"))
    node_pattern = re.compile(r'"([^"]+)"\s*\[label="([^"]+)"\]')
    edge_pattern = re.compile(r'"([^"]+)"\s*->\s*"([^"]+)"')

    for dot_file in dot_files:
        try:
            with open(dot_file, "r") as f:
                content = f.read()
            for m in node_pattern.finditer(content):
                call_graph["nodes"].append({"id": m.group(1), "label": m.group(2), "group": 2})
            for m in edge_pattern.finditer(content):
                call_graph["links"].append({"source": m.group(1), "target": m.group(2)})
        except Exception as e:
            logger.error(f"Failed to parse {dot_file}: {e}")

    # Deduplicate and fix orphan links
    unique_nodes = {n["id"]: n for n in call_graph["nodes"]}
    valid_links = []
    for link in call_graph["links"]:
        if link["source"] not in unique_nodes:
            unique_nodes[link["source"]] = {"id": link["source"], "label": link["source"], "group": 3}
        if link["target"] not in unique_nodes:
            unique_nodes[link["target"]] = {"id": link["target"], "label": link["target"], "group": 3}
        valid_links.append(link)

    call_graph["nodes"] = list(unique_nodes.values())
    call_graph["links"] = valid_links

    # Hard cap at 300 nodes
    if len(call_graph["nodes"]) > 300:
        call_graph["nodes"] = call_graph["nodes"][:300]
        allowed_ids = {n["id"] for n in call_graph["nodes"]}
        call_graph["links"] = [
            lnk for lnk in call_graph["links"]
            if lnk["source"] in allowed_ids and lnk["target"] in allowed_ids
        ]

    return call_graph

