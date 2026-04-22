"""
Unit tests for the Faculty Remark feature.
Tests models, serializers, views (access control, validation, pagination),
and the notification helper.

Run with: python manage.py test api.tests.test_remarks
"""

from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from unittest.mock import patch

from api.models import (
    FacultyRemark,
    ClassEnrollment,
    ParentChildLink,
    Notification,
    Schedule,
    Course,
)
from api.views.remark_views import MAX_REMARK_LENGTH

User = get_user_model()


# ============================================
# Helper mixin
# ============================================

class RemarkTestMixin:
    """Shared setup for remark tests."""

    def _create_users(self):
        self.faculty = User.objects.create_user(
            email='faculty@test.com', password='testpass123',
            first_name='Dr.', last_name='Smith', user_type='faculty', is_verified=True,
        )
        self.student = User.objects.create_user(
            email='student@test.com', password='testpass123',
            first_name='John', last_name='Doe', user_type='student',
        )
        self.parent = User.objects.create_user(
            email='parent@test.com', password='testpass123',
            first_name='Jane', last_name='Doe', user_type='parent',
        )
        self.other_faculty = User.objects.create_user(
            email='other_faculty@test.com', password='testpass123',
            first_name='Prof.', last_name='Jones', user_type='faculty', is_verified=True,
        )

    def _create_enrollment(self, faculty=None, student=None, subject='CS101'):
        return ClassEnrollment.objects.create(
            faculty=faculty or self.faculty,
            student=student or self.student,
            subject_code=subject,
            enrollment_type='code',
            status='active',
        )

    def _create_faculty_schedule(self, faculty=None, subject='CS101'):
        """Create a faculty-type Schedule + Course so the schedule validation passes."""
        fac = faculty or self.faculty
        schedule = Schedule.objects.create(
            user=fac,
            title='Faculty Schedule',
            upload_type='faculty',
            is_active=True,
        )
        Course.objects.create(
            user=fac,
            schedule=schedule,
            subject_code=subject,
            start_time='07:00AM',
            end_time='09:00AM',
            day='M',
        )
        return schedule

    def _create_parent_link(self, parent=None, child=None):
        return ParentChildLink.objects.create(
            parent=parent or self.parent,
            child=child or self.student,
            status='active',
        )


# ============================================
# Model tests
# ============================================

class FacultyRemarkModelTests(RemarkTestMixin, TestCase):

    def setUp(self):
        self._create_users()

    def test_create_remark(self):
        remark = FacultyRemark.objects.create(
            faculty=self.faculty, student=self.student,
            subject_code='CS101', text='Good work!',
        )
        self.assertEqual(remark.faculty, self.faculty)
        self.assertEqual(remark.student, self.student)
        self.assertIn('CS101', str(remark))

    def test_ordering_newest_first(self):
        r1 = FacultyRemark.objects.create(
            faculty=self.faculty, student=self.student,
            subject_code='CS101', text='First',
        )
        r2 = FacultyRemark.objects.create(
            faculty=self.faculty, student=self.student,
            subject_code='CS101', text='Second',
        )
        qs = list(FacultyRemark.objects.all())
        self.assertEqual(qs[0].id, r2.id)

    def test_cascade_delete_faculty(self):
        FacultyRemark.objects.create(
            faculty=self.faculty, student=self.student,
            subject_code='CS101', text='test',
        )
        self.faculty.delete()
        self.assertEqual(FacultyRemark.objects.count(), 0)

    def test_cascade_delete_student(self):
        FacultyRemark.objects.create(
            faculty=self.faculty, student=self.student,
            subject_code='CS101', text='test',
        )
        self.student.delete()
        self.assertEqual(FacultyRemark.objects.count(), 0)


# ============================================
# Faculty endpoints
# ============================================

class FacultyRemarkCreateTests(RemarkTestMixin, TestCase):

    def setUp(self):
        self._create_users()
        self._create_enrollment()
        self._create_faculty_schedule()
        self.client = APIClient()
        self.client.force_authenticate(user=self.faculty)

    @patch('api.views.remark_views.notify_remark')
    def test_create_remark_success(self, mock_notify):
        res = self.client.post('/api/faculty/remarks/', {
            'student_id': self.student.id,
            'subject_code': 'CS101',
            'text': 'Excellent participation',
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(FacultyRemark.objects.count(), 1)
        mock_notify.assert_called_once()
        data = res.json()
        self.assertEqual(data['faculty_name'], 'Dr. Smith')
        self.assertEqual(data['student_name'], 'John Doe')

    def test_create_remark_missing_fields(self):
        res = self.client.post('/api/faculty/remarks/', {'text': 'hello'})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_remark_empty_text(self):
        res = self.client.post('/api/faculty/remarks/', {
            'student_id': self.student.id,
            'subject_code': 'CS101',
            'text': '   ',
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_remark_text_too_long(self):
        res = self.client.post('/api/faculty/remarks/', {
            'student_id': self.student.id,
            'subject_code': 'CS101',
            'text': 'x' * (MAX_REMARK_LENGTH + 1),
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('characters', res.json()['error'])

    def test_create_remark_invalid_student_id(self):
        res = self.client.post('/api/faculty/remarks/', {
            'student_id': 'abc',
            'subject_code': 'CS101',
            'text': 'test',
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('integer', res.json()['error'])

    def test_create_remark_not_enrolled(self):
        other = User.objects.create_user(
            email='other@test.com', password='pass123',
            first_name='X', last_name='Y', user_type='student',
        )
        res = self.client.post('/api/faculty/remarks/', {
            'student_id': other.id,
            'subject_code': 'CS101',
            'text': 'test',
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('not enrolled', res.json()['error'])

    def test_student_cannot_create_remark(self):
        self.client.force_authenticate(user=self.student)
        res = self.client.post('/api/faculty/remarks/', {
            'student_id': self.student.id,
            'subject_code': 'CS101',
            'text': 'test',
        })
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_remark_no_faculty_schedule(self):
        """Faculty without a faculty-type schedule for the subject should be rejected."""
        # other_faculty has no Schedule/Course for CS101
        self._create_enrollment(faculty=self.other_faculty)
        self.client.force_authenticate(user=self.other_faculty)
        res = self.client.post('/api/faculty/remarks/', {
            'student_id': self.student.id,
            'subject_code': 'CS101',
            'text': 'Should fail',
        })
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('subjects you teach', res.json()['error'])


class FacultyRemarkListTests(RemarkTestMixin, TestCase):

    def setUp(self):
        self._create_users()
        self._create_enrollment()
        self.client = APIClient()
        self.client.force_authenticate(user=self.faculty)
        self.r1 = FacultyRemark.objects.create(
            faculty=self.faculty, student=self.student,
            subject_code='CS101', text='Remark 1',
        )
        self.r2 = FacultyRemark.objects.create(
            faculty=self.faculty, student=self.student,
            subject_code='CS202', text='Remark 2',
        )

    def test_list_all(self):
        res = self.client.get('/api/faculty/remarks/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()), 2)

    def test_filter_by_subject_code(self):
        res = self.client.get('/api/faculty/remarks/', {'subject_code': 'CS101'})
        self.assertEqual(len(res.json()), 1)

    def test_filter_by_student_id(self):
        res = self.client.get('/api/faculty/remarks/', {'student_id': self.student.id})
        self.assertEqual(len(res.json()), 2)

    def test_other_faculty_cannot_see(self):
        self.client.force_authenticate(user=self.other_faculty)
        res = self.client.get('/api/faculty/remarks/')
        self.assertEqual(len(res.json()), 0)

    def test_student_forbidden(self):
        self.client.force_authenticate(user=self.student)
        res = self.client.get('/api/faculty/remarks/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class FacultyRemarkDetailTests(RemarkTestMixin, TestCase):

    def setUp(self):
        self._create_users()
        self._create_enrollment()
        self.client = APIClient()
        self.client.force_authenticate(user=self.faculty)
        self.remark = FacultyRemark.objects.create(
            faculty=self.faculty, student=self.student,
            subject_code='CS101', text='Original text',
        )

    def test_patch_success(self):
        res = self.client.patch(f'/api/faculty/remarks/{self.remark.id}/', {'text': 'Updated'})
        self.assertEqual(res.status_code, 200)
        self.remark.refresh_from_db()
        self.assertEqual(self.remark.text, 'Updated')

    def test_patch_empty_text(self):
        res = self.client.patch(f'/api/faculty/remarks/{self.remark.id}/', {'text': ''})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_patch_too_long(self):
        res = self.client.patch(f'/api/faculty/remarks/{self.remark.id}/', {'text': 'y' * (MAX_REMARK_LENGTH + 1)})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_patch_other_faculty_404(self):
        self.client.force_authenticate(user=self.other_faculty)
        res = self.client.patch(f'/api/faculty/remarks/{self.remark.id}/', {'text': 'Hacked'})
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_delete_success(self):
        res = self.client.delete(f'/api/faculty/remarks/{self.remark.id}/')
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(FacultyRemark.objects.count(), 0)

    def test_delete_other_faculty_404(self):
        self.client.force_authenticate(user=self.other_faculty)
        res = self.client.delete(f'/api/faculty/remarks/{self.remark.id}/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(FacultyRemark.objects.count(), 1)

    def test_student_cannot_edit(self):
        self.client.force_authenticate(user=self.student)
        res = self.client.patch(f'/api/faculty/remarks/{self.remark.id}/', {'text': 'sneaky'})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_cannot_delete(self):
        self.client.force_authenticate(user=self.student)
        res = self.client.delete(f'/api/faculty/remarks/{self.remark.id}/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


# ============================================
# Student endpoint
# ============================================

class StudentRemarkListTests(RemarkTestMixin, TestCase):

    def setUp(self):
        self._create_users()
        self.client = APIClient()
        self.client.force_authenticate(user=self.student)
        FacultyRemark.objects.create(
            faculty=self.faculty, student=self.student,
            subject_code='CS101', text='Great job',
        )

    def test_student_sees_own_remarks(self):
        res = self.client.get('/api/student/remarks/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()), 1)

    def test_student_filter_by_subject(self):
        res = self.client.get('/api/student/remarks/', {'subject_code': 'WRONG'})
        self.assertEqual(len(res.json()), 0)

    def test_faculty_cannot_access_student_endpoint(self):
        """Security: faculty should NOT be able to call the student remarks endpoint."""
        self.client.force_authenticate(user=self.faculty)
        res = self.client.get('/api/student/remarks/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_parent_cannot_access_student_endpoint(self):
        self.client.force_authenticate(user=self.parent)
        res = self.client.get('/api/student/remarks/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


# ============================================
# Parent endpoint
# ============================================

class ParentRemarkListTests(RemarkTestMixin, TestCase):

    def setUp(self):
        self._create_users()
        self._create_parent_link()
        self.client = APIClient()
        self.client.force_authenticate(user=self.parent)
        FacultyRemark.objects.create(
            faculty=self.faculty, student=self.student,
            subject_code='CS101', text='Good effort',
        )

    def test_parent_sees_child_remarks(self):
        res = self.client.get('/api/parent/child/remarks/', {'child_id': self.student.id})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()), 1)

    def test_parent_default_child(self):
        """When child_id omitted, should default to first linked child."""
        res = self.client.get('/api/parent/child/remarks/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()), 1)

    def test_parent_no_link_forbidden(self):
        other_student = User.objects.create_user(
            email='other_student@test.com', password='pass123',
            first_name='X', last_name='Y', user_type='student',
        )
        res = self.client.get('/api/parent/child/remarks/', {'child_id': other_student.id})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_cannot_access_parent_endpoint(self):
        self.client.force_authenticate(user=self.student)
        res = self.client.get('/api/parent/child/remarks/', {'child_id': self.student.id})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_faculty_cannot_access_parent_endpoint(self):
        self.client.force_authenticate(user=self.faculty)
        res = self.client.get('/api/parent/child/remarks/', {'child_id': self.student.id})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


# ============================================
# Notification tests
# ============================================

class RemarkNotificationTests(RemarkTestMixin, TestCase):

    def setUp(self):
        self._create_users()
        self._create_parent_link()

    @patch('api.utils.notification_service.NotificationService.send_batch_notifications')
    def test_notify_remark_creates_notifications(self, mock_send):
        from api.utils.notification_service import notify_remark
        stats = notify_remark(
            faculty_user=self.faculty,
            student_id=self.student.id,
            subject_code='CS101',
            remark_text='Keep it up!',
            remark_id=999,
        )
        # Should store one for student + one for parent
        self.assertEqual(stats['notifications_stored'], 2)
        self.assertEqual(Notification.objects.filter(notification_type='faculty_remark').count(), 2)

    @patch('api.utils.notification_service.NotificationService.send_batch_notifications')
    def test_notify_remark_truncates_long_text(self, mock_send):
        from api.utils.notification_service import notify_remark
        long_text = 'A' * 500
        notify_remark(
            faculty_user=self.faculty,
            student_id=self.student.id,
            subject_code='CS101',
            remark_text=long_text,
            remark_id=999,
        )
        notif = Notification.objects.first()
        # Notification body should be truncated with ellipsis
        self.assertIn('...', notif.message)
        self.assertTrue(len(notif.message) < len(long_text))

    @patch('api.utils.notification_service.NotificationService.send_batch_notifications')
    def test_notify_remark_nonexistent_student(self, mock_send):
        from api.utils.notification_service import notify_remark
        stats = notify_remark(
            faculty_user=self.faculty,
            student_id=99999,
            subject_code='CS101',
            remark_text='test',
            remark_id=999,
        )
        self.assertEqual(stats['notifications_stored'], 0)
        mock_send.assert_not_called()
