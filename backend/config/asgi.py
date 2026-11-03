"""
ASGI config for Web3 Scanner — supports both HTTP (DRF) and WebSocket (Channels).
"""
import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import OriginValidator

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

django_asgi_app = get_asgi_application()

from scanner import routing  # noqa: E402 — import after setup
from scanner.ws_auth import JWTAuthMiddlewareStack, websocket_allowed_origins  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        # Origin check blocks cross-site WebSocket hijacking; JWT via ?token= identifies the user.
        "websocket": OriginValidator(
            JWTAuthMiddlewareStack(URLRouter(routing.websocket_urlpatterns)),
            websocket_allowed_origins(),
        ),
    }
)
