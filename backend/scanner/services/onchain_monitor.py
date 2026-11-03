"""
Real-time on-chain monitor for watched mainnet contracts.

Subscribes to logs for every watched address over a websocket RPC endpoint
(``ETH_WSS_URL``) and reacts to security-relevant governance events:

* ``Upgraded(address)``              — proxy implementation changed
* ``AdminChanged(address,address)``  — proxy admin changed
* ``BeaconUpgraded(address)``        — beacon implementation changed
* ``OwnershipTransferred(address,address)``

For each, watchers are alerted and a fresh scan is queued (debounced to once
per contract per hour). Other logs are ignored. The subscription is refreshed
periodically so newly watched contracts are picked up without a restart.
"""
import asyncio
import json
import logging

import websockets
from asgiref.sync import sync_to_async
from django.conf import settings

logger = logging.getLogger(__name__)

EVENT_TOPICS = {
    "0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b": "Upgraded",
    "0x7e644d79422f17c01e4894b5f4f588d331ebfa28653d42ae832dc59e38c9798f": "AdminChanged",
    "0x1cf3b03a6cf19fa2baba4df148e9dcabedea7f8a5c07840e207e5c089be95d3e": "BeaconUpgraded",
    "0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0": "OwnershipTransferred",
}
RESUBSCRIBE_EVERY = 600   # seconds — pick up watchlist changes
DEBOUNCE_SECONDS = 3600


def classify_log(log_entry: dict) -> str | None:
    topics = log_entry.get("topics") or []
    if not topics:
        return None
    return EVENT_TOPICS.get(str(topics[0]).lower())


def _handle_event(address: str, event: str, tx_hash: str) -> int:
    """Alert watchers and queue rescans. Returns number of scans queued."""
    from django.core.cache import cache

    from notifications.services import send_alert
    from scanner.models import WatchedContract
    from scanner.tasks import queue_scan_for

    if not cache.add(f"onchain_event:{address}", "1", DEBOUNCE_SECONDS):
        logger.info(f"[monitor] {event} on {address} debounced")
        return 0

    queued = 0
    for watched in WatchedContract.objects.filter(address__iexact=address, network="mainnet").select_related("user"):
        job, created = queue_scan_for(watched.user, watched.address, watched.network, f"on-chain {event}")
        queued += int(created)
        if watched.alert_on_new_vuln:
            send_alert(
                user=watched.user,
                subject=f"{event} on {watched.label or watched.address}",
                message=(
                    f"A {event} event was emitted by {watched.address} in tx {tx_hash}.\n"
                    f"A new security scan was queued: {settings.FRONTEND_URL}/scan/{job.id}"
                ),
                force=True,
            )
    return queued


async def monitor_watched_contracts():
    from scanner.models import WatchedContract

    wss_url = getattr(settings, "ETH_WSS_URL", "")
    if not wss_url:
        logger.warning("[monitor] ETH_WSS_URL is not set — on-chain monitor is idle.")
        while True:
            await asyncio.sleep(3600)

    logger.info("[monitor] starting on-chain monitor")
    while True:
        try:
            watched_addresses = await sync_to_async(
                lambda: sorted({a.lower() for a in WatchedContract.objects.filter(network="mainnet").values_list("address", flat=True)})
            )()
            if not watched_addresses:
                await asyncio.sleep(60)
                continue

            async with websockets.connect(wss_url, ping_interval=30, close_timeout=5) as ws:
                await ws.send(json.dumps({
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "eth_subscribe",
                    "params": ["logs", {"address": watched_addresses, "topics": [list(EVENT_TOPICS)]}],
                }))
                ack = json.loads(await ws.recv())
                if "error" in ack:
                    raise RuntimeError(f"subscribe failed: {ack['error']}")
                logger.info(f"[monitor] subscribed to {len(watched_addresses)} contracts")

                loop = asyncio.get_running_loop()
                deadline = loop.time() + RESUBSCRIBE_EVERY
                while loop.time() < deadline:
                    try:
                        msg = await asyncio.wait_for(ws.recv(), timeout=max(1, deadline - loop.time()))
                    except asyncio.TimeoutError:
                        break
                    data = json.loads(msg)
                    log_entry = (data.get("params") or {}).get("result") or {}
                    event = classify_log(log_entry)
                    if not event:
                        continue
                    address = str(log_entry.get("address", "")).lower()
                    tx_hash = str(log_entry.get("transactionHash", ""))
                    logger.warning(f"[monitor] 🚨 {event} on {address} (tx {tx_hash})")
                    await sync_to_async(_handle_event)(address, event, tx_hash)
        except Exception as e:
            # Never log the URL: provider URLs embed API keys.
            logger.error(f"[monitor] websocket error ({e.__class__.__name__}); reconnecting in 10s")
            await asyncio.sleep(10)
