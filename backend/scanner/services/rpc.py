"""
Minimal JSON-RPC helper shared by the proxy resolver, decompiler and watchlist.

Endpoints default to public nodes; override per network with environment
variables such as ``RPC_URL_MAINNET`` or ``RPC_URL_POLYGON`` (recommended in
production — public nodes are rate limited).
"""
import hashlib
import logging
import os

import requests

logger = logging.getLogger(__name__)

PUBLIC_RPC = {
    "mainnet":  "https://ethereum-rpc.publicnode.com",
    "polygon":  "https://polygon-rpc.com",
    "bsc":      "https://bsc-dataseed.binance.org",
    "arbitrum": "https://arb1.arbitrum.io/rpc",
    "optimism": "https://mainnet.optimism.io",
}


def rpc_url(network: str) -> str:
    override = os.environ.get(f"RPC_URL_{network.upper()}")
    return override or PUBLIC_RPC.get(network, PUBLIC_RPC["mainnet"])


def rpc_call(network: str, method: str, params: list, timeout: int = 10):
    """Perform a JSON-RPC call. Returns ``result`` or raises ``RuntimeError``."""
    payload = {"jsonrpc": "2.0", "method": method, "params": params, "id": 1}
    try:
        resp = requests.post(rpc_url(network), json=payload, timeout=timeout)
        resp.raise_for_status()
        body = resp.json()
    except (requests.RequestException, ValueError) as exc:
        # Do not include the URL: private RPC URLs often embed an API key.
        raise RuntimeError(f"RPC {method} failed ({exc.__class__.__name__})") from None
    if "error" in body:
        raise RuntimeError(f"RPC {method} error: {str(body['error'])[:200]}")
    return body.get("result")


def get_code(address: str, network: str) -> str:
    """Runtime bytecode (0x-prefixed) or "" for EOAs / self-destructed contracts."""
    try:
        code = rpc_call(network, "eth_getCode", [address, "latest"])
    except RuntimeError as exc:
        logger.warning(f"[rpc] eth_getCode failed for {address}: {exc}")
        return ""
    if code in (None, "", "0x", "0x0"):
        return ""
    return code


def bytecode_hash(code: str) -> str:
    """Stable fingerprint of deployed bytecode (sha256, 0x-prefixed, 66 chars)."""
    if not code:
        return ""
    return "0x" + hashlib.sha256(code.lower().encode()).hexdigest()
