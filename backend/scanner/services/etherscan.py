"""
Etherscan API client — fetches verified contract source code.
Supports single-file, multi-file JSON, and proxy contract resolution.
"""
import json
import logging
import requests
from django.conf import settings

logger = logging.getLogger(__name__)

ETHERSCAN_CHAIN_IDS = {
    "mainnet":  "1",
    "polygon":  "137",
    "bsc":      "56",
    "arbitrum": "42161",
    "optimism": "10",
}


def fetch_contract_source(address: str, network: str = "mainnet") -> dict:
    """
    Fetch verified source code, ABI, and compiler settings from Etherscan.

    Returns a dict with:
      source_code        – concatenated/flat source string (backward compat)
      source_map         – {filename: content} dict for multi-file projects
      abi                – parsed ABI list or None
      contract_name      – string
      compiler_version   – cleaned semver string (e.g. "0.8.20")
      is_proxy           – bool | None
      proxy_type         – "transparent" | "eip1967" | "oz_legacy" | ""
      implementation_address – "0x..." | ""
      etherscan_raw      – the raw Etherscan result dict (for proxy resolver)
    """
    base_url = "https://api.etherscan.io/v2/api"
    chain_id = ETHERSCAN_CHAIN_IDS.get(network, "1")
    api_key  = settings.ETHERSCAN_API_KEY

    params = {
        "chainid": chain_id,
        "module":  "contract",
        "action":  "getsourcecode",
        "address": address,
        "apikey":  api_key,
    }

    resp = requests.get(base_url, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    if data.get("status") != "1" or not data.get("result"):
        raise ValueError(f"Etherscan error: {data.get('message', 'Unknown error')}")

    result          = data["result"][0]
    raw_source      = result.get("SourceCode", "")
    contract_name   = result.get("ContractName", "UnknownContract")
    compiler_version = result.get("CompilerVersion", "")
    abi_raw         = result.get("ABI", "[]")

    # Build source_map from whatever format Etherscan returned
    from .flattener import build_source_map
    source_map = build_source_map(raw_source, contract_name)

    # Flatten to a single string for tools that need it (backward compat)
    if len(source_map) == 1:
        source_code = next(iter(source_map.values()))
    else:
        source_code = "\n\n".join(
            f"// === {fname} ===\n{content}"
            for fname, content in source_map.items()
        )

    abi = None
    if abi_raw and abi_raw not in ("", "Contract source code not verified"):
        try:
            abi = json.loads(abi_raw)
        except json.JSONDecodeError:
            pass

    cleaned_ver = _clean_compiler_version(compiler_version)

    return {
        "source_code":            source_code,
        "source_map":             source_map,
        "abi":                    abi,
        "contract_name":          contract_name,
        "compiler_version":       cleaned_ver,
        "raw_compiler_version":   compiler_version,
        # Proxy info — will be resolved in tasks.py using proxy_resolver
        "etherscan_raw":          result,
    }


def _clean_compiler_version(version: str) -> str:
    """Extract semver from Etherscan compiler version string."""
    import re
    match = re.search(r"(\d+\.\d+\.\d+)", version)
    return match.group(1) if match else "0.8.20"
