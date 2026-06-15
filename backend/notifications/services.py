import logging
import requests
from django.core.mail import send_mail
from django.conf import settings
from .models import NotificationSetting

logger = logging.getLogger(__name__)

def send_alert(user, subject, message, risk_level=None):
    try:
        settings_obj = NotificationSetting.objects.get(user=user)
    except NotificationSetting.DoesNotExist:
        return

    # Check thresholds if a risk level is provided
    if risk_level:
        if risk_level == "Critical" and not settings_obj.alert_on_critical:
            return
        if risk_level == "High" and not settings_obj.alert_on_high:
            return
        if risk_level == "Medium" and not settings_obj.alert_on_medium:
            return
        if risk_level == "Low":
            return # We don't alert on Low by default

    # 1. Email
    if settings_obj.email_enabled and user.email:
        try:
            send_mail(
                subject=subject,
                message=message,
                from_email=settings.DEFAULT_FROM_EMAIL if hasattr(settings, 'DEFAULT_FROM_EMAIL') else 'alerts@web3scanner.local',
                recipient_list=[user.email],
                fail_silently=True,
            )
        except Exception as e:
            logger.error(f"Failed to send email to {user.email}: {e}")

    # 2. Slack
    if settings_obj.slack_webhook_url and settings_obj.slack_webhook_url.startswith("https://hooks.slack.com/services/"):
        try:
            requests.post(settings_obj.slack_webhook_url, json={"text": f"*{subject}*\n{message}"}, timeout=5)
        except Exception as e:
            logger.error(f"Failed to send Slack alert: {e}")

    # 3. Telegram
    if settings_obj.telegram_chat_id and hasattr(settings, 'TELEGRAM_BOT_TOKEN'):
        try:
            tg_url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
            requests.post(tg_url, json={
                "chat_id": settings_obj.telegram_chat_id,
                "text": f"🚨 *{subject}*\n{message}",
                "parse_mode": "Markdown"
            }, timeout=5)
        except Exception as e:
            logger.error(f"Failed to send Telegram alert: {e}")
