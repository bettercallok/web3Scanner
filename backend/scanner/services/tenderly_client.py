"""
Honeypot detection.

Two signals are combined:

1. Static ABI heuristics (always available): owner-controlled trading
   switches, blacklists, adjustable taxes, max-tx limits, etc.
2. A Tenderly simulation (when configured): an ordinary holder calls
   ``transfer(dead, 0)`` on the token. Normal ERC-20s accept a zero-value
   transfer; tokens that block transfers for non-whitelisted senders revert.

The previous implementation simulated a *plain ETH send* to the contract and
treated a revert as "honeypot". Almost every ERC-20 has no ``receive()`` and
therefore reverts, so nearly every token was flagged (+40 risk). A simulation
revert is now only treated as a honeypot when it is corroborated by at least
one static red flag; otherwise it is reported as ``suspicious``.

Non-token contracts (no ``transfer``/``balanceOf``) are not honeypot candidates
and return ``is_honeypot: None``.
"""
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

TENDERLY_BASE = "https://api.tenderly.co/api/v1"
SIM_SENDER = "0x000000000000000000000000000000000000beef"
DEAD = "0x000000000000000000000000000000000000dead"
TRANSFER_SELECTOR = "a9059cbb"  # transfer(address,uint256)

# Function names (lower-case) that indicate owner control over who can trade.
RED_FLAG_FUNCTIONS = {
    "blacklist": "Blacklist function — addresses can be blocked from selling",
    "addblacklist": "Blacklist function — addresses can be blocked from selling",
    "setblacklist": "Blacklist function — addresses can be blocked from selling",
    "addbots": "Bot list — owner can block arbitrary addresses",
    "setbots": "Bot list — owner can block arbitrary addresses",
    "setfee": "Owner-adjustable fee/tax",
    "settax": "Owner-adjustable fee/tax",
    "setsellfee": "Owner-adjustable sell fee",
    "setselltax": "Owner-adjustable sell tax",
    "settaxes": "Owner-adjustable fee/tax",
    "setfees": "Owner-adjustable fee/tax",
    "enabletrading": "Owner-controlled trading switch",
    "settradingenabled": "Owner-controlled trading switch",
    "opentrading": "Owner-controlled trading switch",
    "setmaxtxamount": "Owner-adjustable max transaction size",
    "setmaxwallet": "Owner-adjustable max wallet size",
    "setcooldown": "Owner-adjustable transfer cooldown",
}

NETWORK_IDS = {
    "mainnet": "1",
    "polygon": "137",
    "bsc": "56",
    "arbitrum": "42161",
    "optimism": "10",
}


def _function_names(abi: list | None) -> set[str]:
    if not abi or not isinstance(abi, list):
        return set()
    return {
        str(f.get("name", "")).lower()
        for f in abi
        if isinstance(f, dict) and f.get("type") == "function"
    }


def is_token(abi: list | None) -> bool:
    names = _function_names(abi)
    return "transfer" in names and "balanceof" in names


def static_red_flags(abi: list | None) -> list[str]:
    names = _function_names(abi)
    flags = []
    for fn, reason in RED_FLAG_FUNCTIONS.items():
        if fn in names and reason not in flags:
            flags.append(reason)
    return flags


def simulate_honeypot(address: str, network: str, abi: list | None) -> dict:
    """Return a honeypot assessment dict (see module docstring)."""
    if not abi:
        return {"is_honeypot": None, "simulation_status": "skipped", "reason": "No ABI available"}
    if not is_token(abi):
        return {"is_honeypot": None, "simulation_status": "skipped", "reason": "Not an ERC-20 style token"}

    flags = static_red_flags(abi)

    if not (settings.TENDERLY_ACCESS_KEY and settings.TENDERLY_ACCOUNT and settings.TENDERLY_PROJECT):
        return _heuristic_result(flags)

    calldata = "0x" + TRANSFER_SELECTOR + DEAD[2:].rjust(64, "0") + "0" * 64
    payload = {
        "network_id": NETWORK_IDS.get(network, "1"),
        "from": SIM_SENDER,
        "to": address,
        "input": calldata,
        "gas": 500000,
        "gas_price": "0",
        "value": "0",
        "save": False,
        "save_if_fails": False,
        "simulation_type": "quick",
        "state_objects": {SIM_SENDER: {"balance": "10000000000000000000"}},
    }
    url = f"{TENDERLY_BASE}/account/{settings.TENDERLY_ACCOUNT}/project/{settings.TENDERLY_PROJECT}/simulate"
    try:
        resp = requests.post(
            url,
            json=payload,
            headers={"X-Access-Key": settings.TENDERLY_ACCESS_KEY, "Content-Type": "application/json"},
            timeout=30,
        )
        resp.raise_for_status()
        sim = resp.json().get("transaction", {}) or {}
    except (requests.RequestException, ValueError) as exc:
        logger.warning(f"Tenderly API error ({exc.__class__.__name__}); falling back to heuristics")
        return _heuristic_result(flags)

    succeeded = bool(sim.get("status", True))
    if succeeded:
        return {
            "is_honeypot": False,
            "simulation_status": "success",
            "gas_used": sim.get("gas_used"),
            "red_flags": flags,
        }
    return {
        # A revert alone is not proof (some tokens reject zero-value transfers).
        "is_honeypot": bool(flags),
        "simulation_status": "reverted",
        "suspicious": True,
        "gas_used": sim.get("gas_used"),
        "error_message": str(sim.get("error_message", ""))[:200],
        "red_flags": flags,
    }


def _heuristic_result(flags: list[str]) -> dict:
    return {
        "is_honeypot": len(flags) >= 2,
        "simulation_status": "heuristic",
        "red_flags": flags,
    }


# Backwards-compatible name used by older call sites/tests.
def _static_honeypot_heuristic(address: str, abi: list | None) -> dict:
    if not abi:
        return {"is_honeypot": None, "simulation_status": "skipped", "reason": "No ABI available"}
    return _heuristic_result(static_red_flags(abi))
