"""
Django Management Command: promote_faculty_users

One-time (or re-runnable) data migration that promotes users who already have
faculty schedules but whose user_type is still 'student'.

This handles the edge case where users uploaded faculty schedules before the
faculty-mode activation flow was implemented.

Going forward, the scanner upload flow (FacultyModeModal) handles activation
automatically, so this command is only needed for pre-existing data.

Usage:
    # Dry run — see who would be promoted
    python manage.py promote_faculty_users --dry-run

    # Actually promote them
    python manage.py promote_faculty_users
"""

from django.core.management.base import BaseCommand
from api.models import User, Schedule


class Command(BaseCommand):
    help = 'Promote users with faculty schedules to user_type=faculty'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview which users would be promoted without making changes',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']

        # Find users who have at least one faculty schedule but are still 'student'
        student_users_with_faculty_schedules = User.objects.filter(
            user_type='student',
            schedules__upload_type='faculty',
        ).distinct()

        count = student_users_with_faculty_schedules.count()

        if count == 0:
            self.stdout.write(self.style.SUCCESS('No users need promotion. All good!'))
            return

        self.stdout.write(f'Found {count} user(s) with faculty schedules still marked as student:\n')

        for user in student_users_with_faculty_schedules:
            faculty_count = Schedule.objects.filter(user=user, upload_type='faculty').count()
            self.stdout.write(
                f'  • {user.email} ({user.get_full_name()}) '
                f'— {faculty_count} faculty schedule(s)'
            )

        if dry_run:
            self.stdout.write(self.style.WARNING(
                f'\n[DRY RUN] Would promote {count} user(s). '
                f'Run without --dry-run to apply.'
            ))
            return

        # Promote them
        updated = student_users_with_faculty_schedules.update(user_type='faculty')
        self.stdout.write(self.style.SUCCESS(
            f'\nSuccessfully promoted {updated} user(s) to faculty mode.'
        ))
