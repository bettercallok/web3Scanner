"""
Etherscan API client — fetches verified contract source code.
"""
import json
import logging
import requests
from django.conf import settings

logger = logging.getLogger(__name__)

ETHERSCAN_CHAIN_IDS = {
    "mainnet": "1",
    "polygon": "137",
    "bsc": "56",
    "arbitrum": "42161",
    "optimism": "10",
}


def fetch_contract_source(address: str, network: str = "mainnet") -> dict:
    """
    Fetch verified source code, ABI, and compiler settings from Etherscan.
    Returns a dict with: source_code, abi, contract_name, compiler_version.
    """
    base_url = "https://api.etherscan.io/v2/api"
    chain_id = ETHERSCAN_CHAIN_IDS.get(network, "1")
    api_key = settings.ETHERSCAN_API_KEY

    params = {
        "chainid": chain_id,
        "module": "contract",
        "action": "getsourcecode",
        "address": address,
        "apikey": api_key,
    }

    resp = requests.get(base_url, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    if data.get("status") != "1" or not data.get("result"):
        raise ValueError(f"Etherscan error: {data.get('message', 'Unknown error')}")

    result = data["result"][0]
    source_code = result.get("SourceCode", "")
    contract_name = result.get("ContractName", "UnknownContract")
    compiler_version = result.get("CompilerVersion", "")
    abi_raw = result.get("ABI", "[]")

    # Handle multi-file JSON source (wrapped in {{ }})
    if source_code.startswith("{{"):
        try:
            parsed = json.loads(source_code[1:-1])
            # Flatten multi-file to single string for analysis
            files = parsed.get("sources", {})
            source_code = "\n\n".join(
                f"// === {fname} ===\n{fdata.get('content', '')}"
                for fname, fdata in files.items()
            )
        except json.JSONDecodeError:
            pass

    abi = json.loads(abi_raw) if abi_raw and abi_raw != "Contract source code not verified" else None

    return {
        "source_code": source_code,
        "abi": abi,
        "contract_name": contract_name,
        "compiler_version": _clean_compiler_version(compiler_version),
        "raw_compiler_version": compiler_version,
    }


def _clean_compiler_version(version: str) -> str:
    """Extract semver from Etherscan compiler version string."""
    import re
    match = re.search(r"(\d+\.\d+\.\d+)", version)
    return match.group(1) if match else "0.8.20"
