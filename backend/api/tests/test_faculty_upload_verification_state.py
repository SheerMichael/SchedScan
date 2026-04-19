from types import SimpleNamespace
from unittest.mock import patch

from django.test import TestCase

from api.models import User
from api.utils.extraction_manager import _handle_faculty_upload_verification


class FacultyUploadVerificationStateTests(TestCase):
    @patch('api.utils.extraction_manager._notify_admins_of_faculty_upload')
    def test_none_status_transitions_to_pending_and_notifies(self, mock_notify):
        user = User.objects.create_user(
            email='state_none@test.com',
            password='testpass123',
            first_name='State',
            last_name='None',
            user_type='student',
            faculty_verification_status='none',
            is_verified=False,
        )
        job = SimpleNamespace(user=user, job_id='job-none')

        _handle_faculty_upload_verification(job)

        user.refresh_from_db()
        self.assertEqual(user.user_type, 'faculty')
        self.assertEqual(user.faculty_verification_status, 'pending')
        mock_notify.assert_called_once_with(job)

    @patch('api.utils.extraction_manager._notify_admins_of_faculty_upload')
    def test_rejected_status_transitions_back_to_pending_and_notifies(self, mock_notify):
        user = User.objects.create_user(
            email='state_rejected@test.com',
            password='testpass123',
            first_name='State',
            last_name='Rejected',
            user_type='faculty',
            faculty_verification_status='rejected',
            is_verified=False,
        )
        job = SimpleNamespace(user=user, job_id='job-rejected')

        _handle_faculty_upload_verification(job)

        user.refresh_from_db()
        self.assertEqual(user.faculty_verification_status, 'pending')
        mock_notify.assert_called_once_with(job)

    @patch('api.utils.extraction_manager._notify_admins_of_faculty_upload')
    def test_approved_status_does_not_requeue_or_notify(self, mock_notify):
        user = User.objects.create_user(
            email='state_approved@test.com',
            password='testpass123',
            first_name='State',
            last_name='Approved',
            user_type='faculty',
            faculty_verification_status='approved',
            is_verified=True,
        )
        job = SimpleNamespace(user=user, job_id='job-approved')

        _handle_faculty_upload_verification(job)

        user.refresh_from_db()
        self.assertEqual(user.faculty_verification_status, 'approved')
        mock_notify.assert_not_called()
