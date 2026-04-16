from celery import shared_task

from api.utils.notification_service import send_due_task_reminders, send_upcoming_class_reminders


@shared_task(name='api.tasks.send_due_task_reminders')
def send_due_task_reminders_task(dry_run: bool = False):
    """Celery task wrapper for due-task reminder sender."""
    return send_due_task_reminders(dry_run=dry_run)


@shared_task(name='api.tasks.send_upcoming_class_reminders')
def send_upcoming_class_reminders_task(minutes_before=None, dry_run: bool = False):
    """Celery task wrapper for class reminder sender."""
    return send_upcoming_class_reminders(minutes_before=minutes_before, dry_run=dry_run)
