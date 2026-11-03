"""
WebSocket consumer for real-time scan progress updates.
"""
import json
import uuid

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer


@database_sync_to_async
def _job_snapshot(job_id, user):
    from .models import ScanJob
    from .security import can_view_job

    job = ScanJob.objects.filter(id=job_id).only(
        "id", "user_id", "is_public", "status", "progress", "status_message"
    ).first()
    if job is None or not can_view_job(job, user):
        return None
    return {"status": job.status, "progress": job.progress, "message": job.status_message}


class ScanProgressConsumer(AsyncWebsocketConsumer):
    group_name = None

    async def connect(self):
        raw_id = self.scope["url_route"]["kwargs"]["job_id"]
        try:
            uuid.UUID(raw_id)
        except ValueError:
            await self.close(code=4400)
            return

        snapshot = await _job_snapshot(raw_id, self.scope.get("user"))
        if snapshot is None:
            await self.close(code=4403)
            return

        self.job_id = raw_id
        self.group_name = f"scan_{self.job_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        # Send current state immediately so late joiners are in sync.
        await self.send(text_data=json.dumps({"type": "progress", **snapshot}))

    async def disconnect(self, close_code):
        if self.group_name:
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        # Read-only channel; ignore client messages.
        return

    async def scan_progress(self, event):
        """Receive progress from Celery task and forward to browser."""
        payload = {"type": "progress", "progress": event["progress"], "message": event["message"]}
        if event.get("status"):
            payload["status"] = event["status"]
        await self.send(text_data=json.dumps(payload))
