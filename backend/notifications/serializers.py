import re

from rest_framework import serializers

from .models import NotificationSetting

SLACK_PREFIX = "https://hooks.slack.com/services/"
_TG_CHAT = re.compile(r"^-?\d{1,20}$|^@[A-Za-z0-9_]{5,32}$")


class NotificationSettingSerializer(serializers.ModelSerializer):
    telegram_available = serializers.SerializerMethodField()

    class Meta:
        model = NotificationSetting
        fields = [
            "email_enabled", "slack_webhook_url", "telegram_chat_id",
            "alert_on_critical", "alert_on_high", "alert_on_medium",
            "telegram_available",
        ]

    def get_telegram_available(self, obj):
        from django.conf import settings

        return bool(getattr(settings, "TELEGRAM_BOT_TOKEN", ""))

    def validate_slack_webhook_url(self, value):
        value = (value or "").strip()
        if value and not value.startswith(SLACK_PREFIX):
            # Only Slack's own host is allowed: arbitrary URLs would turn the
            # alert sender into an SSRF primitive against internal services.
            raise serializers.ValidationError(f"Must be a Slack incoming webhook URL ({SLACK_PREFIX}...).")
        return value or None

    def validate_telegram_chat_id(self, value):
        value = (value or "").strip()
        if value and not _TG_CHAT.match(value):
            raise serializers.ValidationError("Must be a numeric chat ID or an @channel username.")
        return value or None
