from django.contrib import admin

from .models import NotificationSetting


@admin.register(NotificationSetting)
class NotificationSettingAdmin(admin.ModelAdmin):
    list_display = ["user", "email_enabled", "alert_on_critical", "alert_on_high", "alert_on_medium"]
    search_fields = ["user__username", "user__email"]
