"""
Proxy contract resolver.
Detects EIP-1967 / Transparent / UUPS proxy patterns via Etherscan metadata
and public JSON-RPC storage slot reads, then resolves the implementation address.
"""
import logging
import requests

logger = logging.getLogger(__name__)

# EIP-1967 standard implementation storage slot
EIP1967_IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"

# OpenZeppelin legacy proxy slot (non-EIP-1967)
OZ_IMPL_SLOT = "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3"

PUBLIC_RPC = {
    "mainnet":  "https://ethereum-rpc.publicnode.com",
    "polygon":  "https://polygon-rpc.com",
    "bsc":      "https://bsc-dataseed.binance.org",
    "arbitrum": "https://arb1.arbitrum.io/rpc",
    "optimism": "https://mainnet.optimism.io",
}


def detect_and_resolve_proxy(address: str, network: str, etherscan_result: dict) -> dict:
    """
    Detect if an address is a proxy and return the implementation address.

    Returns:
        {
            "is_proxy": bool,
            "implementation_address": str,   # lowercase 0x...
            "proxy_type": str,               # "transparent" | "eip1967" | "oz_legacy" | ""
        }
    """
    # 1. Etherscan explicitly marks proxies with Proxy=1 + Implementation field
    if etherscan_result.get("Proxy") == "1":
        impl = etherscan_result.get("Implementation", "").lower()
        if impl and impl != "0x" + "0" * 40:
            logger.info(f"[proxy] Etherscan-confirmed proxy {address} → impl {impl}")
            return {"is_proxy": True, "implementation_address": impl, "proxy_type": "transparent"}

    # 2. Try EIP-1967 implementation slot
    impl = _read_slot(address, EIP1967_IMPL_SLOT, network)
    if impl:
        logger.info(f"[proxy] EIP-1967 slot detected {address} → impl {impl}")
        return {"is_proxy": True, "implementation_address": impl, "proxy_type": "eip1967"}

    # 3. Try OZ legacy slot
    impl = _read_slot(address, OZ_IMPL_SLOT, network)
    if impl:
        logger.info(f"[proxy] OZ legacy slot detected {address} → impl {impl}")
        return {"is_proxy": True, "implementation_address": impl, "proxy_type": "oz_legacy"}

    return {"is_proxy": False, "implementation_address": "", "proxy_type": ""}


def _read_slot(address: str, slot: str, network: str) -> str:
    """
    Call eth_getStorageAt via public RPC, return the implementation address
    if the slot is non-zero, else empty string.
    """
    rpc_url = PUBLIC_RPC.get(network, PUBLIC_RPC["mainnet"])
    payload = {
        "jsonrpc": "2.0",
        "method":  "eth_getStorageAt",
        "params":  [address, slot, "latest"],
        "id":      1,
    }
    try:
        resp = requests.post(rpc_url, json=payload, timeout=8)
        resp.raise_for_status()
        value = resp.json().get("result", "0x")
        # 32-byte value → last 20 bytes are the address
        if len(value) >= 42:
            addr = "0x" + value[-40:]
            # All zeros means no implementation set
            if addr != "0x" + "0" * 40:
                return addr
    except Exception as exc:
        logger.debug(f"[proxy] RPC slot read failed for {address}: {exc}")
    return ""
