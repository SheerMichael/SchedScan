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
