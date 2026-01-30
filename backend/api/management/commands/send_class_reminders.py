"""
Django Management Command: send_class_reminders

Sends push notifications for classes starting soon.
Run this command periodically via cron (e.g., every 5 minutes).

Usage:
    # Send reminders for classes in 15 minutes
    python manage.py send_class_reminders
    
    # Send reminders for classes in 30 minutes
    python manage.py send_class_reminders --minutes 30
    
    # Dry run (preview without sending)
    python manage.py send_class_reminders --dry-run

Cron example (run every 5 minutes):
    */5 * * * * cd /path/to/backend && /path/to/.venv/bin/python manage.py send_class_reminders
"""

from django.core.management.base import BaseCommand
from api.utils.notification_service import send_upcoming_class_reminders


class Command(BaseCommand):
    help = 'Send push notifications for upcoming classes'

    def add_arguments(self, parser):
        parser.add_argument(
            '--minutes',
            type=int,
            default=15,
            help='Minutes before class to send reminder (default: 15)'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview notifications without sending'
        )

    def handle(self, *args, **options):
        minutes = options['minutes']
        dry_run = options['dry_run']
        
        if dry_run:
            self.stdout.write(self.style.WARNING(
                f'[DRY RUN] Checking for classes starting in {minutes} minutes...'
            ))
        else:
            self.stdout.write(
                f'Checking for classes starting in {minutes} minutes...'
            )
        
        stats = send_upcoming_class_reminders(
            minutes_before=minutes,
            dry_run=dry_run
        )
        
        self.stdout.write(self.style.SUCCESS(
            f"Complete! Checked {stats['checked_users']} users, "
            f"sent {stats['notifications_sent']} notifications, "
            f"{stats['errors']} errors"
        ))
