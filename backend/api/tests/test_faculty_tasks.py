"""
Unit tests for the Faculty-Student Connection feature.
Tests models, serializers, and views for class codes, enrollments,
faculty tasks, and completion tracking.

Run with: python manage.py test api.tests.test_faculty_tasks
"""

from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from unittest.mock import patch

from api.models import (
    ClassCode, ClassEnrollment, FacultyTask, FacultyTaskCompletion,
    Course, Schedule,
)

User = get_user_model()


class FacultyTaskModelTests(TestCase):
    """Tests for the new faculty-student models."""

    def setUp(self):
        self.faculty = User.objects.create_user(
            email='faculty@test.com', password='testpass123',
            first_name='Dr.', last_name='Smith', user_type='faculty'
        )
        self.student = User.objects.create_user(
            email='student@test.com', password='testpass123',
            first_name='John', last_name='Doe', user_type='student'
        )

    def test_class_code_creation(self):
        code = ClassCode.objects.create(
            faculty=self.faculty, subject_code='CS101',
            code=ClassCode.generate_code()
        )
        self.assertEqual(len(code.code), 8)
        self.assertTrue(code.is_active)
        self.assertEqual(code.faculty, self.faculty)

    def test_class_code_unique(self):
        c1 = ClassCode.objects.create(
            faculty=self.faculty, subject_code='CS101',
            code=ClassCode.generate_code()
        )
        c2 = ClassCode.objects.create(
            faculty=self.faculty, subject_code='CS102',
            code=ClassCode.generate_code()
        )
        self.assertNotEqual(c1.code, c2.code)

    def test_class_enrollment_creation(self):
        enrollment = ClassEnrollment.objects.create(
            student=self.student, faculty=self.faculty,
            subject_code='CS101', enrollment_type='code'
        )
        self.assertEqual(enrollment.status, 'active')
        self.assertEqual(enrollment.enrollment_type, 'code')

    def test_class_enrollment_unique(self):
        ClassEnrollment.objects.create(
            student=self.student, faculty=self.faculty,
            subject_code='CS101', enrollment_type='code'
        )
        # Should not create a duplicate
        with self.assertRaises(Exception):
            ClassEnrollment.objects.create(
                student=self.student, faculty=self.faculty,
                subject_code='CS101', enrollment_type='code'
            )

    def test_faculty_task_creation(self):
        task = FacultyTask.objects.create(
            faculty=self.faculty, subject_code='CS101',
            text='Complete assignment 1'
        )
        self.assertEqual(task.text, 'Complete assignment 1')
        self.assertIsNone(task.due_date)

    def test_task_completion_creation(self):
        task = FacultyTask.objects.create(
            faculty=self.faculty, subject_code='CS101',
            text='Read chapter 1'
        )
        completion = FacultyTaskCompletion.objects.create(
            task=task, student=self.student
        )
        self.assertFalse(completion.is_completed)
        self.assertIsNone(completion.completed_at)


class ClassCodeViewTests(TestCase):
    """Tests for the ClassCode API views."""

    def setUp(self):
        self.faculty = User.objects.create_user(
            email='faculty@test.com', password='testpass123',
            first_name='Dr.', last_name='Smith', user_type='faculty'
        )
        self.student = User.objects.create_user(
            email='student@test.com', password='testpass123',
            first_name='John', last_name='Doe', user_type='student'
        )
        self.faculty_client = APIClient()
        self.faculty_client.force_authenticate(user=self.faculty)
        self.student_client = APIClient()
        self.student_client.force_authenticate(user=self.student)

    def test_faculty_generate_class_code(self):
        response = self.faculty_client.post('/api/faculty/class-code/', {
            'subject_code': 'CS101'
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('code', response.data)
        self.assertEqual(len(response.data['code']), 8)

    def test_faculty_list_class_codes(self):
        ClassCode.objects.create(faculty=self.faculty, subject_code='CS101', code=ClassCode.generate_code())
        ClassCode.objects.create(faculty=self.faculty, subject_code='CS102', code=ClassCode.generate_code())

        response = self.faculty_client.get('/api/faculty/class-code/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_faculty_filter_class_codes_by_subject(self):
        ClassCode.objects.create(faculty=self.faculty, subject_code='CS101', code=ClassCode.generate_code())
        ClassCode.objects.create(faculty=self.faculty, subject_code='CS102', code=ClassCode.generate_code())

        response = self.faculty_client.get('/api/faculty/class-code/', {'subject_code': 'CS101'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

    def test_student_cannot_generate_class_code(self):
        response = self.student_client.post('/api/faculty/class-code/', {
            'subject_code': 'CS101'
        })
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class StudentEnrollmentViewTests(TestCase):
    """Tests for student enrollment via class codes."""

    def setUp(self):
        self.faculty = User.objects.create_user(
            email='faculty@test.com', password='testpass123',
            first_name='Dr.', last_name='Smith', user_type='faculty'
        )
        self.student = User.objects.create_user(
            email='student@test.com', password='testpass123',
            first_name='John', last_name='Doe', user_type='student'
        )
        self.code = ClassCode.objects.create(
            faculty=self.faculty, subject_code='CS101',
            code=ClassCode.generate_code()
        )
        self.student_client = APIClient()
        self.student_client.force_authenticate(user=self.student)

    def test_student_enroll_with_valid_code(self):
        response = self.student_client.post('/api/student/enroll/', {
            'code': self.code.code
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(ClassEnrollment.objects.filter(
            student=self.student, faculty=self.faculty, subject_code='CS101'
        ).exists())

    def test_student_enroll_with_invalid_code(self):
        response = self.student_client.post('/api/student/enroll/', {
            'code': 'BADCODE1'
        })
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_student_duplicate_enrollment(self):
        self.student_client.post('/api/student/enroll/', {
            'code': self.code.code
        })
        response = self.student_client.post('/api/student/enroll/', {
            'code': self.code.code
        })
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_list_student_enrollments(self):
        ClassEnrollment.objects.create(
            student=self.student, faculty=self.faculty,
            subject_code='CS101', enrollment_type='code'
        )
        response = self.student_client.get('/api/student/enrollments/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)


class FacultyTaskViewTests(TestCase):
    """Tests for faculty task CRUD and stats."""

    def setUp(self):
        self.faculty = User.objects.create_user(
            email='faculty@test.com', password='testpass123',
            first_name='Dr.', last_name='Smith', user_type='faculty'
        )
        self.student = User.objects.create_user(
            email='student@test.com', password='testpass123',
            first_name='John', last_name='Doe', user_type='student'
        )
        self.faculty_client = APIClient()
        self.faculty_client.force_authenticate(user=self.faculty)
        self.student_client = APIClient()
        self.student_client.force_authenticate(user=self.student)

        # Create faculty schedule so task creation validation passes
        faculty_schedule = Schedule.objects.create(
            user=self.faculty, title='Faculty Schedule', upload_type='faculty'
        )
        Course.objects.create(
            user=self.faculty, schedule=faculty_schedule,
            subject_code='CS101', subject_name='Intro CS',
            start_time='8:00AM', end_time='9:00AM', day='M'
        )

        # Create enrollment
        ClassEnrollment.objects.create(
            student=self.student, faculty=self.faculty,
            subject_code='CS101', enrollment_type='code'
        )

    def test_faculty_create_task(self):
        response = self.faculty_client.post('/api/faculty/tasks/', {
            'subject_code': 'CS101',
            'text': 'Complete assignment 1'
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['text'], 'Complete assignment 1')

    def test_faculty_list_tasks(self):
        FacultyTask.objects.create(
            faculty=self.faculty, subject_code='CS101', text='Task 1'
        )
        FacultyTask.objects.create(
            faculty=self.faculty, subject_code='CS101', text='Task 2'
        )
        response = self.faculty_client.get('/api/faculty/tasks/', {'subject_code': 'CS101'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Paginated response has 'results' key
        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 2)

    def test_faculty_delete_task(self):
        task = FacultyTask.objects.create(
            faculty=self.faculty, subject_code='CS101', text='Task to delete'
        )
        response = self.faculty_client.delete(f'/api/faculty/tasks/{task.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(FacultyTask.objects.filter(id=task.id).exists())

    def test_faculty_view_task_stats(self):
        task = FacultyTask.objects.create(
            faculty=self.faculty, subject_code='CS101', text='Read chapter 1'
        )
        # Create a completion record
        FacultyTaskCompletion.objects.create(
            task=task, student=self.student, is_completed=True
        )
        response = self.faculty_client.get(f'/api/faculty/tasks/{task.id}/stats/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['completed_count'], 1)

    def test_student_cannot_create_task(self):
        response = self.student_client.post('/api/faculty/tasks/', {
            'subject_code': 'CS101',
            'text': 'Attempt to create task'
        })
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class StudentFacultyTaskViewTests(TestCase):
    """Tests for student-side faculty task views."""

    def setUp(self):
        self.faculty = User.objects.create_user(
            email='faculty@test.com', password='testpass123',
            first_name='Dr.', last_name='Smith', user_type='faculty'
        )
        self.student = User.objects.create_user(
            email='student@test.com', password='testpass123',
            first_name='John', last_name='Doe', user_type='student'
        )
        self.student_client = APIClient()
        self.student_client.force_authenticate(user=self.student)

        # Create enrollment and task
        self.enrollment = ClassEnrollment.objects.create(
            student=self.student, faculty=self.faculty,
            subject_code='CS101', enrollment_type='code'
        )
        self.task = FacultyTask.objects.create(
            faculty=self.faculty, subject_code='CS101',
            text='Complete lab report'
        )

    def test_student_list_faculty_tasks(self):
        response = self.student_client.get('/api/student/faculty-tasks/', {
            'subject_code': 'CS101'
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Paginated response has 'results' key
        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['text'], 'Complete lab report')

    def test_student_complete_faculty_task(self):
        response = self.student_client.post(
            f'/api/student/faculty-tasks/{self.task.id}/complete/',
            {'is_completed': True}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['is_completed'])

    def test_student_toggle_completion(self):
        # Complete
        self.student_client.post(
            f'/api/student/faculty-tasks/{self.task.id}/complete/',
            {'is_completed': True},
            format='json'
        )
        # Uncomplete
        response = self.student_client.post(
            f'/api/student/faculty-tasks/{self.task.id}/complete/',
            {'is_completed': False},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['is_completed'])

    def test_student_faculty_task_counts(self):
        response = self.student_client.post(
            '/api/student/faculty-tasks/counts/',
            {'subject_codes': ['CS101']},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('CS101', response.data)
        self.assertEqual(response.data['CS101']['total'], 1)
        self.assertEqual(response.data['CS101']['incomplete'], 1)


class AutoEnrollmentTests(TestCase):
    """Tests for auto-enrollment on schedule creation."""

    def setUp(self):
        self.faculty = User.objects.create_user(
            email='faculty@test.com', password='testpass123',
            first_name='Dr.', last_name='Smith', user_type='faculty'
        )
        self.student = User.objects.create_user(
            email='student@test.com', password='testpass123',
            first_name='John', last_name='Doe', user_type='student'
        )

    def test_auto_enrollment_creates_enrollment(self):
        from api.views.faculty_task_views import auto_enroll_on_schedule_create

        # Faculty has a schedule with CS101
        faculty_schedule = Schedule.objects.create(
            user=self.faculty, title='Faculty Schedule', upload_type='faculty'
        )
        Course.objects.create(
            user=self.faculty, schedule=faculty_schedule,
            subject_code='CS101', subject_name='Intro CS',
            start_time='8:00AM', end_time='9:00AM', day='MWF'
        )

        # Student creates a schedule with the same subject code
        auto_enroll_on_schedule_create(self.student, ['CS101'])

        # Enrollment should be created
        enrollment = ClassEnrollment.objects.filter(
            student=self.student, faculty=self.faculty, subject_code='CS101'
        )
        self.assertTrue(enrollment.exists())
        self.assertEqual(enrollment.first().enrollment_type, 'auto')

    def test_auto_enrollment_no_match(self):
        from api.views.faculty_task_views import auto_enroll_on_schedule_create

        # No matching faculty schedule
        auto_enroll_on_schedule_create(self.student, ['CS999'])

        self.assertEqual(ClassEnrollment.objects.count(), 0)


class UnenrollAndRemoveTests(TestCase):
    """Tests for student unenroll and faculty remove-student endpoints."""

    def setUp(self):
        self.faculty = User.objects.create_user(
            email='faculty@test.com', password='testpass123',
            first_name='Dr.', last_name='Smith', user_type='faculty'
        )
        self.student = User.objects.create_user(
            email='student@test.com', password='testpass123',
            first_name='John', last_name='Doe', user_type='student'
        )
        self.faculty_client = APIClient()
        self.faculty_client.force_authenticate(user=self.faculty)
        self.student_client = APIClient()
        self.student_client.force_authenticate(user=self.student)

        self.enrollment = ClassEnrollment.objects.create(
            student=self.student, faculty=self.faculty,
            subject_code='CS101', enrollment_type='code'
        )

    def test_student_unenroll_by_id(self):
        response = self.student_client.post('/api/student/unenroll/', {
            'enrollment_id': self.enrollment.id
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.enrollment.refresh_from_db()
        self.assertEqual(self.enrollment.status, 'removed')

    def test_student_unenroll_by_subject(self):
        response = self.student_client.post('/api/student/unenroll/', {
            'faculty_email': 'faculty@test.com',
            'subject_code': 'CS101'
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.enrollment.refresh_from_db()
        self.assertEqual(self.enrollment.status, 'removed')

    def test_faculty_cannot_unenroll(self):
        response = self.faculty_client.post('/api/student/unenroll/', {
            'enrollment_id': self.enrollment.id
        })
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_faculty_remove_student_by_id(self):
        response = self.faculty_client.post('/api/faculty/remove-student/', {
            'enrollment_id': self.enrollment.id
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.enrollment.refresh_from_db()
        self.assertEqual(self.enrollment.status, 'removed')

    def test_faculty_remove_student_by_email(self):
        response = self.faculty_client.post('/api/faculty/remove-student/', {
            'student_email': 'student@test.com',
            'subject_code': 'CS101'
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.enrollment.refresh_from_db()
        self.assertEqual(self.enrollment.status, 'removed')

    def test_student_cannot_remove_student(self):
        response = self.student_client.post('/api/faculty/remove-student/', {
            'enrollment_id': self.enrollment.id
        })
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unenroll_not_found(self):
        response = self.student_client.post('/api/student/unenroll/', {
            'enrollment_id': 9999
        })
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class UserTypeCheckTests(TestCase):
    """Tests to verify user_type guards on student endpoints."""

    def setUp(self):
        self.faculty = User.objects.create_user(
            email='faculty@test.com', password='testpass123',
            first_name='Dr.', last_name='Smith', user_type='faculty'
        )
        self.parent = User.objects.create_user(
            email='parent@test.com', password='testpass123',
            first_name='Jane', last_name='Doe', user_type='parent'
        )
        self.faculty_client = APIClient()
        self.faculty_client.force_authenticate(user=self.faculty)
        self.parent_client = APIClient()
        self.parent_client.force_authenticate(user=self.parent)

    def test_faculty_cannot_access_student_enrollments(self):
        response = self.faculty_client.get('/api/student/enrollments/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_parent_cannot_access_student_faculty_tasks(self):
        response = self.parent_client.get('/api/student/faculty-tasks/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_faculty_cannot_complete_faculty_task(self):
        task = FacultyTask.objects.create(
            faculty=self.faculty, subject_code='CS101', text='Test task'
        )
        response = self.faculty_client.post(
            f'/api/student/faculty-tasks/{task.id}/complete/',
            {'is_completed': True}
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_parent_cannot_view_task_counts(self):
        response = self.parent_client.post(
            '/api/student/faculty-tasks/counts/',
            {'subject_codes': ['CS101']},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class FacultyEnrollmentTests(TestCase):
    """Tests for faculty enrolling in classes via class codes."""

    def setUp(self):
        self.faculty1 = User.objects.create_user(
            email='faculty1@test.com', password='testpass123',
            first_name='Dr.', last_name='Smith', user_type='faculty'
        )
        self.faculty2 = User.objects.create_user(
            email='faculty2@test.com', password='testpass123',
            first_name='Prof.', last_name='Jones', user_type='faculty'
        )
        # faculty2's class code
        self.code = ClassCode.objects.create(
            faculty=self.faculty2, subject_code='MATH201',
            code=ClassCode.generate_code()
        )
        self.faculty1_client = APIClient()
        self.faculty1_client.force_authenticate(user=self.faculty1)
        self.faculty2_client = APIClient()
        self.faculty2_client.force_authenticate(user=self.faculty2)

    def test_faculty_can_enroll_with_class_code(self):
        response = self.faculty1_client.post('/api/student/enroll/', {
            'code': self.code.code
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(ClassEnrollment.objects.filter(
            student=self.faculty1, faculty=self.faculty2,
            subject_code='MATH201', status='active'
        ).exists())

    def test_faculty_cannot_self_enroll(self):
        response = self.faculty2_client.post('/api/student/enroll/', {
            'code': self.code.code
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('own class', response.data['error'])

    def test_faculty_can_list_enrollments(self):
        ClassEnrollment.objects.create(
            student=self.faculty1, faculty=self.faculty2,
            subject_code='MATH201', enrollment_type='code'
        )
        response = self.faculty1_client.get('/api/student/enrollments/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

    def test_faculty_can_unenroll(self):
        enrollment = ClassEnrollment.objects.create(
            student=self.faculty1, faculty=self.faculty2,
            subject_code='MATH201', enrollment_type='code'
        )
        response = self.faculty1_client.post('/api/student/unenroll/', {
            'enrollment_id': enrollment.id
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        enrollment.refresh_from_db()
        self.assertEqual(enrollment.status, 'removed')


class EnrollSyncTests(TestCase):
    """Tests for the enroll + sync to calendar endpoint."""

    def setUp(self):
        self.faculty = User.objects.create_user(
            email='faculty@test.com', password='testpass123',
            first_name='Dr.', last_name='Smith', user_type='faculty'
        )
        self.student = User.objects.create_user(
            email='student@test.com', password='testpass123',
            first_name='John', last_name='Doe', user_type='student'
        )

        # Faculty schedule with courses
        self.faculty_schedule = Schedule.objects.create(
            user=self.faculty, title='Faculty Schedule', upload_type='faculty'
        )
        Course.objects.create(
            user=self.faculty, schedule=self.faculty_schedule,
            subject_code='CS101', subject_name='Intro CS',
            start_time='8:00AM', end_time='9:00AM', day='M'
        )
        Course.objects.create(
            user=self.faculty, schedule=self.faculty_schedule,
            subject_code='CS101', subject_name='Intro CS',
            start_time='8:00AM', end_time='9:00AM', day='W'
        )

        self.code = ClassCode.objects.create(
            faculty=self.faculty, subject_code='CS101',
            code=ClassCode.generate_code()
        )

        self.student_client = APIClient()
        self.student_client.force_authenticate(user=self.student)

    def test_enroll_sync_no_conflicts(self):
        """Syncing when student has no conflicting courses."""
        # Create student schedule with non-conflicting course
        student_schedule = Schedule.objects.create(
            user=self.student, title='Student Schedule',
            upload_type='student', is_active=True
        )
        Course.objects.create(
            user=self.student, schedule=student_schedule,
            subject_code='ENG101', subject_name='English',
            start_time='10:00AM', end_time='11:00AM', day='M'
        )

        response = self.student_client.post('/api/student/enroll/sync/', {
            'code': self.code.code
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['enrolled'])
        self.assertTrue(response.data['synced'])
        self.assertEqual(response.data['courses_added'], 2)

        # Verify courses were added to schedule
        self.assertEqual(student_schedule.courses.count(), 3)  # 1 existing + 2 new

    def test_enroll_sync_with_conflicts(self):
        """Syncing detects time conflicts and returns them."""
        student_schedule = Schedule.objects.create(
            user=self.student, title='Student Schedule',
            upload_type='student', is_active=True
        )
        # Add a conflicting course (same day & overlapping time)
        Course.objects.create(
            user=self.student, schedule=student_schedule,
            subject_code='MATH201', subject_name='Math',
            start_time='8:30AM', end_time='10:00AM', day='M'
        )

        response = self.student_client.post('/api/student/enroll/sync/', {
            'code': self.code.code
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['enrolled'])
        self.assertFalse(response.data['synced'])
        self.assertTrue(response.data['has_conflicts'])
        self.assertEqual(len(response.data['conflicts']), 1)

        # Course should NOT have been added
        self.assertEqual(student_schedule.courses.count(), 1)

    def test_enroll_sync_force_with_conflicts(self):
        """Force-adding courses despite conflicts."""
        student_schedule = Schedule.objects.create(
            user=self.student, title='Student Schedule',
            upload_type='student', is_active=True
        )
        Course.objects.create(
            user=self.student, schedule=student_schedule,
            subject_code='MATH201', subject_name='Math',
            start_time='8:30AM', end_time='10:00AM', day='M'
        )

        response = self.student_client.post(
            '/api/student/enroll/sync/',
            {'code': self.code.code, 'force': True},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['enrolled'])
        self.assertTrue(response.data['synced'])
        self.assertEqual(response.data['courses_added'], 2)

    def test_enroll_sync_no_active_schedule(self):
        """Creates a new schedule if user has none."""
        response = self.student_client.post('/api/student/enroll/sync/', {
            'code': self.code.code
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['synced'])

        # Should have created a new schedule
        self.assertTrue(Schedule.objects.filter(
            user=self.student, is_active=True
        ).exists())

    def test_enroll_sync_self_enrollment(self):
        """Faculty cannot sync enroll in their own class."""
        faculty_client = APIClient()
        faculty_client.force_authenticate(user=self.faculty)
        response = faculty_client.post('/api/student/enroll/sync/', {
            'code': self.code.code
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_enroll_sync_regenerates_timetable(self):
        """Timetable image is regenerated after courses are synced."""
        student_schedule = Schedule.objects.create(
            user=self.student, title='Student Schedule',
            upload_type='student', is_active=True
        )
        # Start with no timetable image
        self.assertFalse(bool(student_schedule.timetable_image))

        response = self.student_client.post('/api/student/enroll/sync/', {
            'code': self.code.code
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['courses_added'], 2)

        # Timetable image should now exist
        student_schedule.refresh_from_db()
        self.assertTrue(bool(student_schedule.timetable_image))
        self.assertIn('timetables/', str(student_schedule.timetable_image))

    def test_enroll_sync_no_regen_when_no_courses_added(self):
        """Timetable is not regenerated if no new courses are added (duplicate sync)."""
        student_schedule = Schedule.objects.create(
            user=self.student, title='Student Schedule',
            upload_type='student', is_active=True
        )
        # Pre-add the same courses that would be synced
        Course.objects.create(
            user=self.student, schedule=student_schedule,
            subject_code='CS101', subject_name='Intro CS',
            start_time='8:00AM', end_time='9:00AM', day='M'
        )
        Course.objects.create(
            user=self.student, schedule=student_schedule,
            subject_code='CS101', subject_name='Intro CS',
            start_time='8:00AM', end_time='9:00AM', day='W'
        )

        # Identical courses overlap with themselves, so force=True is needed
        # to reach the "add courses" step (which will skip all duplicates)
        response = self.student_client.post(
            '/api/student/enroll/sync/',
            {'code': self.code.code, 'force': True},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['courses_added'], 0)

        # Timetable should NOT have been generated (no courses added)
        student_schedule.refresh_from_db()
        self.assertFalse(bool(student_schedule.timetable_image))

    def test_enroll_sync_force_regenerates_timetable(self):
        """Timetable is regenerated when force-adding courses with conflicts."""
        student_schedule = Schedule.objects.create(
            user=self.student, title='Student Schedule',
            upload_type='student', is_active=True
        )
        Course.objects.create(
            user=self.student, schedule=student_schedule,
            subject_code='MATH201', subject_name='Math',
            start_time='8:30AM', end_time='10:00AM', day='M'
        )

        response = self.student_client.post(
            '/api/student/enroll/sync/',
            {'code': self.code.code, 'force': True},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['courses_added'], 2)

        # Timetable should be regenerated with all 3 courses
        student_schedule.refresh_from_db()
        self.assertTrue(bool(student_schedule.timetable_image))

    def test_enroll_sync_new_schedule_gets_timetable(self):
        """Auto-created schedule gets a timetable image after sync."""
        # No active schedule — one will be auto-created
        response = self.student_client.post('/api/student/enroll/sync/', {
            'code': self.code.code
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['synced'])

        # The auto-created schedule should have a timetable
        new_schedule = Schedule.objects.get(user=self.student, is_active=True)
        self.assertTrue(bool(new_schedule.timetable_image))


class FacultyTaskFileTests(TestCase):
    """Tests for faculty task file upload and download."""

    def setUp(self):
        self.faculty = User.objects.create_user(
            email='faculty@test.com', password='testpass123',
            first_name='Dr.', last_name='Smith', user_type='faculty'
        )
        self.student = User.objects.create_user(
            email='student@test.com', password='testpass123',
            first_name='John', last_name='Doe', user_type='student'
        )
        self.other_student = User.objects.create_user(
            email='other@test.com', password='testpass123',
            first_name='Jane', last_name='Other', user_type='student'
        )
        self.faculty_client = APIClient()
        self.faculty_client.force_authenticate(user=self.faculty)
        self.student_client = APIClient()
        self.student_client.force_authenticate(user=self.student)
        self.other_client = APIClient()
        self.other_client.force_authenticate(user=self.other_student)

        # Faculty schedule
        faculty_schedule = Schedule.objects.create(
            user=self.faculty, title='Faculty Schedule', upload_type='faculty'
        )
        Course.objects.create(
            user=self.faculty, schedule=faculty_schedule,
            subject_code='CS101', subject_name='Intro CS',
            start_time='8:00AM', end_time='9:00AM', day='M'
        )

        # Enrolled student
        ClassEnrollment.objects.create(
            student=self.student, faculty=self.faculty,
            subject_code='CS101', enrollment_type='code'
        )
        # other_student is NOT enrolled

    def _make_test_file(self, name='test.pdf', content=b'%PDF-1.4 test content', content_type='application/pdf'):
        from django.core.files.uploadedfile import SimpleUploadedFile
        return SimpleUploadedFile(name, content, content_type=content_type)

    def test_faculty_create_task_with_file(self):
        """Faculty can create a task with a file attachment."""
        test_file = self._make_test_file()
        response = self.faculty_client.post(
            '/api/faculty/tasks/',
            {'subject_code': 'CS101', 'text': 'Read this PDF', 'file': test_file},
            format='multipart'
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['has_file'])
        self.assertEqual(response.data['file_name'], 'test.pdf')

    def test_faculty_create_task_without_file(self):
        """Creating a task without file still works (backward compat)."""
        response = self.faculty_client.post('/api/faculty/tasks/', {
            'subject_code': 'CS101', 'text': 'No file task'
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(response.data['has_file'])

    def test_faculty_download_own_file(self):
        """Faculty can download files they uploaded."""
        test_file = self._make_test_file()
        response = self.faculty_client.post(
            '/api/faculty/tasks/',
            {'subject_code': 'CS101', 'text': 'Download me', 'file': test_file},
            format='multipart'
        )
        task_id = response.data['id']

        download_response = self.faculty_client.get(f'/api/faculty/tasks/{task_id}/file/')
        self.assertEqual(download_response.status_code, 200)

    def test_enrolled_student_download_file(self):
        """Enrolled students can download task files."""
        test_file = self._make_test_file()
        response = self.faculty_client.post(
            '/api/faculty/tasks/',
            {'subject_code': 'CS101', 'text': 'For students', 'file': test_file},
            format='multipart'
        )
        task_id = response.data['id']

        download_response = self.student_client.get(f'/api/faculty/tasks/{task_id}/file/')
        self.assertEqual(download_response.status_code, 200)

    def test_unenrolled_student_cannot_download(self):
        """Non-enrolled students cannot download task files."""
        test_file = self._make_test_file()
        response = self.faculty_client.post(
            '/api/faculty/tasks/',
            {'subject_code': 'CS101', 'text': 'Secret file', 'file': test_file},
            format='multipart'
        )
        task_id = response.data['id']

        download_response = self.other_client.get(f'/api/faculty/tasks/{task_id}/file/')
        self.assertEqual(download_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_file_type_validation(self):
        """Uploading disallowed file types is rejected."""
        bad_file = self._make_test_file(name='malware.exe', content=b'bad', content_type='application/x-msdownload')
        response = self.faculty_client.post(
            '/api/faculty/tasks/',
            {'subject_code': 'CS101', 'text': 'Bad file', 'file': bad_file},
            format='multipart'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Invalid file type', response.data['error'])

    def test_file_size_validation(self):
        """Uploading files larger than 10 MB is rejected."""
        # Create a file just over 10 MB
        big_content = b'x' * (10 * 1024 * 1024 + 1)
        big_file = self._make_test_file(name='huge.pdf', content=big_content)
        response = self.faculty_client.post(
            '/api/faculty/tasks/',
            {'subject_code': 'CS101', 'text': 'Huge file', 'file': big_file},
            format='multipart'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('File too large', response.data['error'])

    def test_download_no_file_returns_404(self):
        """Downloading from task with no file returns 404."""
        task = FacultyTask.objects.create(
            faculty=self.faculty, subject_code='CS101', text='No file'
        )
        response = self.faculty_client.get(f'/api/faculty/tasks/{task.id}/file/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
