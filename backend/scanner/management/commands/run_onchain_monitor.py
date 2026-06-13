import asyncio
from django.core.management.base import BaseCommand
from scanner.services.onchain_monitor import monitor_watched_contracts

class Command(BaseCommand):
    help = "Runs the real-time on-chain monitor via WebSockets"

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("Starting On-Chain Monitor..."))
        try:
            asyncio.run(monitor_watched_contracts())
        except KeyboardInterrupt:
            self.stdout.write(self.style.WARNING("Monitor stopped manually."))
