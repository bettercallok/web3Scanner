import hmac

from django.conf import settings
from rest_framework.permissions import BasePermission


class HasAPIKey(BasePermission):
    """
    Machine-to-machine access via ``X-API-Key``.

    Denies everything when ``API_SECRET_KEY`` is unset (no insecure default),
    and compares in constant time to avoid timing side channels.
    """

    def has_permission(self, request, view):
        expected = getattr(settings, "API_SECRET_KEY", "") or ""
        provided = request.headers.get("X-API-Key") or ""
        if not expected or not provided:
            return False
        return hmac.compare_digest(provided.encode(), expected.encode())
