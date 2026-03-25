import uuid

from django.db import models
from django.contrib.auth.models import AbstractUser
from django.contrib.auth.base_user import BaseUserManager



class CustomUserManager(BaseUserManager):
    """
    Custom user manager where email is the unique identifier
    instead of username.
    """
    def create_user(self, email, password=None, **extra_fields):
        """
        Create and save a User with the given email and password.
        """
        if not email:
            raise ValueError('The Email field must be set')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        """
        Create and save a SuperUser with the given email and password.
        """
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_active', True)

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')
        
        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    """
    Custom User model that uses email as the primary identifier
    instead of username.
    """
    USER_TYPE_CHOICES = [
        ('student', 'Student'),
        ('faculty', 'Faculty'),
        ('parent', 'Parent'),
    ]
    CLASS_REMINDER_MINUTES_CHOICES = [
        (5, '5 minutes'),
        (10, '10 minutes'),
        (15, '15 minutes'),
    ]
    
    username = None  # Remove username field
    email = models.EmailField(unique=True, max_length=255)
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    user_type = models.CharField(
        max_length=10,
        choices=USER_TYPE_CHOICES,
        default='student',
        help_text="Type of user account: student, faculty, or parent"
    )
    student_number = models.CharField(
        max_length=20,
        null=True,
        blank=True,
        unique=True,
        help_text="Student number from COR (e.g., 2022-01191). Required for students to verify COR ownership."
    )
    profile_picture = models.ImageField(
        upload_to='profile_pictures/',
        null=True,
        blank=True,
        help_text="User's profile picture"
    )
    expo_push_token = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        help_text="Expo push notification token for this device"
    )
    class_reminder_minutes_before = models.PositiveSmallIntegerField(
        choices=CLASS_REMINDER_MINUTES_CHOICES,
        default=15,
        help_text="Preferred reminder lead time before class starts"
    )
    is_verified = models.BooleanField(
        default=False,
        help_text=(
            "Whether this account has been admin-verified. "
            "Faculty accounts should be verified before they can generate class codes."
        ),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Set email as the username field
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['first_name', 'last_name']

    objects = CustomUserManager()

    class Meta:
        verbose_name = 'User'
        verbose_name_plural = 'Users'
        ordering = ['-created_at']

    def __str__(self):
        return self.email

    def get_full_name(self):
        """
        Return the first_name plus the last_name, with a space in between.
        """
        return f"{self.first_name} {self.last_name}".strip()

    def get_short_name(self):
        """
        Return the short name for the user.
        """
        return self.first_name


class Schedule(models.Model):
    """
    Model to group courses into named schedules.
    Each schedule represents a saved COR upload with a user-defined title.
    Users can have multiple schedules but only one can be active at a time.
    """
    UPLOAD_TYPE_CHOICES = [
        ('student', 'Student'),
        ('faculty', 'Faculty'),
        ('merged', 'Merged'),
    ]
    
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='schedules',
        help_text="The user who owns this schedule"
    )
    title = models.CharField(
        max_length=255,
        help_text="User-defined name for this schedule"
    )
    upload_type = models.CharField(
        max_length=10,
        choices=UPLOAD_TYPE_CHOICES,
        help_text="Type of schedule: student or faculty"
    )
    semester = models.CharField(
        max_length=20,
        blank=True,
        default='',
        help_text="Semester (e.g., '1ST', '2ND', 'SUMMER')"
    )
    school_year = models.CharField(
        max_length=20,
        blank=True,
        default='',
        help_text="School year (e.g., '2025-2026')"
    )
    is_active = models.BooleanField(
        default=False,
        help_text="Whether this is the currently active schedule for the user"
    )
    timetable_image = models.ImageField(
        upload_to='timetables/',
        null=True,
        blank=True,
        help_text="Auto-generated timetable image for this schedule"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Schedule'
        verbose_name_plural = 'Schedules'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'upload_type']),
            models.Index(fields=['user', 'is_active']),
        ]
    
    def __str__(self):
        active_str = " (Active)" if self.is_active else ""
        return f"{self.title} - {self.upload_type}{active_str}"
    
    def save(self, *args, **kwargs):
        # If this schedule is being set as active, deactivate all other schedules for this user
        if self.is_active:
            Schedule.objects.filter(user=self.user, is_active=True).exclude(pk=self.pk).update(is_active=False)
        super().save(*args, **kwargs)


class Course(models.Model):
    """
    Model to store course schedule information extracted from COR documents.
    Each course entry represents a single class session with its details.
    
    Note: Multi-day courses (e.g., MTH, TF) are split into individual day entries
    during OCR extraction. Each day gets its own Course record with the same time.
    """
    DAY_CHOICES = [
        ('M', 'Monday'),
        ('T', 'Tuesday'),
        ('W', 'Wednesday'),
        ('TH', 'Thursday'),
        ('F', 'Friday'),
        ('S', 'Saturday'),
    ]
    
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='courses',
        help_text="The user who owns this course schedule"
    )
    schedule = models.ForeignKey(
        Schedule,
        on_delete=models.CASCADE,
        related_name='courses',
        null=True,
        blank=True,
        help_text="The schedule this course belongs to"
    )
    subject_code = models.CharField(
        max_length=50,
        help_text="Course subject code (e.g., BSCS125781)"
    )
    subject_name = models.CharField(
        max_length=255,
        blank=True,
        help_text="Name/title of the course"
    )
    start_time = models.CharField(
        max_length=20,
        help_text="Class start time (e.g., 07:00AM)"
    )
    end_time = models.CharField(
        max_length=20,
        help_text="Class end time (e.g., 09:00AM)"
    )
    day = models.CharField(
        max_length=10,
        choices=DAY_CHOICES,
        blank=True,
        help_text="Day(s) of the week the class meets"
    )
    location = models.CharField(
        max_length=100,
        blank=True,
        help_text="Classroom/location (e.g., LR7, LAB2)"
    )
    source_type = models.CharField(
        max_length=10,
        choices=[('student', 'Student'), ('faculty', 'Faculty')],
        null=True,
        blank=True,
        help_text="Original source schedule type (for merged schedules)"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Course'
        verbose_name_plural = 'Courses'
        ordering = ['day', 'start_time']
        indexes = [
            models.Index(fields=['user', 'subject_code']),
            models.Index(fields=['user', 'day']),
        ]
    
    def __str__(self):
        return f"{self.subject_code} - {self.subject_name or 'N/A'} ({self.day} {self.start_time}-{self.end_time})"


class Task(models.Model):
    """
    Model to store tasks associated with a subject code.
    Tasks are shared across schedules - if you have the same subject code
    in multiple schedules, they share the same tasks.
    """
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='tasks',
        help_text="The user who owns this task"
    )
    subject_code = models.CharField(
        max_length=50,
        help_text="Subject code this task is associated with"
    )
    text = models.CharField(
        max_length=500,
        help_text="Task description/content"
    )
    is_completed = models.BooleanField(
        default=False,
        help_text="Whether this task has been completed"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Task'
        verbose_name_plural = 'Tasks'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'subject_code']),
        ]

    def __str__(self):
        status = "✓" if self.is_completed else "○"
        return f"[{status}] {self.subject_code}: {self.text[:50]}"


class ParentChildLink(models.Model):
    """
    Links parent accounts to student accounts.
    One parent can have MULTIPLE children.
    One student can have multiple parent links.
    """
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('revoked', 'Revoked'),
    ]
    
    parent = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='child_links',  # Changed from 'child_link' for multiple
        help_text="The parent user"
    )
    child = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='parent_links',
        help_text="The student (child) user"
    )
    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default='active',
        help_text="Status of the parent-child link"
    )
    linked_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        verbose_name = 'Parent-Child Link'
        verbose_name_plural = 'Parent-Child Links'
        indexes = [
            models.Index(fields=['parent', 'status']),
            models.Index(fields=['child', 'status']),
        ]
        # Prevent duplicate active links between same parent-child pair
        constraints = [
            models.UniqueConstraint(
                fields=['parent', 'child'],
                condition=models.Q(status='active'),
                name='unique_active_parent_child_link'
            )
        ]
    
    def __str__(self):
        return f"{self.parent.email} → {self.child.email} ({self.status})"


class InviteCode(models.Model):
    """
    Invite codes for parents to link to student accounts.
    Codes are 10 characters alphanumeric and don't expire.
    Only one active code per student - generating a new one invalidates the old.
    """
    student = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='invite_codes',
        help_text="The student who generated this code"
    )
    code = models.CharField(
        max_length=10,
        unique=True,
        help_text="10-character alphanumeric invite code"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this code is still valid"
    )
    used = models.BooleanField(
        default=False,
        help_text="Whether this code has been used"
    )
    used_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='used_invite_codes',
        help_text="The parent who used this code"
    )
    used_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the code was used"
    )
    
    class Meta:
        verbose_name = 'Invite Code'
        verbose_name_plural = 'Invite Codes'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['student', 'is_active', 'used']),
        ]
    
    def __str__(self):
        status = "Used" if self.used else ("Active" if self.is_active else "Inactive")
        return f"{self.code} - {self.student.email} ({status})"
    
    @classmethod
    def generate_code(cls):
        """Generate a random 10-character alphanumeric code."""
        import secrets
        import string
        alphabet = string.ascii_uppercase + string.digits
        # Loop with max attempts to prevent infinite loop
        for _ in range(100):
            code = ''.join(secrets.choice(alphabet) for _ in range(10))
            if not cls.objects.filter(code=code).exists():
                return code
        raise RuntimeError("Failed to generate unique invite code after 100 attempts")


class Payment(models.Model):
    """
    Tracks Stripe payments for additional child linking.
    First child is free; each additional child requires a one-time ₱89 payment.
    """
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]

    parent = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='payments',
        help_text="The parent who made this payment"
    )
    stripe_checkout_session_id = models.CharField(
        max_length=255,
        unique=True,
        help_text="Stripe Checkout Session ID"
    )
    stripe_payment_intent_id = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        help_text="Stripe PaymentIntent ID (set after payment completes)"
    )
    amount = models.IntegerField(
        help_text="Amount in centavos (e.g. 8900 = ₱89.00)"
    )
    currency = models.CharField(
        max_length=10,
        default='php',
        help_text="Payment currency"
    )
    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default='pending',
        help_text="Payment status"
    )
    child_slot_number = models.IntegerField(
        help_text="Which child slot this payment unlocks (2 = second child, etc.)"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the payment was completed"
    )

    class Meta:
        verbose_name = 'Payment'
        verbose_name_plural = 'Payments'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['parent', 'status']),
            models.Index(fields=['stripe_checkout_session_id']),
        ]

    def __str__(self):
        return f"Payment #{self.id} - {self.parent.email} slot {self.child_slot_number} ({self.status})"


class PasswordResetCode(models.Model):
    """
    Stores 6-digit codes for password reset flow.
    Codes expire after 10 minutes and can only be used once.
    After verification, a UUID reset_token is issued for the final password change.
    """
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='password_reset_codes',
        help_text="The user requesting a password reset"
    )
    code = models.CharField(
        max_length=6,
        help_text="6-digit verification code"
    )
    reset_token = models.UUIDField(
        null=True,
        blank=True,
        unique=True,
        help_text="UUID token issued after code verification, used to set new password"
    )
    is_used = models.BooleanField(
        default=False,
        help_text="Whether this code/token has been fully used to reset the password"
    )
    is_verified = models.BooleanField(
        default=False,
        help_text="Whether the 6-digit code has been verified"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(
        help_text="When this code expires (10 minutes after creation)"
    )

    class Meta:
        verbose_name = 'Password Reset Code'
        verbose_name_plural = 'Password Reset Codes'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'code']),
            models.Index(fields=['reset_token']),
        ]

    def __str__(self):
        status = "Used" if self.is_used else ("Verified" if self.is_verified else "Pending")
        return f"Reset code for {self.user.email} ({status})"

    @property
    def is_expired(self):
        """Check if the code has expired."""
        from django.utils import timezone
        return timezone.now() > self.expires_at

    @classmethod
    def generate_code(cls):
        """Generate a random 6-digit numeric code."""
        import secrets
        return f"{secrets.randbelow(1000000):06d}"

    @classmethod
    def create_for_user(cls, user):
        """
        Create a new reset code for a user.
        Invalidates any existing unused codes for this user.
        """
        from django.utils import timezone
        from datetime import timedelta

        # Invalidate old unused codes
        cls.objects.filter(user=user, is_used=False).update(is_used=True)

        code = cls.generate_code()
        return cls.objects.create(
            user=user,
            code=code,
            expires_at=timezone.now() + timedelta(minutes=10),
        )


# ============================================
# Faculty-Student Connection Models
# ============================================

class ClassCode(models.Model):
    """
    Class codes generated by faculty for students to join their class.
    Each code is an 8-character alphanumeric string tied to a faculty + subject_code.
    Only one active code per faculty+subject pair — generating a new one deactivates the old.
    """
    faculty = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='class_codes',
        help_text="The faculty who generated this code"
    )
    subject_code = models.CharField(
        max_length=50,
        help_text="Subject code this class code is for"
    )
    code = models.CharField(
        max_length=8,
        unique=True,
        help_text="8-character alphanumeric class code"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this code is still valid for enrollment"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Class Code'
        verbose_name_plural = 'Class Codes'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['faculty', 'subject_code', 'is_active']),
        ]

    def __str__(self):
        status = "Active" if self.is_active else "Inactive"
        return f"{self.code} - {self.faculty.email} / {self.subject_code} ({status})"

    @classmethod
    def generate_code(cls):
        """Generate a random 8-character alphanumeric code."""
        import secrets
        import string
        alphabet = string.ascii_uppercase + string.digits
        for _ in range(100):
            code = ''.join(secrets.choice(alphabet) for _ in range(8))
            if not cls.objects.filter(code=code).exists():
                return code
        raise RuntimeError("Failed to generate unique class code after 100 attempts")


class ClassEnrollment(models.Model):
    """
    Links a student to a faculty member's class for a specific subject code.
    Students can be enrolled via auto-matching (same subject code in schedules)
    or manually via a class code.
    """
    ENROLLMENT_TYPE_CHOICES = [
        ('auto', 'Auto-matched'),
        ('code', 'Via class code'),
    ]
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('removed', 'Removed'),
    ]

    faculty = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='faculty_enrollments',
        help_text="The faculty member teaching the class"
    )
    student = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='student_enrollments',
        help_text="The student enrolled in the class"
    )
    subject_code = models.CharField(
        max_length=50,
        help_text="Subject code for this enrollment"
    )
    enrollment_type = models.CharField(
        max_length=10,
        choices=ENROLLMENT_TYPE_CHOICES,
        default='code',
        help_text="How the student was enrolled"
    )
    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default='active',
        help_text="Status of the enrollment"
    )
    enrolled_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Class Enrollment'
        verbose_name_plural = 'Class Enrollments'
        ordering = ['-enrolled_at']
        indexes = [
            models.Index(fields=['faculty', 'subject_code', 'status']),
            models.Index(fields=['student', 'subject_code', 'status']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['student', 'faculty', 'subject_code'],
                condition=models.Q(status='active'),
                name='unique_active_enrollment'
            )
        ]

    def __str__(self):
        return f"{self.student.email} → {self.faculty.email} / {self.subject_code} ({self.status})"


class FacultyTask(models.Model):
    """
    Tasks created by faculty for their class.
    Separate from personal Task model — these are visible to all enrolled students.
    Completion is tracked per-student via FacultyTaskCompletion.
    Files are stored in the related FacultyTaskFile model (supports multiple files).
    Legacy single-file fields (file, file_name) are kept for backward compatibility
    but new uploads should use FacultyTaskFile.
    """
    faculty = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='faculty_tasks',
        help_text="The faculty who created this task"
    )
    subject_code = models.CharField(
        max_length=50,
        help_text="Subject code this task is for"
    )
    text = models.CharField(
        max_length=500,
        help_text="Task description/content"
    )
    due_date = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Optional due date for the task"
    )
    # Legacy single-file fields — kept for backward compat with existing data
    file = models.FileField(
        upload_to='faculty_files/%Y/%m/',
        null=True,
        blank=True,
        help_text="(Legacy) Single file attachment — use FacultyTaskFile for new uploads"
    )
    file_name = models.CharField(
        max_length=255,
        blank=True,
        default='',
        help_text="(Legacy) Original filename of the uploaded file"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Faculty Task'
        verbose_name_plural = 'Faculty Tasks'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['faculty', 'subject_code']),
        ]

    def __str__(self):
        return f"[Faculty] {self.subject_code}: {self.text[:50]}"


class FacultyTaskFile(models.Model):
    """
    File attachment for a faculty task. Supports multiple files per task.
    """
    task = models.ForeignKey(
        FacultyTask,
        on_delete=models.CASCADE,
        related_name='files',
        help_text="The task this file belongs to"
    )
    file = models.FileField(
        upload_to='faculty_files/%Y/%m/',
        help_text="The uploaded file"
    )
    file_name = models.CharField(
        max_length=255,
        help_text="Original filename"
    )
    file_size = models.PositiveIntegerField(
        default=0,
        help_text="File size in bytes"
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Faculty Task File'
        verbose_name_plural = 'Faculty Task Files'
        ordering = ['uploaded_at']

    def __str__(self):
        return f"{self.file_name} ({self.task_id})"


class FacultyTaskCompletion(models.Model):
    """
    Tracks individual student completion of faculty-assigned tasks.
    One record per (task, student) pair.
    """
    task = models.ForeignKey(
        FacultyTask,
        on_delete=models.CASCADE,
        related_name='completions',
        help_text="The faculty task"
    )
    student = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='faculty_task_completions',
        help_text="The student who completed/has this task"
    )
    is_completed = models.BooleanField(
        default=False,
        help_text="Whether the student has completed this task"
    )
    completed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the student completed this task"
    )

    class Meta:
        verbose_name = 'Faculty Task Completion'
        verbose_name_plural = 'Faculty Task Completions'
        constraints = [
            models.UniqueConstraint(
                fields=['task', 'student'],
                name='unique_task_completion'
            )
        ]
        indexes = [
            models.Index(fields=['task', 'is_completed']),
            models.Index(fields=['student', 'is_completed']),
        ]

    def __str__(self):
        status = "✓" if self.is_completed else "○"
        return f"[{status}] {self.student.email} - {self.task.text[:30]}"


# ============================================
# Notification Model
# ============================================

class Notification(models.Model):
    """
    Persistent notification records so users can view notification history.
    Push notifications are sent separately via Expo — this stores the record.
    """
    NOTIFICATION_TYPE_CHOICES = [
        ('class_reminder', 'Class Reminder'),
        ('faculty_task', 'Faculty Task'),
        ('faculty_remark', 'Faculty Remark'),
        ('general', 'General'),
    ]

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='notifications',
        help_text="The user who receives this notification"
    )
    notification_type = models.CharField(
        max_length=20,
        choices=NOTIFICATION_TYPE_CHOICES,
        default='general',
        help_text="Type of notification"
    )
    title = models.CharField(
        max_length=255,
        help_text="Notification title"
    )
    message = models.TextField(
        help_text="Notification body text"
    )
    data = models.JSONField(
        null=True,
        blank=True,
        help_text="Extra data payload (e.g. subject_code, task_id)"
    )
    is_read = models.BooleanField(
        default=False,
        help_text="Whether the user has read this notification"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Notification'
        verbose_name_plural = 'Notifications'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'is_read']),
            models.Index(fields=['user', 'notification_type']),
            models.Index(fields=['user', '-created_at']),
        ]

    def __str__(self):
        read = "✓" if self.is_read else "○"
        return f"[{read}] {self.user.email}: {self.title}"


# ============================================
# Faculty Remark Model
# ============================================

class FacultyRemark(models.Model):
    """
    Remarks / comments left by faculty about a student's performance
    in a specific subject. Visible to the student AND their linked parent(s).
    """
    faculty = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='faculty_remarks',
        help_text="The faculty who wrote this remark"
    )
    student = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='student_remarks',
        help_text="The student this remark is about"
    )
    subject_code = models.CharField(
        max_length=50,
        help_text="Subject code for this remark"
    )
    text = models.TextField(
        help_text="The remark / comment text"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Faculty Remark'
        verbose_name_plural = 'Faculty Remarks'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['faculty', 'subject_code']),
            models.Index(fields=['student', 'subject_code']),
            models.Index(fields=['student', '-created_at']),
        ]

    def __str__(self):
        return f"{self.faculty.email} → {self.student.email} [{self.subject_code}]: {self.text[:50]}"


# ============================================
# Holiday Model (managed by admin dashboard)
# ============================================

class Holiday(models.Model):
    """
    Institution-wide holidays managed by admins via the admin dashboard.
    Recurring holidays repeat every year on the same month/day.
    One-time holidays apply only on the specific date.

    Multi-day ranges: set end_date to make a holiday span multiple consecutive
    days (e.g. Christmas Break Dec 25-Jan 1). When end_date is null the holiday
    is treated as a single-day event.
    """
    HOLIDAY_TYPE_CHOICES = [
        ('one_time', 'One-time'),
        ('recurring', 'Recurring'),
    ]

    name = models.CharField(
        max_length=200,
        help_text="Name/title of the holiday"
    )
    date = models.DateField(
        help_text="Start date of the holiday (for recurring: only month+day matter)"
    )
    end_date = models.DateField(
        null=True,
        blank=True,
        help_text=(
            "Optional end date for multi-day holidays (inclusive). "
            "Null means the holiday is a single day."
        )
    )
    holiday_type = models.CharField(
        max_length=10,
        choices=HOLIDAY_TYPE_CHOICES,
        default='one_time',
        help_text="Whether this holiday repeats annually"
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_holidays',
        help_text="Admin who created this holiday"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Holiday'
        verbose_name_plural = 'Holidays'
        ordering = ['date']
        indexes = [
            models.Index(fields=['date']),
            models.Index(fields=['end_date']),
            models.Index(fields=['holiday_type']),
        ]

    def __str__(self):
        label = "Recurring" if self.holiday_type == 'recurring' else "One-time"
        if self.end_date:
            return f"{self.name} ({self.date} \u2192 {self.end_date}) [{label}]"
        return f"{self.name} ({self.date}) [{label}]"


# ============================================
# Calendar Event Model (managed by admin dashboard)
# ============================================

class CalendarEvent(models.Model):
    """
    Institution-wide calendar events managed by admins via the admin dashboard.
    Events appear on every user's calendar (optionally filtered by user role).
    Recurring events repeat every year on the same month/day.
    """
    EVENT_TYPE_CHOICES = [
        ('one_time', 'One-time'),
        ('recurring', 'Recurring'),
    ]

    VISIBILITY_CHOICES = [
        ('all', 'All Users'),
        ('student', 'Students Only'),
        ('faculty', 'Faculty Only'),
    ]

    title = models.CharField(
        max_length=200,
        help_text="Title of the event"
    )
    description = models.TextField(
        blank=True,
        default='',
        help_text="Optional description or details"
    )
    date = models.DateField(
        help_text="Date of the event (for recurring: only month+day matter)"
    )
    end_date = models.DateField(
        null=True,
        blank=True,
        help_text=(
            "Optional end date for multi-day events (inclusive). "
            "Null means the event is a single day."
        ),
    )
    start_time = models.TimeField(
        null=True,
        blank=True,
        help_text="Optional start time (null = all-day event)"
    )
    end_time = models.TimeField(
        null=True,
        blank=True,
        help_text="Optional end time"
    )
    location = models.CharField(
        max_length=200,
        blank=True,
        default='',
        help_text="Optional venue / location"
    )
    event_type = models.CharField(
        max_length=10,
        choices=EVENT_TYPE_CHOICES,
        default='one_time',
        help_text="Whether this event repeats annually"
    )
    visibility = models.CharField(
        max_length=10,
        choices=VISIBILITY_CHOICES,
        default='all',
        help_text="Which user roles can see this event"
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_calendar_events',
        help_text="Admin who created this event"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Calendar Event'
        verbose_name_plural = 'Calendar Events'
        ordering = ['date', 'start_time']
        indexes = [
            models.Index(fields=['date']),
            models.Index(fields=['end_date']),
            models.Index(fields=['event_type']),
            models.Index(fields=['visibility']),
        ]

    def __str__(self):
        label = "Recurring" if self.event_type == 'recurring' else "One-time"
        vis = self.get_visibility_display()
        if self.end_date:
            return f"{self.title} ({self.date} → {self.end_date}) [{label}] [{vis}]"
        return f"{self.title} ({self.date}) [{label}] [{vis}]"


# ============================================
# Admin Audit Log Model
# ============================================

class AdminAuditLog(models.Model):
    """
    Records admin actions for accountability and auditing.
    Written automatically by admin views whenever a state-changing action occurs.
    """
    ACTION_CHOICES = [
        ('user_deactivated', 'User Deactivated'),
        ('user_reactivated', 'User Reactivated'),
        ('faculty_verified', 'Faculty Verified'),
        ('faculty_unverified', 'Faculty Unverified'),
        ('user_role_changed', 'User Role Changed'),
        ('user_profile_edited', 'User Profile Edited'),
        ('parent_link_created', 'Parent Link Created'),
        ('parent_link_revoked', 'Parent Link Revoked'),
        ('holiday_created', 'Holiday Created'),
        ('holiday_updated', 'Holiday Updated'),
        ('holiday_deleted', 'Holiday Deleted'),
        ('event_created', 'Calendar Event Created'),
        ('event_updated', 'Calendar Event Updated'),
        ('event_deleted', 'Calendar Event Deleted'),
        ('incident_updated', 'Incident Report Updated'),
        ('admin_login', 'Admin Login'),
    ]

    admin = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='audit_logs',
        help_text="The admin who performed the action"
    )
    action = models.CharField(
        max_length=30,
        choices=ACTION_CHOICES,
        help_text="The type of action performed"
    )
    target_type = models.CharField(
        max_length=50,
        blank=True,
        default='',
        help_text="The model type affected (e.g. 'User', 'Holiday')"
    )
    target_id = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Primary key of the affected object"
    )
    detail = models.TextField(
        blank=True,
        default='',
        help_text="Human-readable description of what changed"
    )
    ip_address = models.GenericIPAddressField(
        null=True,
        blank=True,
        help_text="IP address of the admin at time of action"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Admin Audit Log'
        verbose_name_plural = 'Admin Audit Logs'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['admin', '-created_at']),
            models.Index(fields=['action']),
        ]

    def __str__(self):
        admin_email = self.admin.email if self.admin else 'Unknown'
        return f"[{self.created_at:%Y-%m-%d %H:%M}] {admin_email}: {self.get_action_display()}"


# ============================================
# Extraction Health Monitoring Models
# ============================================

class ExtractionLog(models.Model):
    """
    Telemetry record for every COR upload attempt (success or failure).
    Used by the admin Extraction Health dashboard to track OCR performance,
    identify regressions, and debug problematic documents.
    """
    EXTRACTION_METHOD_CHOICES = [
        ('pdf_text', 'PDF Text Extraction'),
        ('ocr', 'OCR (Direct)'),
        ('ocr_fallback', 'OCR (Fallback)'),
        ('pdf_text_only', 'PDF Text Only (No OCR)'),
        ('none', 'None (Failed Before Extraction)'),
    ]
    FAILURE_CATEGORY_CHOICES = [
        ('none', 'None'),
        ('no_text', 'No Text'),
        ('parse_error', 'Parse Error'),
        ('low_confidence', 'Low Confidence'),
        ('metadata_mismatch', 'Metadata Mismatch'),
        ('system_error', 'System Error'),
    ]

    user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='extraction_logs',
        help_text="The user who uploaded the document",
    )
    file_name = models.CharField(
        max_length=255,
        help_text="Original filename of the uploaded document",
    )
    file_type = models.CharField(
        max_length=10,
        help_text="File extension, e.g. 'pdf', 'jpg', 'png'",
    )
    upload_type = models.CharField(
        max_length=10,
        choices=[('student', 'Student'), ('faculty', 'Faculty')],
        help_text="Whether this was a student or faculty COR upload",
    )
    extraction_method = models.CharField(
        max_length=20,
        choices=EXTRACTION_METHOD_CHOICES,
        default='none',
        help_text="Which extraction method produced the final result",
    )
    confidence = models.FloatField(
        default=0.0,
        help_text="Quality score of the extraction (0.0–1.0)",
    )
    courses_extracted = models.PositiveIntegerField(
        default=0,
        help_text="Number of courses successfully extracted",
    )
    success = models.BooleanField(
        default=False,
        help_text="Whether the extraction produced usable results",
    )
    error_message = models.TextField(
        blank=True,
        default='',
        help_text="Error details when extraction fails",
    )
    raw_text_preview = models.TextField(
        blank=True,
        default='',
        help_text="First ~2000 chars of extracted text (for debugging)",
    )
    failure_category = models.CharField(
        max_length=30,
        choices=FAILURE_CATEGORY_CHOICES,
        default='none',
        help_text="Structured reason why extraction failed or required retry",
    )
    validator_errors = models.JSONField(
        default=list,
        blank=True,
        help_text="Deterministic validation errors produced by extraction validators",
    )
    template_family = models.CharField(
        max_length=100,
        blank=True,
        default='',
        help_text="Template/profile hint for the uploaded document",
    )
    review_required = models.BooleanField(
        default=False,
        help_text="Whether extraction output should be reviewed before trusting",
    )
    llm_used = models.BooleanField(
        default=False,
        help_text="Whether optional LLM normalization was used",
    )
    llm_parse_success = models.BooleanField(
        default=False,
        help_text="Whether LLM output passed schema parsing",
    )
    score_breakdown = models.JSONField(
        default=dict,
        blank=True,
        help_text="Composite extraction score contribution per scoring component",
    )
    processing_time = models.FloatField(
        default=0.0,
        help_text="Total processing time in seconds",
    )
    attempts = models.JSONField(
        default=list,
        blank=True,
        help_text="Ordered list of extraction methods attempted",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Extraction Log'
        verbose_name_plural = 'Extraction Logs'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['-created_at']),
            models.Index(fields=['success']),
            models.Index(fields=['extraction_method']),
            models.Index(fields=['upload_type']),
            models.Index(fields=['failure_category'], name='api_exlog_fail_cat_idx'),
            models.Index(fields=['template_family'], name='api_exlog_tmpl_idx'),
            models.Index(fields=['review_required'], name='api_exlog_review_idx'),
        ]

    def __str__(self):
        status = "✓" if self.success else "✗"
        return (
            f"[{status}] {self.file_name} — {self.get_extraction_method_display()} "
            f"({self.confidence:.0%}) {self.created_at:%Y-%m-%d %H:%M}"
        )


class ExtractionRequest(models.Model):
    """
    Idempotency record for upload extraction requests.
    Stores a finalized API response so duplicate submissions can replay
    the exact response without writing duplicate courses.
    """

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('succeeded', 'Succeeded'),
        ('failed', 'Failed'),
    ]

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='extraction_requests',
        help_text="User associated with this upload request",
    )
    request_id = models.CharField(
        max_length=64,
        blank=True,
        default='',
        help_text="Stable request id supplied by client or generated server-side",
    )
    idempotency_key = models.CharField(
        max_length=128,
        help_text="Stable idempotency key to dedupe retries",
    )
    extraction_run_id = models.CharField(
        max_length=64,
        blank=True,
        default='',
        help_text="Unique extraction run id for telemetry correlation",
    )
    schema_version = models.CharField(
        max_length=20,
        default='v1',
        help_text="Extraction schema version used for this request",
    )
    upload_type = models.CharField(
        max_length=10,
        choices=[('student', 'Student'), ('faculty', 'Faculty')],
    )
    file_hash = models.CharField(
        max_length=64,
        blank=True,
        default='',
        help_text="SHA256 of uploaded file content",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending',
    )
    is_finalized = models.BooleanField(
        default=False,
        help_text="Whether the response for this key is finalized and replayable",
    )
    response_status = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
    )
    response_payload = models.JSONField(
        default=dict,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Extraction Request'
        verbose_name_plural = 'Extraction Requests'
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'idempotency_key'],
                name='unique_user_idempotency_key',
            )
        ]
        indexes = [
            models.Index(fields=['user', 'idempotency_key'], name='api_extract_user_id_541ef2_idx'),
            models.Index(fields=['status'], name='api_extract_status_9d6488_idx'),
            models.Index(fields=['-created_at'], name='api_extract_created_76f9c8_idx'),
        ]

    def __str__(self):
        return (
            f"[{self.status}] {self.user_id}:{self.idempotency_key[:12]}..."
        )


class IncidentReport(models.Model):
    """
    User-submitted problem reports from the mobile Scanner's "Submit Report" modal.
    Admins can triage these via the admin dashboard Incident Reports console.
    """
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('investigating', 'Under Investigation'),
        ('resolved', 'Resolved'),
    ]

    reporter = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='incident_reports',
        help_text="The user who submitted this report",
    )
    description = models.TextField(
        help_text="User-written description of the problem (max 500 chars enforced at view layer)",
    )
    upload_error = models.TextField(
        blank=True,
        default='',
        help_text="The system error message that was shown to the user",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending',
        help_text="Current triage status",
    )
    admin_notes = models.TextField(
        blank=True,
        default='',
        help_text="Internal notes written by admins during investigation",
    )
    resolved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='resolved_incidents',
        help_text="Admin who resolved this report",
    )
    resolved_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When this report was marked as resolved",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Incident Report'
        verbose_name_plural = 'Incident Reports'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['-created_at']),
            models.Index(fields=['reporter', '-created_at']),
        ]

    def __str__(self):
        reporter_email = self.reporter.email if self.reporter else 'Unknown'
        return f"[{self.get_status_display()}] {reporter_email}: {self.description[:60]}"


# ============================================
# Async Extraction Job Model
# ============================================

class ExtractionJob(models.Model):
    """
    Tracks the lifecycle of an async COR extraction job.

    When a user uploads a file the upload view immediately returns 202 Accepted
    with a job_id, then launches a background thread that runs the full LLM →
    regex → validate → save pipeline. The frontend polls
    GET /api/extraction-jobs/{job_id}/ until the job reaches a terminal state.

    States:
        pending     — job row created, background thread not yet started
        processing  — background thread running (LLM / regex in flight)
        done        — extraction succeeded, courses saved
        failed      — extraction rejected (low confidence, parse error, etc.)

    On transition to done/failed a push notification is sent to the user.
    """

    STATUS_CHOICES = [
        ('pending',    'Pending'),
        ('processing', 'Processing'),
        ('done',       'Done'),
        ('failed',     'Failed'),
    ]

    UPLOAD_TYPE_CHOICES = [
        ('student', 'Student'),
        ('faculty', 'Faculty'),
    ]

    EXTRACTION_METHOD_CHOICES = [
        ('llm',           'LLM Full Parser'),
        ('llm_normalization', 'LLM Normalization (Stage A)'),
        ('regex_fallback', 'Regex Fallback'),
        ('none',          'None'),
    ]

    FAILURE_CATEGORY_CHOICES = [
        ('low_confidence',     'Low Confidence'),
        ('parse_error',        'Parse Error'),
        ('no_text',            'No Text Extracted'),
        ('metadata_mismatch',  'Metadata Mismatch'),
        ('system_error',       'System Error'),
        ('none',               'None'),
    ]

    # ── Identity ──────────────────────────────────────────────────────
    job_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        help_text="Public job identifier returned to the frontend on upload",
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='extraction_jobs',
        help_text="The user who initiated this upload",
    )

    # ── Input metadata ────────────────────────────────────────────────
    upload_type = models.CharField(
        max_length=10,
        choices=UPLOAD_TYPE_CHOICES,
        help_text="Whether this is a student or faculty COR upload",
    )
    file_name = models.CharField(
        max_length=255,
        blank=True,
        default='',
        help_text="Original filename of the uploaded document (for display)",
    )

    # ── Lifecycle ─────────────────────────────────────────────────────
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending',
        help_text="Current state of the async extraction job",
    )

    # ── Extraction result ─────────────────────────────────────────────
    extraction_method = models.CharField(
        max_length=20,
        choices=EXTRACTION_METHOD_CHOICES,
        default='none',
        blank=True,
        help_text="Which parser produced the accepted result (llm / regex_fallback)",
    )
    courses = models.JSONField(
        null=True,
        blank=True,
        help_text=(
            "Extracted courses as a JSON list. "
            "Each item mirrors the Course model fields. "
            "Null while job is pending/processing."
        ),
    )
    student_number = models.CharField(
        max_length=20,
        blank=True,
        default='',
        help_text="Student number extracted from the document (student COR only)",
    )
    semester = models.CharField(
        max_length=20,
        blank=True,
        default='',
        help_text="Semester extracted from the document (e.g. '1ST', '2ND')",
    )
    school_year = models.CharField(
        max_length=20,
        blank=True,
        default='',
        help_text="School year extracted from the document (e.g. '2025-2026')",
    )
    confidence = models.FloatField(
        null=True,
        blank=True,
        help_text="Composite confidence score (0.0–1.0) of the accepted extraction",
    )

    # ── Failure details ───────────────────────────────────────────────
    failure_category = models.CharField(
        max_length=30,
        choices=FAILURE_CATEGORY_CHOICES,
        default='none',
        blank=True,
        help_text="Structured reason the job failed (populated on status='failed')",
    )
    error_message = models.TextField(
        blank=True,
        default='',
        help_text="Internal error details (not shown to user, used for debugging)",
    )

    _temp_file_path = models.TextField(
        blank=True,
        default='',
        help_text=(
            "Absolute path to the temp file the background thread should process. "
            "Cleared and file deleted after job reaches a terminal state."
        ),
    )

    # ── Timestamps ────────────────────────────────────────────────────
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


    class Meta:
        verbose_name = 'Extraction Job'
        verbose_name_plural = 'Extraction Jobs'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'status'], name='api_extjob_user_status_idx'),
            models.Index(fields=['status', '-created_at'], name='api_extjob_status_created_idx'),
            models.Index(fields=['-created_at'], name='api_extjob_created_idx'),
        ]

    def __str__(self):
        return (
            f"[{self.get_status_display()}] "
            f"{self.user_id} / {self.upload_type} — "
            f"{str(self.job_id)[:8]}..."
        )

    @property
    def is_terminal(self) -> bool:
        """Return True if the job has reached a terminal state (done or failed)."""
        return self.status in ('done', 'failed')
