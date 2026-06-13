import asyncio
import json
import logging
import websockets
from django.conf import settings
from asgiref.sync import sync_to_async

logger = logging.getLogger(__name__)

# Replace with your actual Alchemy/Infura WS endpoint or add to .env
# WSS_URL = settings.ETH_WSS_URL
WSS_URL = "wss://eth-mainnet.g.alchemy.com/v2/demo"

async def monitor_watched_contracts():
    from scanner.models import WatchedContract
    
    logger.info(f"Starting On-Chain Monitor connected to {WSS_URL}")
    
    while True:
        try:
            # Re-fetch the list of watched addresses every iteration (in case of disconnect)
            watched_qs = await sync_to_async(list)(WatchedContract.objects.filter(network="mainnet"))
            watched_addresses = [wc.address.lower() for wc in watched_qs]
            
            if not watched_addresses:
                logger.info("No mainnet contracts watched. Sleeping for 60s...")
                await asyncio.sleep(60)
                continue

            async with websockets.connect(WSS_URL) as ws:
                # Subscribe to logs for all watched addresses
                subscribe_msg = {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "eth_subscribe",
                    "params": ["logs", {"address": watched_addresses}]
                }
                await ws.send(json.dumps(subscribe_msg))
                res = await ws.recv()
                logger.info(f"Subscribed to logs for {len(watched_addresses)} contracts: {res}")

                while True:
                    msg = await ws.recv()
                    data = json.loads(msg)
                    
                    if "params" in data and "result" in data["params"]:
                        log_entry = data["params"]["result"]
                        address = log_entry.get("address", "").lower()
                        tx_hash = log_entry.get("transactionHash", "")
                        
                        # In a real scenario, you'd decode the event (e.g. OwnershipTransferred, Upgraded)
                        # Or detect massive unusual value transfers. For Phase 4, we'll log it and trigger analysis
                        logger.warning(f"🚨 Anomalous activity detected on {address} in tx {tx_hash}!")
                        
                        # Trigger an alert/rescan (handled in next steps)
                        
        except Exception as e:
            logger.error(f"WebSocket Error: {e}. Reconnecting in 10s...")
            await asyncio.sleep(10)
