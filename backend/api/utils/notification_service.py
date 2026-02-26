"""
Notification Service for Expo Push Notifications.

This service handles sending push notifications via Expo's Push API
for class reminders and other notifications.

Usage:
    from api.utils.notification_service import NotificationService
    
    service = NotificationService()
    service.send_push_notification(
        token="ExponentPushToken[xxxxx]",
        title="Class Starting Soon",
        body="Software Engineering starts in 15 minutes"
    )
"""

import requests
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any

logger = logging.getLogger(__name__)

# Expo Push API endpoint
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


class NotificationService:
    """
    Service class for sending push notifications via Expo's Push API.
    """
    
    def __init__(self):
        self.push_url = EXPO_PUSH_URL
    
    def send_push_notification(
        self,
        token: str,
        title: str,
        body: str,
        data: Optional[Dict[str, Any]] = None,
        sound: str = "default",
        badge: Optional[int] = None,
        channel_id: str = "default"
    ) -> Dict[str, Any]:
        """
        Send a push notification to a single device.
        
        Args:
            token: Expo push token (ExponentPushToken[...])
            title: Notification title
            body: Notification body text
            data: Optional data payload to send with notification
            sound: Sound to play (default, or null for silent)
            badge: Badge number to display on app icon
            channel_id: Android notification channel ID
            
        Returns:
            Response dict from Expo API
        """
        if not token:
            logger.warning("Cannot send notification: No token provided")
            return {"status": "error", "message": "No token provided"}
        
        message = {
            "to": token,
            "title": title,
            "body": body,
            "sound": sound,
            "channelId": channel_id,
        }
        
        if data:
            message["data"] = data
        if badge is not None:
            message["badge"] = badge
        
        try:
            response = requests.post(
                self.push_url,
                json=message,
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip, deflate",
                    "Content-Type": "application/json",
                },
                timeout=10
            )
            response.raise_for_status()
            result = response.json()
            
            # Check if the push was successful
            if result.get("data", {}).get("status") == "ok":
                logger.info(f"Push notification sent successfully to token ending in ...{token[-10:]}")
            else:
                logger.warning(f"Push notification may have failed: {result}")
            
            return result
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to send push notification: {str(e)}")
            return {"status": "error", "message": str(e)}
    
    def send_batch_notifications(
        self,
        notifications: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Send multiple push notifications in a single request.
        
        Args:
            notifications: List of notification dicts with keys:
                - token: Expo push token
                - title: Notification title  
                - body: Notification body
                - data: Optional data payload
                
        Returns:
            List of response dicts from Expo API
        """
        if not notifications:
            return []
        
        messages = []
        for notif in notifications:
            if not notif.get("token"):
                continue
            messages.append({
                "to": notif["token"],
                "title": notif.get("title", "SchedScan"),
                "body": notif.get("body", ""),
                "sound": "default",
                "channelId": "default",
                "data": notif.get("data", {}),
            })
        
        if not messages:
            return []
        
        try:
            response = requests.post(
                self.push_url,
                json=messages,
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip, deflate",
                    "Content-Type": "application/json",
                },
                timeout=30
            )
            response.raise_for_status()
            result = response.json()
            logger.info(f"Batch push: Sent {len(messages)} notifications")
            return result.get("data", [])
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to send batch notifications: {str(e)}")
            return []


def get_day_code_from_weekday(weekday: int) -> str:
    """
    Convert Python weekday (0=Monday) to course day code.
    """
    day_map = {
        0: 'M',
        1: 'T',
        2: 'W',
        3: 'TH',
        4: 'F',
        5: 'S',
        6: 'SU',  # Sunday if needed
    }
    return day_map.get(weekday, '')


def parse_time_string(time_str: str) -> Optional[datetime]:
    """
    Parse a time string like "07:00AM" or "2:30PM" to datetime.
    
    Returns:
        datetime object with today's date and parsed time, or None if parsing fails
    """
    if not time_str:
        return None
    
    time_str = time_str.strip().upper()
    
    # Try various formats
    formats = [
        "%I:%M%p",      # 07:00AM
        "%I:%M %p",     # 07:00 AM
        "%H:%M",        # 07:00 (24-hour)
        "%I%p",         # 7AM
        "%I %p",        # 7 AM
    ]
    
    for fmt in formats:
        try:
            parsed = datetime.strptime(time_str, fmt)
            # Combine with today's date
            now = datetime.now()
            return now.replace(
                hour=parsed.hour,
                minute=parsed.minute,
                second=0,
                microsecond=0
            )
        except ValueError:
            continue
    
    logger.warning(f"Could not parse time string: {time_str}")
    return None


def send_upcoming_class_reminders(
    minutes_before: int = 15,
    dry_run: bool = False
) -> Dict[str, Any]:
    """
    Check all active schedules and send reminders for classes starting soon.
    Also creates persistent Notification records in the database.
    
    Args:
        minutes_before: How many minutes before class to send reminder
        dry_run: If True, don't actually send notifications, just log what would be sent
        
    Returns:
        Dict with stats about notifications sent
    """
    from django.contrib.auth import get_user_model
    from api.models import Schedule, Course, Notification
    
    User = get_user_model()
    
    now = datetime.now()
    current_day = get_day_code_from_weekday(now.weekday())
    reminder_time = now + timedelta(minutes=minutes_before)
    
    logger.info(f"Checking for classes at {reminder_time.strftime('%I:%M %p')} on {current_day}")
    
    stats = {
        "checked_users": 0,
        "notifications_sent": 0,
        "notifications_stored": 0,
        "errors": 0,
        "dry_run": dry_run,
    }
    
    # Get all users with expo push tokens and active schedules
    users_with_tokens = User.objects.filter(
        expo_push_token__isnull=False
    ).exclude(expo_push_token='')
    
    service = NotificationService()
    
    for user in users_with_tokens:
        stats["checked_users"] += 1
        
        # Get active schedule
        try:
            active_schedule = Schedule.objects.get(user=user, is_active=True)
        except Schedule.DoesNotExist:
            continue
        
        # Get courses for today
        courses_today = Course.objects.filter(
            schedule=active_schedule,
            day=current_day
        )
        
        for course in courses_today:
            start_time = parse_time_string(course.start_time)
            if not start_time:
                continue
            
            # Check if class starts within the reminder window
            # We check if the class starts between (now) and (now + minutes_before + 1)
            time_until_class = (start_time - now).total_seconds() / 60
            
            # Send notification if class is between (minutes_before-1) and (minutes_before+1) minutes away
            if minutes_before - 1 <= time_until_class <= minutes_before + 1:
                # Dedup: skip if a class_reminder for this course was already sent today
                from django.utils import timezone as tz
                today_start = tz.now().replace(hour=0, minute=0, second=0, microsecond=0)
                already_sent = Notification.objects.filter(
                    user=user,
                    notification_type='class_reminder',
                    data__course_id=course.id,
                    created_at__gte=today_start,
                ).exists()
                if already_sent:
                    continue

                title = f"{course.subject_name or course.subject_code}"
                body = f"Starts in {int(time_until_class)} minutes"
                if course.location:
                    body += f" at {course.location}"
                
                data_payload = {
                    "type": "class_reminder",
                    "course_id": course.id,
                    "subject_code": course.subject_code,
                }
                
                if dry_run:
                    logger.info(f"[DRY RUN] Would send to {user.email}: {title} - {body}")
                    stats["notifications_sent"] += 1
                else:
                    # Store notification in DB
                    Notification.objects.create(
                        user=user,
                        notification_type='class_reminder',
                        title=title,
                        message=body,
                        data=data_payload,
                    )
                    stats["notifications_stored"] += 1

                    # Send push notification
                    result = service.send_push_notification(
                        token=user.expo_push_token,
                        title=title,
                        body=body,
                        data=data_payload,
                    )
                    
                    if result.get("status") != "error":
                        stats["notifications_sent"] += 1
                    else:
                        stats["errors"] += 1
    
    logger.info(f"Reminder check complete: {stats}")
    return stats


def notify_students_of_faculty_task(
    faculty_user,
    subject_code: str,
    task_text: str,
    task_id: int,
    due_date: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Send push notifications + create DB records for all students who have the
    given subject_code in their active schedule when a faculty uploads a new task.
    
    Args:
        faculty_user: The faculty User object
        subject_code: The subject code the task was created for
        task_text: The task description text
        task_id: The PK of the newly created FacultyTask
        due_date: Optional due date string
        
    Returns:
        Dict with stats about notifications sent
    """
    from django.contrib.auth import get_user_model
    from api.models import Schedule, Course, ClassEnrollment, Notification

    User = get_user_model()

    stats = {
        "students_found": 0,
        "notifications_sent": 0,
        "notifications_stored": 0,
        "errors": 0,
    }

    # Deduplicate by user (a student might appear via both schedule and enrollment)
    seen_user_ids = set()
    students_to_notify = []

    # 1) Find students who have this subject_code in their active schedule
    student_courses = Course.objects.filter(
        subject_code=subject_code,
        schedule__is_active=True,
        schedule__user__user_type='student',
    ).select_related('schedule__user').exclude(
        schedule__user=faculty_user  # Exclude the faculty themselves
    )

    for course in student_courses:
        user = course.schedule.user
        if user.id not in seen_user_ids:
            seen_user_ids.add(user.id)
            students_to_notify.append(user)

    # 2) Find students enrolled via class code for this faculty + subject
    enrolled_students = ClassEnrollment.objects.filter(
        faculty=faculty_user,
        subject_code=subject_code,
        status='active',
    ).select_related('student').exclude(
        student=faculty_user
    )

    for enrollment in enrolled_students:
        if enrollment.student.id not in seen_user_ids:
            seen_user_ids.add(enrollment.student.id)
            students_to_notify.append(enrollment.student)

    stats["students_found"] = len(students_to_notify)

    if not students_to_notify:
        logger.info(f"No students found with {subject_code} in active schedule or enrollments")
        return stats

    title = f"New Task: {subject_code}"
    body = task_text[:200]  # Truncate long task text
    if due_date:
        body += f"\nDue: {due_date}"

    data_payload = {
        "type": "faculty_task",
        "task_id": task_id,
        "subject_code": subject_code,
        "faculty_name": faculty_user.get_full_name() or faculty_user.email,
    }

    service = NotificationService()
    batch_messages = []

    for student in students_to_notify:
        # Always store in DB
        Notification.objects.create(
            user=student,
            notification_type='faculty_task',
            title=title,
            message=body,
            data=data_payload,
        )
        stats["notifications_stored"] += 1

        # Queue push notification if they have a token
        if student.expo_push_token:
            batch_messages.append({
                "token": student.expo_push_token,
                "title": title,
                "body": body,
                "data": data_payload,
            })

    # Send push notifications in batch
    if batch_messages:
        results = service.send_batch_notifications(batch_messages)
        stats["notifications_sent"] = len(batch_messages)
        logger.info(
            f"Sent {len(batch_messages)} push notifications for task "
            f"'{task_text[:30]}' in {subject_code}"
        )

    logger.info(f"Faculty task notification complete: {stats}")
    return stats
