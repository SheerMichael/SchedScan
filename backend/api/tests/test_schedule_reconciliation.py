"""
Tests for faculty schedule lifecycle reconciliation.

Covers:
- Deleting a faculty schedule removes stale enrollments/class codes and notifies students.
- Subjects still taught in another faculty schedule are preserved.
- Updating a faculty schedule to remove a subject reconciles related records.
"""

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from api.models import (
    User,
    Schedule,
    Course,
    ClassEnrollment,
    ClassCode,
    Notification,
)


class FacultyScheduleReconciliationTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.faculty = User.objects.create_user(
            email='faculty_reconcile@test.com',
            password='testpass123',
            first_name='Faculty',
            last_name='Owner',
            user_type='faculty',
        )
        self.student = User.objects.create_user(
            email='student_reconcile@test.com',
            password='testpass123',
            first_name='Student',
            last_name='Linked',
            user_type='student',
            student_number='2026-40001',
        )

        self.client.force_authenticate(user=self.faculty)

    def _create_faculty_schedule(self, title: str, subject_codes):
        schedule = Schedule.objects.create(
            user=self.faculty,
            title=title,
            upload_type='faculty',
            is_active=True,
        )
        for idx, code in enumerate(subject_codes):
            Course.objects.create(
                user=self.faculty,
                schedule=schedule,
                subject_code=code,
                subject_name=f'Subject {code}',
                start_time='08:00AM',
                end_time='09:00AM',
                day='M' if idx % 2 == 0 else 'T',
                location='LR1',
            )
        return schedule

    def test_delete_faculty_schedule_reconciles_enrollment_and_class_code(self):
        schedule = self._create_faculty_schedule('Faculty A', ['CS301'])

        enrollment = ClassEnrollment.objects.create(
            faculty=self.faculty,
            student=self.student,
            subject_code='CS301',
            enrollment_type='code',
            status='active',
        )
        class_code = ClassCode.objects.create(
            faculty=self.faculty,
            subject_code='CS301',
            code=ClassCode.generate_code(),
            is_active=True,
        )

        response = self.client.delete(f'/api/schedules/{schedule.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        enrollment.refresh_from_db()
        class_code.refresh_from_db()

        self.assertEqual(enrollment.status, 'removed')
        self.assertFalse(class_code.is_active)

        notif = Notification.objects.filter(
            user=self.student,
            data__type='enrollment_removed',
        ).first()
        self.assertIsNotNone(notif)
        self.assertIn('CS301', notif.message)

    def test_delete_schedule_keeps_enrollment_if_subject_still_taught_elsewhere(self):
        removable_schedule = self._create_faculty_schedule('Faculty A', ['CS302'])
        self._create_faculty_schedule('Faculty B', ['CS302'])

        enrollment = ClassEnrollment.objects.create(
            faculty=self.faculty,
            student=self.student,
            subject_code='CS302',
            enrollment_type='auto',
            status='active',
        )
        class_code = ClassCode.objects.create(
            faculty=self.faculty,
            subject_code='CS302',
            code=ClassCode.generate_code(),
            is_active=True,
        )

        response = self.client.delete(f'/api/schedules/{removable_schedule.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        enrollment.refresh_from_db()
        class_code.refresh_from_db()

        self.assertEqual(enrollment.status, 'active')
        self.assertTrue(class_code.is_active)
        self.assertFalse(
            Notification.objects.filter(
                user=self.student,
                data__type='enrollment_removed',
            ).exists()
        )

    def test_update_faculty_schedule_remove_subject_reconciles(self):
        schedule = self._create_faculty_schedule('Faculty A', ['CS303', 'CS304'])

        enrollment_removed = ClassEnrollment.objects.create(
            faculty=self.faculty,
            student=self.student,
            subject_code='CS303',
            enrollment_type='auto',
            status='active',
        )
        enrollment_kept = ClassEnrollment.objects.create(
            faculty=self.faculty,
            student=self.student,
            subject_code='CS304',
            enrollment_type='auto',
            status='active',
        )

        response = self.client.patch(
            f'/api/schedules/{schedule.id}/',
            {
                'courses': [
                    {
                        'subject_code': 'CS304',
                        'subject_name': 'Subject CS304',
                        'start_time': '10:00AM',
                        'end_time': '11:00AM',
                        'day': 'W',
                        'location': 'LR2',
                    }
                ]
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        enrollment_removed.refresh_from_db()
        enrollment_kept.refresh_from_db()

        self.assertEqual(enrollment_removed.status, 'removed')
        self.assertEqual(enrollment_kept.status, 'active')

        self.assertTrue(
            Notification.objects.filter(
                user=self.student,
                data__type='enrollment_removed',
            ).exists()
        )
