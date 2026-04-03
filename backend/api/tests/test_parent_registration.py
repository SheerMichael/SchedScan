from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from api.models import ParentChildLink, ParentLinkRequest, User


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
