"""
Django Management Command: recover_stale_extraction_jobs

Marks stale extraction jobs as failed.
A stale job is any job in `processing` older than the configured max age.

Usage:
    python manage.py recover_stale_extraction_jobs
    python manage.py recover_stale_extraction_jobs --max-age-minutes 10
    python manage.py recover_stale_extraction_jobs --no-notify
    python manage.py recover_stale_extraction_jobs --dry-run
"""

from django.conf import settings
from django.core.management.base import BaseCommand

from api.utils.extraction_manager import recover_stale_processing_jobs


class Command(BaseCommand):
    help = 'Recover stale extraction jobs stuck in processing'

    def add_arguments(self, parser):
        parser.add_argument(
            '--max-age-minutes',
            type=int,
            default=int(getattr(settings, 'EXTRACTION_STALE_JOB_MAX_AGE_MINUTES', 5)),
            help='Consider jobs stale if processing for longer than this many minutes',
        )
        parser.add_argument(
            '--no-notify',
            action='store_true',
            help='Do not send user push notifications for recovered jobs',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Only report how many stale jobs exist without modifying data',
        )

    def handle(self, *args, **options):
        max_age_minutes = options['max_age_minutes']
        notify_user = not options['no_notify']
        dry_run = options['dry_run']

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f'[DRY RUN] Scanning for extraction jobs stale for more than {max_age_minutes} minutes...'
                )
            )
        else:
            self.stdout.write(
                f'Recovering extraction jobs stale for more than {max_age_minutes} minutes...'
            )

        recovered_count = recover_stale_processing_jobs(
            max_age_minutes=max_age_minutes,
            notify_user=notify_user,
            dry_run=dry_run,
        )

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f'[DRY RUN] Found {recovered_count} stale processing job(s).'
                )
            )
            return

        self.stdout.write(
            self.style.SUCCESS(
                f'Recovered {recovered_count} stale processing job(s).'
            )
        )
