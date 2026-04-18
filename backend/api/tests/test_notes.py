"""Unit tests for quick note APIs."""

from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from api.models import Note, User


class NoteApiTests(TestCase):
    """Validate note CRUD behavior, access control, and ordering rules."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email='notes.owner@test.com',
            password='testpass123',
            first_name='Note',
            last_name='Owner',
            user_type='student',
            student_number='2026-70001',
        )
        self.other_user = User.objects.create_user(
            email='notes.other@test.com',
            password='testpass123',
            first_name='Other',
            last_name='User',
            user_type='student',
            student_number='2026-70002',
        )
        self.client.force_authenticate(user=self.user)

    def test_create_note_success(self):
        response = self.client.post(
            '/api/notes/',
            {
                'subject_code': 'CS101',
                'text': 'Review chapter 5 examples',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['subject_code'], 'CS101')
        self.assertEqual(response.data['text'], 'Review chapter 5 examples')
        self.assertFalse(response.data['is_pinned'])
        self.assertEqual(Note.objects.filter(user=self.user).count(), 1)

    def test_list_filters_subject_and_orders_pinned_first(self):
        now = timezone.now()

        pinned_old = Note.objects.create(
            user=self.user,
            subject_code='CS101',
            text='Pinned but older',
            is_pinned=True,
        )
        unpinned_new = Note.objects.create(
            user=self.user,
            subject_code='CS101',
            text='Unpinned and newest',
            is_pinned=False,
        )
        unpinned_old = Note.objects.create(
            user=self.user,
            subject_code='CS101',
            text='Unpinned and older',
            is_pinned=False,
        )
        Note.objects.create(
            user=self.user,
            subject_code='MATH201',
            text='Different subject note',
            is_pinned=True,
        )

        Note.objects.filter(pk=pinned_old.id).update(updated_at=now - timedelta(hours=4))
        Note.objects.filter(pk=unpinned_new.id).update(updated_at=now - timedelta(hours=1))
        Note.objects.filter(pk=unpinned_old.id).update(updated_at=now - timedelta(hours=2))

        response = self.client.get('/api/notes/', {'subject_code': ' CS101 '})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        note_ids = [item['id'] for item in response.data]
        self.assertEqual(note_ids, [pinned_old.id, unpinned_new.id, unpinned_old.id])

    def test_patch_note_updates_text_and_pin(self):
        note = Note.objects.create(
            user=self.user,
            subject_code='CS102',
            text='Initial note',
            is_pinned=False,
        )

        response = self.client.patch(
            f'/api/notes/{note.id}/',
            {
                'text': 'Updated note content',
                'is_pinned': True,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        note.refresh_from_db()
        self.assertEqual(note.text, 'Updated note content')
        self.assertTrue(note.is_pinned)

    def test_user_cannot_access_other_users_note(self):
        other_note = Note.objects.create(
            user=self.other_user,
            subject_code='CS301',
            text='Private note',
            is_pinned=False,
        )

        get_response = self.client.get(f'/api/notes/{other_note.id}/')
        patch_response = self.client.patch(
            f'/api/notes/{other_note.id}/',
            {'text': 'Attempted overwrite'},
            format='json',
        )
        delete_response = self.client.delete(f'/api/notes/{other_note.id}/')

        self.assertEqual(get_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(patch_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(delete_response.status_code, status.HTTP_404_NOT_FOUND)

    def test_rejects_oversized_note_text(self):
        response = self.client.post(
            '/api/notes/',
            {
                'subject_code': 'CS103',
                'text': 'x' * 2001,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('text', response.data)
