from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import NotificationSetting
from .serializers import NotificationSettingSerializer


class NotificationSettingView(APIView):
    """GET / PUT / PATCH /api/notifications/settings/"""

    permission_classes = [permissions.IsAuthenticated]

    def _obj(self, request):
        obj, _ = NotificationSetting.objects.get_or_create(user=request.user)
        return obj

    def get(self, request):
        return Response(NotificationSettingSerializer(self._obj(request)).data)

    def put(self, request):
        return self._save(request, partial=False)

    def patch(self, request):
        return self._save(request, partial=True)

    def _save(self, request, partial):
        ser = NotificationSettingSerializer(self._obj(request), data=request.data, partial=partial)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


class TestNotificationView(APIView):
    """POST /api/notifications/test/ — send a test alert on every enabled channel."""

    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = "auth"

    def post(self, request):
        from .services import send_alert

        delivered = send_alert(
            user=request.user,
            subject="Web3 Scanner test alert",
            message="If you can read this, alerts are configured correctly.",
            force=True,
        )
        return Response({"delivered": delivered}, status=status.HTTP_200_OK)
