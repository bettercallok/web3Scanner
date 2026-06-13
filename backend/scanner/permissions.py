from rest_framework.permissions import BasePermission
from django.conf import settings

class HasAPIKey(BasePermission):
    def has_permission(self, request, view):
        if settings.DEBUG:
            return True
        api_key = request.headers.get('X-API-Key')
        return api_key == getattr(settings, 'API_SECRET_KEY', None)
