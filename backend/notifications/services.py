import logging

import requests
from django.conf import settings
from django.core.mail import send_mail

from .models import NotificationSetting

logger = logging.getLogger(__name__)

SLACK_PREFIX = "https://hooks.slack.com/services/"


def _wants(settings_obj, risk_level) -> bool:
    if not risk_level:
        return True
    return {
        "Critical": settings_obj.alert_on_critical,
        "High": settings_obj.alert_on_high,
        "Medium": settings_obj.alert_on_medium,
    }.get(risk_level, False)  # Low / unknown → no alert


def send_alert(user, subject, message, risk_level=None, force=False) -> list[str]:
    """
    Deliver an alert on every channel the user enabled.

    Returns the list of channels that accepted the message (useful for the
    "send test alert" button). ``force`` bypasses the risk-level thresholds.
    """
    try:
        settings_obj = NotificationSetting.objects.get(user=user)
    except NotificationSetting.DoesNotExist:
        return []

    if not force and not _wants(settings_obj, risk_level):
        return []

    delivered = []

    # 1. Email
    if settings_obj.email_enabled and user.email:
        try:
            sent = send_mail(
                subject=subject[:200],
                message=message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=False,
            )
            if sent:
                delivered.append("email")
        except Exception as e:
            logger.error(f"Failed to send email alert to user {user.id}: {e.__class__.__name__}")

    # 2. Slack (host allow-listed to prevent SSRF)
    url = settings_obj.slack_webhook_url or ""
    if url.startswith(SLACK_PREFIX):
        try:
            resp = requests.post(url, json={"text": f"*{subject}*\n{message}"}, timeout=5, allow_redirects=False)
            if resp.ok:
                delivered.append("slack")
        except requests.RequestException as e:
            logger.error(f"Failed to send Slack alert: {e.__class__.__name__}")

    # 3. Telegram
    token = getattr(settings, "TELEGRAM_BOT_TOKEN", "")
    if settings_obj.telegram_chat_id and token:
        try:
            # Plain text: contract names are attacker-controlled and would
            # break (or abuse) Markdown parsing.
            resp = requests.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": settings_obj.telegram_chat_id, "text": f"🚨 {subject}\n{message}"},
                timeout=5,
            )
            if resp.ok:
                delivered.append("telegram")
        except requests.RequestException as e:
            # Never log the exception text: the URL contains the bot token.
            logger.error(f"Failed to send Telegram alert: {e.__class__.__name__}")

    return delivered
