from asgiref.sync import async_to_sync
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.contrib.auth.models import User
from django.test import TransactionTestCase, override_settings
from rest_framework_simplejwt.tokens import AccessToken

from scanner import routing
from scanner.models import ScanJob
from scanner.ws_auth import JWTAuthMiddlewareStack

APP = JWTAuthMiddlewareStack(URLRouter(routing.websocket_urlpatterns))


@override_settings(CHANNEL_LAYERS={"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}})
class WebsocketAuthTests(TransactionTestCase):
    def setUp(self):
        self.owner = User.objects.create_user("o", password="x")
        self.other = User.objects.create_user("p", password="x")
        self.job = ScanJob.objects.create(address="0x" + "a" * 40, user=self.owner, progress=25, status="analyzing")

    def _connect(self, token=None):
        async def run():
            path = f"/ws/scan/{self.job.id}/" + (f"?token={token}" if token else "")
            comm = WebsocketCommunicator(APP, path)
            connected, _ = await comm.connect()
            first = await comm.receive_json_from() if connected else None
            await comm.disconnect()
            return connected, first

        return async_to_sync(run)()

    def test_owner_can_subscribe_and_gets_snapshot(self):
        connected, first = self._connect(str(AccessToken.for_user(self.owner)))
        self.assertTrue(connected)
        self.assertEqual(first["progress"], 25)

    def test_anonymous_and_other_users_rejected(self):
        self.assertFalse(self._connect()[0])
        self.assertFalse(self._connect("garbage")[0])
        self.assertFalse(self._connect(str(AccessToken.for_user(self.other)))[0])

    def test_public_job_open_to_anyone(self):
        self.job.is_public = True
        self.job.save()
        self.assertTrue(self._connect()[0])
