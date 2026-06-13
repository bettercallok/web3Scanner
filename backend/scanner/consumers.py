"""
WebSocket consumer for real-time scan progress updates.
"""
import json
from channels.generic.websocket import AsyncWebsocketConsumer


class ScanProgressConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        import uuid
        raw_id = self.scope["url_route"]["kwargs"]["job_id"]
        try:
            uuid.UUID(raw_id)
        except ValueError:
            await self.close()
            return
        self.job_id = raw_id
        self.group_name = f"scan_{self.job_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def scan_progress(self, event):
        """Receive progress from Celery task and forward to browser."""
        await self.send(text_data=json.dumps({
            "type": "progress",
            "progress": event["progress"],
            "message": event["message"],
        }))
