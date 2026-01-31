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
    username = None  # Remove username field
    email = models.EmailField(unique=True, max_length=255)
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
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
