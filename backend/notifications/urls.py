from django.urls import path

from .views import NotificationSettingView, TestNotificationView

urlpatterns = [
    path("settings/", NotificationSettingView.as_view(), name="notification-settings"),
    path("test/", TestNotificationView.as_view(), name="notification-test"),
]
