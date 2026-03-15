"""
Django Management Command: send_class_reminders

Sends push notifications for classes starting soon.
Run this command periodically via cron (e.g., every 5 minutes).

Usage:
    # Send reminders using each user's saved preference
    python manage.py send_class_reminders
    
    # Send reminders for classes in 10 minutes (override)
    python manage.py send_class_reminders --minutes 10
    
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
            choices=[5, 10, 15],
            default=None,
            help='Optional override minutes before class to send reminder (allowed: 5, 10, 15)'
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
            if minutes is None:
                self.stdout.write(self.style.WARNING(
                    '[DRY RUN] Checking for classes using each user\'s saved reminder preference...'
                ))
            else:
                self.stdout.write(self.style.WARNING(
                    f'[DRY RUN] Checking for classes starting in {minutes} minutes...'
                ))
        else:
            if minutes is None:
                self.stdout.write('Checking for classes using each user\'s saved reminder preference...')
            else:
                self.stdout.write(f'Checking for classes starting in {minutes} minutes...')
        
        stats = send_upcoming_class_reminders(
            minutes_before=minutes,
            dry_run=dry_run
        )

        if stats.get('skipped'):
            self.stdout.write(self.style.WARNING(
                f"Skipped: {stats.get('skip_reason', 'unknown_reason')}"
            ))
        
        self.stdout.write(self.style.SUCCESS(
            f"Complete! Checked {stats['checked_users']} users, "
            f"sent {stats['notifications_sent']} notifications, "
            f"{stats['errors']} errors"
        ))
