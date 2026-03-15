"""
Tests for account deletion unlink behavior.

Ensures deleting an account revokes linked parent-child access and leaves
counterparty accounts intact.
"""

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from api.models import User, ParentChildLink, Notification


class AccountDeletionUnlinkTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_student_account_deletion_unlinks_parent_and_notifies_parent(self):
        student = User.objects.create_user(
            email='student_delete@test.com',
            password='testpass123',
            first_name='Student',
            last_name='Delete',
            user_type='student',
            student_number='2026-50001',
        )
        parent = User.objects.create_user(
            email='parent_keep@test.com',
            password='testpass123',
            first_name='Parent',
            last_name='Keep',
            user_type='parent',
        )

        ParentChildLink.objects.create(parent=parent, child=student, status='active')

        self.client.force_authenticate(user=student)
        response = self.client.post(
            '/api/auth/delete-account/',
            {
                'password': 'testpass123',
                'confirmation': 'DELETE',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(User.objects.filter(id=student.id).exists())
        self.assertTrue(User.objects.filter(id=parent.id).exists())
        self.assertFalse(ParentChildLink.objects.filter(parent=parent).exists())

        self.assertTrue(
            Notification.objects.filter(
                user=parent,
                data__type='child_account_deleted',
            ).exists()
        )

    def test_parent_account_deletion_unlinks_children_and_notifies_children(self):
        parent = User.objects.create_user(
            email='parent_delete@test.com',
            password='testpass123',
            first_name='Parent',
            last_name='Delete',
            user_type='parent',
        )
        child = User.objects.create_user(
            email='child_keep@test.com',
            password='testpass123',
            first_name='Child',
            last_name='Keep',
            user_type='student',
            student_number='2026-50002',
        )

        ParentChildLink.objects.create(parent=parent, child=child, status='active')

        self.client.force_authenticate(user=parent)
        response = self.client.post(
            '/api/auth/delete-account/',
            {
                'password': 'testpass123',
                'confirmation': 'DELETE',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(User.objects.filter(id=parent.id).exists())
        self.assertTrue(User.objects.filter(id=child.id).exists())
        self.assertFalse(ParentChildLink.objects.filter(child=child).exists())

        self.assertTrue(
            Notification.objects.filter(
                user=child,
                data__type='parent_account_deleted',
            ).exists()
        )
