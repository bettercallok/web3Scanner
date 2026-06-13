from django.db import models
from django.contrib.auth.models import User

class NotificationSetting(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="notification_settings")
    email_enabled = models.BooleanField(default=True)
    slack_webhook_url = models.URLField(blank=True, null=True)
    telegram_chat_id = models.CharField(max_length=100, blank=True, null=True)
    
    # Thresholds
    alert_on_critical = models.BooleanField(default=True)
    alert_on_high = models.BooleanField(default=True)
    alert_on_medium = models.BooleanField(default=False)
    
    def __str__(self):
        return f"Notification Settings - {self.user.username}"
