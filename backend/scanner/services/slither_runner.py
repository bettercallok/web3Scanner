"""
Slither static analysis runner.
Supports both single-file and multi-file (directory) Solidity projects.
"""
import glob
import json
import logging
import os
import re
import subprocess

from scanner.security import scan_work_dir, solc_env, validate_solc_version

logger = logging.getLogger(__name__)

MAX_GRAPH_NODES = 300

_NODE_RE = re.compile(r'"([^"]+)"\s*\[label="([^"]+)"\]')
_EDGE_RE = re.compile(r'"([^"]+)"\s*->\s*"([^"]+)"')


def write_sources(work_dir: str, source_code: str, source_map: dict | None) -> str:
    """
    Write contract sources into ``work_dir``.

    Returns the analysis target: the directory for multi-file projects, or the
    single ``contract.sol`` file otherwise.
    """
    if source_map and len(source_map) > 1:
        from .flattener import write_source_files

        entry = write_source_files(source_map, work_dir)
        logger.info(f"[slither] multi-file mode — {len(source_map)} files, entry: {os.path.basename(entry)}")
        return work_dir

    sol_file = os.path.join(work_dir, "contract.sol")
    with open(sol_file, "w", encoding="utf-8") as fh:
        fh.write(source_code or "")
    return sol_file


def ensure_solc(version: str) -> None:
    """Install the requested solc (idempotent). Selection is done per-process via SOLC_VERSION."""
    validate_solc_version(version)
    try:
        subprocess.run(["solc-select", "install", version], capture_output=True, timeout=120)
    except Exception as exc:  # pragma: no cover - depends on host tooling
        logger.warning(f"[slither] solc-select install {version} failed: {exc}")


def parse_call_graph(work_dir: str, max_nodes: int = MAX_GRAPH_NODES) -> dict:
    """Parse every ``*.dot`` file Slither's call-graph printer wrote into ``work_dir``."""
    nodes: dict[str, dict] = {}
    links: list[dict] = []

    for dot_file in glob.glob(os.path.join(work_dir, "**", "*.dot"), recursive=True):
        try:
            with open(dot_file, "r", encoding="utf-8", errors="replace") as fh:
                content = fh.read()
        except OSError as exc:
            logger.error(f"[graph] failed to read {os.path.basename(dot_file)}: {exc}")
            continue
        for m in _NODE_RE.finditer(content):
            nodes.setdefault(m.group(1), {"id": m.group(1), "label": m.group(2), "group": 2})
        for m in _EDGE_RE.finditer(content):
            links.append({"source": m.group(1), "target": m.group(2)})

    # Orphan endpoints become "external" nodes; drop duplicate edges.
    seen = set()
    unique_links = []
    for link in links:
        key = (link["source"], link["target"])
        if key in seen:
            continue
        seen.add(key)
        for end in key:
            nodes.setdefault(end, {"id": end, "label": end, "group": 3})
        unique_links.append(link)

    node_list = list(nodes.values())
    truncated = len(node_list) > max_nodes
    if truncated:
        node_list = node_list[:max_nodes]
        allowed = {n["id"] for n in node_list}
        unique_links = [l for l in unique_links if l["source"] in allowed and l["target"] in allowed]

    graph = {"nodes": node_list, "links": unique_links}
    if truncated:
        graph["truncated"] = True
    return graph


def mark_vulnerable_nodes(graph: dict, vulnerabilities) -> dict:
    """
    Flag graph nodes whose label matches a function referenced by a finding
    (Slither stores the function/contract name in ``code_snippet``).
    """
    names = {
        (getattr(v, "code_snippet", "") or "").strip().lower()
        for v in vulnerabilities
        if not getattr(v, "is_false_positive", False)
    }
    names.discard("")
    if not names:
        return graph
    for node in graph.get("nodes", []):
        label = str(node.get("label", "")).lower()
        fn = label.split(".")[-1].split("(")[0]
        if fn in names or label in names:
            node["vulnerable"] = True
    return graph


def run_slither(
    source_code: str,
    compiler_version: str,
    job_id: str,
    source_map: dict | None = None,
) -> dict:
    """
    Run Slither on a Solidity source code string or multi-file project.

    Returns the raw Slither JSON output dict, with ``call_graph_data`` added.
    """
    validate_solc_version(compiler_version)
    work_dir = scan_work_dir(job_id)
    target = write_sources(work_dir, source_code, source_map)
    ensure_solc(compiler_version)

    result = subprocess.run(
        [
            "slither",
            target,
            "--json", "-",
            "--no-fail-pedantic",
            "--exclude-dependencies",
            "--print", "call-graph",
        ],
        capture_output=True,
        text=True,
        timeout=180,
        cwd=work_dir,
        env=solc_env(compiler_version),
    )

    call_graph = parse_call_graph(work_dir)
    stdout = result.stdout.strip()
    if not stdout:
        return {
            "success": False,
            "error": (result.stderr or "No output")[:500],
            "results": {"detectors": []},
            "call_graph_data": call_graph,
        }

    try:
        data = json.loads(stdout)
    except json.JSONDecodeError:
        return {
            "success": False,
            "error": "JSON parse error",
            "raw": stdout[:500],
            "results": {"detectors": []},
            "call_graph_data": call_graph,
        }
    data["call_graph_data"] = call_graph
    return data


def extract_call_graph(
    source_code: str,
    compiler_version: str,
    job_id: str,
    source_map: dict | None = None,
) -> dict:
    """
    Run Slither ONLY for the call-graph printer and return the parsed graph.
    Used to back-fill old scans that predate the call-graph feature.
    """
    validate_solc_version(compiler_version)
    work_dir = scan_work_dir(job_id, suffix="_graph")
    try:
        target = write_sources(work_dir, source_code, source_map)
        ensure_solc(compiler_version)
        subprocess.run(
            ["slither", target, "--print", "call-graph", "--no-fail-pedantic", "--exclude-dependencies"],
            capture_output=True,
            text=True,
            timeout=120,
            cwd=work_dir,
            env=solc_env(compiler_version),
        )
        return parse_call_graph(work_dir)
    finally:
        import shutil

        shutil.rmtree(work_dir, ignore_errors=True)
