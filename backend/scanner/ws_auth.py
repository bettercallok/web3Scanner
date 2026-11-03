"""
JWT authentication for Channels websockets.

Browsers cannot set an ``Authorization`` header on a WebSocket handshake, so
the frontend passes the access token as ``?token=<jwt>``. Invalid/missing
tokens yield ``AnonymousUser``; the consumer then decides whether the job is
viewable (owner, public, or ownerless).
"""
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware


@database_sync_to_async
def _user_from_token(raw_token: str):
    from django.contrib.auth.models import AnonymousUser
    from rest_framework_simplejwt.authentication import JWTAuthentication
    from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

    if not raw_token:
        return AnonymousUser()
    auth = JWTAuthentication()
    try:
        validated = auth.get_validated_token(raw_token)
        return auth.get_user(validated)
    except (InvalidToken, TokenError, Exception):
        return AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        qs = parse_qs((scope.get("query_string") or b"").decode())
        token = (qs.get("token") or [""])[0]
        if token:
            scope["user"] = await _user_from_token(token)
        return await super().__call__(scope, receive, send)


def JWTAuthMiddlewareStack(inner):
    from channels.auth import AuthMiddlewareStack

    # Session auth first (admin users), then JWT overrides when a token is supplied.
    return AuthMiddlewareStack(JWTAuthMiddleware(inner))


def websocket_allowed_origins() -> list[str]:
    """
    Origins allowed to open websockets: the API's own hosts plus every
    configured CORS origin (the SPA is usually served from a different host,
    e.g. Vercel, than the API).
    """
    from django.conf import settings

    origins = list(settings.ALLOWED_HOSTS)
    origins += list(getattr(settings, "CORS_ALLOWED_ORIGINS", []))
    if settings.DEBUG:
        origins.append("*")
    return origins
