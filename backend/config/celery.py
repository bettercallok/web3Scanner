"""
Celery application factory for Web3 Scanner.
"""
import os
from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("web3scanner")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

from celery.schedules import crontab

app.conf.beat_schedule = {
    'check_watchlist_daily': {
        'task': 'scanner.tasks.check_watchlist_task',
        'schedule': crontab(hour=0, minute=0), # Run daily at midnight
    },
    'scheduled_rescan_daily': {
        'task': 'scanner.tasks.scheduled_rescan_task',
        'schedule': crontab(hour=1, minute=0), # Run daily at 1 AM
    },
}
