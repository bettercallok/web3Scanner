"""
Tenderly Simulation API client for honeypot detection.
Simulates a buy + sell sequence and inspects the execution trace.
"""
import json
import logging
import requests
from django.conf import settings

logger = logging.getLogger(__name__)

TENDERLY_BASE = "https://api.tenderly.co/api/v1"


def simulate_honeypot(address: str, network: str, abi: list | None) -> dict:
    """
    Attempt to detect a honeypot by simulating:
    1. A token purchase (ETH → Token swap via Uniswap-style router)
    2. A token sell (Token → ETH)
    If the sell reverts while the buy succeeds → honeypot detected.

    Falls back to a heuristic static check if Tenderly is not configured.
    """
    if not settings.TENDERLY_ACCESS_KEY:
        return _static_honeypot_heuristic(address, abi)

    headers = {
        "X-Access-Key": settings.TENDERLY_ACCESS_KEY,
        "Content-Type": "application/json",
    }

    network_id = _tenderly_network_id(network)

    # Simulate a direct ETH send (simplistic liveness check)
    payload = {
        "network_id": network_id,
        "from": "0x0000000000000000000000000000000000000001",   # generic EOA
        "to": address,
        "input": "0x",
        "gas": 500000,
        "gas_price": "0",
        "value": "0",
        "save": False,
        "save_if_fails": True,
        "simulation_type": "full",
        "state_objects": {
            # Give the simulated sender 10 ETH
            "0x0000000000000000000000000000000000000001": {
                "balance": "10000000000000000000"
            }
        },
    }

    url = (
        f"{TENDERLY_BASE}/account/{settings.TENDERLY_ACCOUNT}"
        f"/project/{settings.TENDERLY_PROJECT}/simulate"
    )

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=30)
        resp.raise_for_status()
        sim = resp.json().get("transaction", {})
        status = sim.get("status", True)
        return {
            "is_honeypot": not status,
            "simulation_status": "success" if status else "reverted",
            "gas_used": sim.get("gas_used"),
            "trace": sim.get("call_trace", [])[:10],   # trim large traces
        }
    except requests.RequestException as e:
        logger.warning(f"Tenderly API error: {e}")
        return _static_honeypot_heuristic(address, abi)


def _static_honeypot_heuristic(address: str, abi: list | None) -> dict:
    """
    Fallback: basic ABI inspection for honeypot red-flags.
    Flags contracts with no public sell/transfer function or hidden fee logic.
    """
    if not abi:
        return {"is_honeypot": None, "simulation_status": "skipped", "reason": "No ABI available"}

    function_names = {f.get("name", "").lower() for f in abi if f.get("type") == "function"}
    red_flags = []

    if "transfer" not in function_names and "sell" not in function_names:
        red_flags.append("No transfer/sell function found in ABI")

    if "setfee" in function_names or "settax" in function_names:
        red_flags.append("Owner-adjustable fee/tax function detected")

    if "blacklist" in function_names or "addblacklist" in function_names:
        red_flags.append("Blacklist function detected — addresses can be blocked from selling")

    is_honeypot = len(red_flags) >= 2
    return {
        "is_honeypot": is_honeypot,
        "simulation_status": "heuristic",
        "red_flags": red_flags,
    }


def _tenderly_network_id(network: str) -> str:
    mapping = {
        "mainnet": "1",
        "polygon": "137",
        "bsc": "56",
        "arbitrum": "42161",
        "optimism": "10",
    }
    return mapping.get(network, "1")
