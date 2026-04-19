from unittest.mock import patch

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from api.models import Notification, ParentChildLink, ParentLinkRequest, User


class ParentRegistrationAndLinkRequestTests(TestCase):
    def setUp(self):
        self.parent_client = APIClient()
        self.student_client = APIClient()

        self.student = User.objects.create_user(
            email='student_request@test.com',
            password='testpass123',
            first_name='Test',
            last_name='Student',
            user_type='student',
            student_number='2026-81001',
        )

    def test_parent_registration_does_not_require_invite_code(self):
        response = self.parent_client.post(
            '/api/auth/register/',
            {
                'email': 'parent_no_invite@test.com',
                'password': 'strongpass123',
                'password2': 'strongpass123',
                'first_name': 'Parent',
                'last_name': 'NoInvite',
                'user_type': 'parent',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(email='parent_no_invite@test.com').exists())

    def test_parent_can_request_and_student_can_approve(self):
        parent = User.objects.create_user(
            email='parent_approve@test.com',
            password='testpass123',
            first_name='Parent',
            last_name='Approve',
            user_type='parent',
        )

        self.parent_client.force_authenticate(user=parent)
        self.student_client.force_authenticate(user=self.student)

        search_response = self.parent_client.get('/api/parent/children/search/', {'q': 'Test'})
        self.assertEqual(search_response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(search_response.data['count'], 1)

        request_response = self.parent_client.post(
            '/api/parent/link-requests/',
            {'child_id': self.student.id},
            format='json',
        )
        self.assertEqual(request_response.status_code, status.HTTP_201_CREATED)
        request_id = request_response.data['request']['id']

        approve_response = self.student_client.post(
            f'/api/student/parent-link-requests/{request_id}/approve/',
            {},
            format='json',
        )
        self.assertEqual(approve_response.status_code, status.HTTP_200_OK)

        self.assertTrue(
            ParentChildLink.objects.filter(parent=parent, child=self.student, status='active').exists()
        )

        pending_exists = ParentLinkRequest.objects.filter(id=request_id, status='pending').exists()
        self.assertFalse(pending_exists)

    def test_student_can_reject_parent_request(self):
        parent = User.objects.create_user(
            email='parent_reject@test.com',
            password='testpass123',
            first_name='Parent',
            last_name='Reject',
            user_type='parent',
        )

        self.parent_client.force_authenticate(user=parent)
        self.student_client.force_authenticate(user=self.student)

        request_response = self.parent_client.post(
            '/api/parent/link-requests/',
            {'child_id': self.student.id},
            format='json',
        )
        self.assertEqual(request_response.status_code, status.HTTP_201_CREATED)
        request_id = request_response.data['request']['id']

        reject_response = self.student_client.post(
            f'/api/student/parent-link-requests/{request_id}/reject/',
            {},
            format='json',
        )
        self.assertEqual(reject_response.status_code, status.HTTP_200_OK)

        self.assertFalse(
            ParentChildLink.objects.filter(parent=parent, child=self.student, status='active').exists()
        )
        self.assertTrue(
            ParentLinkRequest.objects.filter(id=request_id, status='rejected').exists()
        )

    def test_parent_search_supports_normalized_number_and_status_flags(self):
        parent = User.objects.create_user(
            email='parent_search@test.com',
            password='testpass123',
            first_name='Parent',
            last_name='Search',
            user_type='parent',
        )
        another_student = User.objects.create_user(
            email='second_student@test.com',
            password='testpass123',
            first_name='Jane',
            last_name='Learner',
            user_type='student',
            student_number='2026-81002',
        )

        ParentChildLink.objects.create(parent=parent, child=self.student, status='active')
        ParentLinkRequest.objects.create(parent=parent, child=another_student, status='pending')

        self.parent_client.force_authenticate(user=parent)

        normalized_response = self.parent_client.get('/api/parent/children/search/', {'q': '202681001'})
        self.assertEqual(normalized_response.status_code, status.HTTP_200_OK)
        self.assertEqual(normalized_response.data['count'], 1)
        self.assertEqual(normalized_response.data['results'][0]['id'], self.student.id)

        status_response = self.parent_client.get('/api/parent/children/search/', {'q': '2026'})
        self.assertEqual(status_response.status_code, status.HTTP_200_OK)
        by_id = {item['id']: item for item in status_response.data['results']}

        self.assertTrue(by_id[self.student.id]['is_already_linked'])
        self.assertFalse(by_id[self.student.id]['has_pending_request'])
        self.assertFalse(by_id[another_student.id]['is_already_linked'])
        self.assertTrue(by_id[another_student.id]['has_pending_request'])

    @patch('api.views.parent_views.NotificationService.send_push_notification')
    def test_parent_request_notifies_student_and_sends_push(self, mock_send_push):
        parent = User.objects.create_user(
            email='parent_notify@test.com',
            password='testpass123',
            first_name='Penny',
            last_name='Parent',
            user_type='parent',
        )
        self.student.expo_push_token = 'ExponentPushToken[test123]'
        self.student.save(update_fields=['expo_push_token'])

        self.parent_client.force_authenticate(user=parent)

        response = self.parent_client.post(
            '/api/parent/link-requests/',
            {'child_id': self.student.id},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        notification = Notification.objects.filter(user=self.student).latest('created_at')
        self.assertEqual(notification.notification_type, 'general')
        self.assertEqual(notification.title, 'New parent connection request')
        self.assertEqual(notification.data.get('type'), 'parent_link_request')

        mock_send_push.assert_called_once()
        self.assertEqual(mock_send_push.call_args.kwargs['token'], self.student.expo_push_token)

    @patch('api.views.parent_views.NotificationService.send_push_notification')
    def test_student_approval_notifies_parent_and_sends_push(self, mock_send_push):
        parent = User.objects.create_user(
            email='parent_approved_push@test.com',
            password='testpass123',
            first_name='Pat',
            last_name='Parent',
            user_type='parent',
            expo_push_token='ExponentPushToken[parentApprove123]',
        )

        self.parent_client.force_authenticate(user=parent)
        self.student_client.force_authenticate(user=self.student)

        request_response = self.parent_client.post(
            '/api/parent/link-requests/',
            {'child_id': self.student.id},
            format='json',
        )
        self.assertEqual(request_response.status_code, status.HTTP_201_CREATED)
        request_id = request_response.data['request']['id']

        approve_response = self.student_client.post(
            f'/api/student/parent-link-requests/{request_id}/approve/',
            {},
            format='json',
        )
        self.assertEqual(approve_response.status_code, status.HTTP_200_OK)

        notification = Notification.objects.filter(user=parent).latest('created_at')
        self.assertEqual(notification.notification_type, 'general')
        self.assertEqual(notification.title, 'Parent request approved')
        self.assertEqual(notification.data.get('type'), 'parent_link_approved')

        self.assertEqual(mock_send_push.call_count, 1)
        self.assertEqual(mock_send_push.call_args.kwargs['token'], parent.expo_push_token)

    @patch('api.views.parent_views.NotificationService.send_push_notification')
    def test_student_rejection_notifies_parent_and_sends_push(self, mock_send_push):
        parent = User.objects.create_user(
            email='parent_rejected_push@test.com',
            password='testpass123',
            first_name='Rhea',
            last_name='Parent',
            user_type='parent',
            expo_push_token='ExponentPushToken[parentReject123]',
        )

        self.parent_client.force_authenticate(user=parent)
        self.student_client.force_authenticate(user=self.student)

        request_response = self.parent_client.post(
            '/api/parent/link-requests/',
            {'child_id': self.student.id},
            format='json',
        )
        self.assertEqual(request_response.status_code, status.HTTP_201_CREATED)
        request_id = request_response.data['request']['id']

        reject_response = self.student_client.post(
            f'/api/student/parent-link-requests/{request_id}/reject/',
            {},
            format='json',
        )
        self.assertEqual(reject_response.status_code, status.HTTP_200_OK)

        notification = Notification.objects.filter(user=parent).latest('created_at')
        self.assertEqual(notification.notification_type, 'general')
        self.assertEqual(notification.title, 'Parent request rejected')
        self.assertEqual(notification.data.get('type'), 'parent_link_rejected')

        self.assertEqual(mock_send_push.call_count, 1)
        self.assertEqual(mock_send_push.call_args.kwargs['token'], parent.expo_push_token)

    @patch('api.views.parent_views.NotificationService.send_push_notification')
    def test_parent_can_cancel_pending_request_and_student_is_notified(self, mock_send_push):
        parent = User.objects.create_user(
            email='parent_cancel@test.com',
            password='testpass123',
            first_name='Casey',
            last_name='Parent',
            user_type='parent',
        )
        self.student.expo_push_token = 'ExponentPushToken[studentCancel123]'
        self.student.save(update_fields=['expo_push_token'])

        self.parent_client.force_authenticate(user=parent)

        request_response = self.parent_client.post(
            '/api/parent/link-requests/',
            {'child_id': self.student.id},
            format='json',
        )
        self.assertEqual(request_response.status_code, status.HTTP_201_CREATED)
        request_id = request_response.data['request']['id']

        cancel_response = self.parent_client.post(
            f'/api/parent/link-requests/{request_id}/cancel/',
            {},
            format='json',
        )
        self.assertEqual(cancel_response.status_code, status.HTTP_200_OK)

        cancelled = ParentLinkRequest.objects.get(id=request_id)
        self.assertEqual(cancelled.status, 'cancelled')
        self.assertIsNotNone(cancelled.resolved_at)

        notification = Notification.objects.filter(user=self.student).latest('created_at')
        self.assertEqual(notification.title, 'Parent request cancelled')
        self.assertEqual(notification.data.get('type'), 'parent_link_cancelled')

        # One push for initial request + one push for cancellation.
        self.assertEqual(mock_send_push.call_count, 2)
        self.assertEqual(mock_send_push.call_args.kwargs['token'], self.student.expo_push_token)

    def test_parent_cannot_cancel_non_pending_request(self):
        parent = User.objects.create_user(
            email='parent_cancel_blocked@test.com',
            password='testpass123',
            first_name='Blocked',
            last_name='Parent',
            user_type='parent',
        )
        request = ParentLinkRequest.objects.create(
            parent=parent,
            child=self.student,
            status='rejected',
        )

        self.parent_client.force_authenticate(user=parent)
        response = self.parent_client.post(
            f'/api/parent/link-requests/{request.id}/cancel/',
            {},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['error'], 'Only pending requests can be cancelled')

    def test_parent_can_delete_single_non_pending_request_from_history(self):
        parent = User.objects.create_user(
            email='parent_delete_history@test.com',
            password='testpass123',
            first_name='History',
            last_name='Delete',
            user_type='parent',
        )
        request = ParentLinkRequest.objects.create(
            parent=parent,
            child=self.student,
            status='rejected',
        )

        self.parent_client.force_authenticate(user=parent)
        response = self.parent_client.delete(f'/api/parent/link-requests/{request.id}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        request.refresh_from_db()
        self.assertIsNotNone(request.parent_hidden_at)

        list_response = self.parent_client.get('/api/parent/link-requests/')
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(list_response.data['requests'], [])

    def test_parent_cannot_delete_pending_request_from_history(self):
        parent = User.objects.create_user(
            email='parent_pending_history@test.com',
            password='testpass123',
            first_name='Pending',
            last_name='Delete',
            user_type='parent',
        )
        request = ParentLinkRequest.objects.create(
            parent=parent,
            child=self.student,
            status='pending',
        )

        self.parent_client.force_authenticate(user=parent)
        response = self.parent_client.delete(f'/api/parent/link-requests/{request.id}/')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        request.refresh_from_db()
        self.assertIsNone(request.parent_hidden_at)

    def test_parent_can_clear_non_pending_request_history(self):
        parent = User.objects.create_user(
            email='parent_clear_history@test.com',
            password='testpass123',
            first_name='History',
            last_name='Clear',
            user_type='parent',
        )
        pending_request = ParentLinkRequest.objects.create(
            parent=parent,
            child=self.student,
            status='pending',
        )
        rejected_request = ParentLinkRequest.objects.create(
            parent=parent,
            child=self.student,
            status='rejected',
        )
        cancelled_request = ParentLinkRequest.objects.create(
            parent=parent,
            child=self.student,
            status='cancelled',
        )

        self.parent_client.force_authenticate(user=parent)
        response = self.parent_client.delete('/api/parent/link-requests/clear-history/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['deleted_count'], 2)
        self.assertEqual(response.data['remaining_pending'], 1)

        pending_request.refresh_from_db()
        rejected_request.refresh_from_db()
        cancelled_request.refresh_from_db()

        self.assertIsNone(pending_request.parent_hidden_at)
        self.assertIsNotNone(rejected_request.parent_hidden_at)
        self.assertIsNotNone(cancelled_request.parent_hidden_at)

        list_response = self.parent_client.get('/api/parent/link-requests/')
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_response.data['requests']), 1)
        self.assertEqual(list_response.data['requests'][0]['id'], pending_request.id)
