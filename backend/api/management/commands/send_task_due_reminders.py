"""
Django Management Command: send_task_due_reminders

Sends push notifications for personal/faculty tasks with due dates approaching
or recently overdue.

Usage:
    python manage.py send_task_due_reminders
    python manage.py send_task_due_reminders --dry-run

Cron example (every 5 minutes):
    */5 * * * * cd /path/to/backend && /path/to/.venv/bin/python manage.py send_task_due_reminders
"""

from django.core.management.base import BaseCommand

from api.utils.notification_service import send_due_task_reminders


class Command(BaseCommand):
    help = 'Send push notifications for due and overdue tasks'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview reminders without sending push notifications or writing DB records',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']

        if dry_run:
            self.stdout.write(self.style.WARNING('[DRY RUN] Checking due-task reminders...'))
        else:
            self.stdout.write('Checking due-task reminders...')

        stats = send_due_task_reminders(dry_run=dry_run)

        if stats.get('skipped'):
            self.stdout.write(self.style.WARNING(
                f"Skipped: {stats.get('skip_reason', 'unknown_reason')}"
            ))

        self.stdout.write(self.style.SUCCESS(
            "Complete! "
            f"scanned {stats['tasks_scanned']} personal tasks and "
            f"{stats['faculty_tasks_scanned']} faculty tasks, "
            f"stored {stats['notifications_stored']} notifications, "
            f"sent {stats['notifications_sent']} pushes, "
            f"{stats['duplicates_skipped']} duplicates skipped, "
            f"{stats['completed_skipped']} completed skipped, "
            f"{stats['errors']} errors"
        ))
