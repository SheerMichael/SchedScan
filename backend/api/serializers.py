from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework.validators import UniqueValidator
from rest_framework_simplejwt.tokens import RefreshToken
from .models import Course, Schedule, Task, ParentChildLink, InviteCode, ClassCode, ClassEnrollment, FacultyTask, FacultyTaskFile, FacultyTaskCompletion
from .utils.timetable_generator import generate_and_save_timetable

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """
    Serializer for User model - used for retrieving user data
    """
    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'user_type', 'profile_picture', 'created_at']
        read_only_fields = ['id', 'created_at']


class RegisterSerializer(serializers.ModelSerializer):
    """
    Serializer for user registration
    """
    email = serializers.EmailField(
        required=True,
        validators=[UniqueValidator(queryset=User.objects.all(), message="A user with this email already exists.")]
    )
    password = serializers.CharField(
        write_only=True,
        required=True,
        validators=[validate_password],
        style={'input_type': 'password'}
    )
    password2 = serializers.CharField(
        write_only=True,
        required=False,
        style={'input_type': 'password'},
        help_text="Confirm password (optional in API, validated in frontend)"
    )
    first_name = serializers.CharField(required=True, max_length=150)
    last_name = serializers.CharField(required=True, max_length=150)
    user_type = serializers.ChoiceField(
        choices=['student', 'faculty', 'parent'],
        default='student',
        required=False,
        help_text="Type of user account"
    )
    profile_picture = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = User
        fields = ['email', 'password', 'password2', 'first_name', 'last_name', 'user_type', 'profile_picture']

    def validate(self, attrs):
        """
        Validate that password and password2 match if password2 is provided
        """
        if 'password2' in attrs and attrs.get('password') != attrs.get('password2'):
            raise serializers.ValidationError({"password": "Password fields didn't match."})
        return attrs

    def create(self, validated_data):
        """
        Create and return a new user with encrypted password
        """
        # Remove password2 from validated_data as it's not a model field
        validated_data.pop('password2', None)
        
        # Extract password
        password = validated_data.pop('password')
        
        # Create user instance
        user = User.objects.create_user(
            password=password,
            **validated_data
        )
        
        return user


class LoginSerializer(serializers.Serializer):
    """
    Serializer for user login
    """
    email = serializers.EmailField(required=True)
    password = serializers.CharField(
        required=True,
        write_only=True,
        style={'input_type': 'password'}
    )

    def validate(self, attrs):
        """
        Validate email and password
        """
        email = attrs.get('email')
        password = attrs.get('password')

        if email and password:
            # Check if user exists
            try:
                user = User.objects.get(email=email)
            except User.DoesNotExist:
                raise serializers.ValidationError("Invalid email or password.")

            # Check if password is correct
            if not user.check_password(password):
                raise serializers.ValidationError("Invalid email or password.")

            # Check if user is active
            if not user.is_active:
                raise serializers.ValidationError("User account is disabled.")

            attrs['user'] = user
            return attrs
        else:
            raise serializers.ValidationError("Must include 'email' and 'password'.")


class UserWithTokenSerializer(serializers.ModelSerializer):
    """
    Serializer that includes user data and JWT tokens
    """
    tokens = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'profile_picture', 'tokens']

    def get_tokens(self, user):
        """
        Generate and return JWT tokens for the user
        """
        refresh = RefreshToken.for_user(user)
        return {
            'refresh': str(refresh),
            'access': str(refresh.access_token),
        }


class CourseSerializer(serializers.ModelSerializer):
    """
    Serializer for Course model - used for displaying course schedules
    """
    class Meta:
        model = Course
        fields = [
            'id', 
            'subject_code', 
            'subject_name', 
            'start_time', 
            'end_time', 
            'day', 
            'location',
            'source_type',
            'created_at',
            'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class WritableCourseSerializer(serializers.ModelSerializer):
    """
    Serializer for Course model - used for creating/updating courses within schedules
    """
    # Override fields to handle null values from frontend
    subject_name = serializers.CharField(required=False, allow_blank=True, allow_null=True, default='')
    day = serializers.CharField(required=False, allow_blank=True, allow_null=True, default='')
    location = serializers.CharField(required=False, allow_blank=True, allow_null=True, default='')
    source_type = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)
    
    class Meta:
        model = Course
        fields = [
            'id', 
            'subject_code', 
            'subject_name', 
            'start_time', 
            'end_time', 
            'day', 
            'location',
            'source_type',
        ]
        read_only_fields = ['id']
        extra_kwargs = {
            'subject_code': {'required': True},
            'start_time': {'required': True},
            'end_time': {'required': True},
        }
    
    def to_internal_value(self, data):
        """Convert null values to empty strings before validation"""
        if data.get('subject_name') is None:
            data['subject_name'] = ''
        if data.get('day') is None:
            data['day'] = ''
        if data.get('location') is None:
            data['location'] = ''
        return super().to_internal_value(data)


class ScheduleSerializer(serializers.ModelSerializer):
    """
    Serializer for Schedule model with nested courses.
    Supports creating schedules with courses in a single request.
    """
    courses = WritableCourseSerializer(many=True, required=False)
    timetable_image = serializers.ImageField(read_only=True)
    
    class Meta:
        model = Schedule
        fields = [
            'id',
            'title',
            'upload_type',
            'is_active',
            'courses',
            'timetable_image',
            'created_at',
            'updated_at'
        ]
        read_only_fields = ['id', 'timetable_image', 'created_at', 'updated_at']
    
    def create(self, validated_data):
        """
        Create a schedule with nested courses and generate timetable image.
        """
        courses_data = validated_data.pop('courses', [])
        user = self.context['request'].user
        
        # If this schedule is set as active, deactivate others first
        if validated_data.get('is_active', False):
            Schedule.objects.filter(user=user, is_active=True).update(is_active=False)
        
        schedule = Schedule.objects.create(user=user, **validated_data)
        
        # Create courses linked to this schedule
        for course_data in courses_data:
            Course.objects.create(
                user=user,
                schedule=schedule,
                **course_data
            )
        
        # Generate timetable image
        self._generate_timetable(schedule, courses_data, user)
        
        return schedule
    
    def _generate_timetable(self, schedule, courses_data, user):
        """
        Generate and save timetable image for the schedule.
        """
        import logging
        logger = logging.getLogger(__name__)
        
        try:
            # Convert courses_data to list of dicts if needed
            if not courses_data:
                # If no courses_data passed, get from schedule
                courses_data = list(schedule.courses.values(
                    'subject_code', 'subject_name', 'start_time', 
                    'end_time', 'day', 'location'
                ))
            
            # Generate and save the timetable image
            image_path = generate_and_save_timetable(
                schedule_id=schedule.id,
                courses=courses_data,
                title=schedule.title,
                upload_type=schedule.upload_type,
                user_id=user.id,
                user_name=user.get_full_name()
            )
            
            # Update schedule with image path
            schedule.timetable_image = image_path
            schedule.save(update_fields=['timetable_image'])
            
            logger.info(f"Generated timetable for schedule {schedule.id}: {image_path}")
        except Exception as e:
            logger.error(f"Failed to generate timetable for schedule {schedule.id}: {str(e)}")
    
    def update(self, instance, validated_data):
        """
        Update a schedule and optionally its courses.
        Regenerates timetable image when courses are updated.
        """
        import logging
        logger = logging.getLogger(__name__)
        
        courses_data = validated_data.pop('courses', None)
        user = instance.user
        
        logger.info(f"ScheduleSerializer.update: instance.id={instance.id}")
        logger.info(f"ScheduleSerializer.update: courses_data count = {len(courses_data) if courses_data else 'None'}")
        if courses_data:
            logger.info(f"ScheduleSerializer.update: first course = {courses_data[0] if courses_data else 'N/A'}")
        
        # Update schedule fields
        instance.title = validated_data.get('title', instance.title)
        instance.upload_type = validated_data.get('upload_type', instance.upload_type)
        
        # Handle is_active - deactivate others if setting this one active
        if validated_data.get('is_active', False) and not instance.is_active:
            Schedule.objects.filter(user=user, is_active=True).update(is_active=False)
        instance.is_active = validated_data.get('is_active', instance.is_active)
        
        instance.save()
        
        # If courses are provided, replace all existing courses
        if courses_data is not None:
            old_count = instance.courses.count()
            logger.info(f"ScheduleSerializer.update: Deleting {old_count} old courses, creating {len(courses_data)} new ones")
            
            # Delete existing courses
            instance.courses.all().delete()
            # Create new courses
            created_count = 0
            for course_data in courses_data:
                Course.objects.create(
                    user=user,
                    schedule=instance,
                    **course_data
                )
                created_count += 1
            
            logger.info(f"ScheduleSerializer.update: Created {created_count} courses")
            
            # Regenerate timetable image
            self._generate_timetable(instance, courses_data, user)
        
        return instance


class ScheduleListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for listing schedules without full course details.
    """
    course_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Schedule
        fields = [
            'id',
            'title',
            'upload_type',
            'is_active',
            'course_count',
            'created_at',
            'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_course_count(self, obj):
        return obj.courses.count()


class TaskSerializer(serializers.ModelSerializer):
    """
    Serializer for Task model - used for managing tasks per subject code.
    Tasks are shared across schedules for the same subject code.
    """
    class Meta:
        model = Task
        fields = [
            'id',
            'subject_code',
            'text',
            'is_completed',
            'created_at',
            'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def create(self, validated_data):
        """
        Create a task associated with the current user.
        """
        user = self.context['request'].user
        return Task.objects.create(user=user, **validated_data)


class PushTokenSerializer(serializers.Serializer):
    """
    Serializer for registering Expo push notification tokens.
    """
    expo_push_token = serializers.CharField(
        max_length=100,
        required=True,
        help_text="Expo push notification token (e.g., ExponentPushToken[xxxxxx])"
    )

    def validate_expo_push_token(self, value):
        """
        Validate that the token looks like an Expo push token.
        """
        if not value.startswith('ExponentPushToken[') and not value.startswith('ExpoPushToken['):
            raise serializers.ValidationError(
                "Invalid Expo push token format. Token should start with 'ExponentPushToken[' or 'ExpoPushToken['"
            )
        return value


# ============================================
# Parental View Serializers
# ============================================

class InviteCodeSerializer(serializers.ModelSerializer):
    """
    Serializer for InviteCode - used for generating and viewing invite codes
    """
    class Meta:
        model = InviteCode
        fields = ['id', 'code', 'created_at', 'is_active', 'used']
        read_only_fields = ['id', 'code', 'created_at', 'is_active', 'used']


class ParentChildLinkSerializer(serializers.ModelSerializer):
    """
    Serializer for ParentChildLink - used for viewing linked accounts
    """
    parent_name = serializers.SerializerMethodField()
    parent_email = serializers.SerializerMethodField()
    child_name = serializers.SerializerMethodField()
    child_email = serializers.SerializerMethodField()
    
    class Meta:
        model = ParentChildLink
        fields = ['id', 'status', 'linked_at', 'parent_name', 'parent_email', 'child_name', 'child_email']
        read_only_fields = ['id', 'linked_at']
    
    def get_parent_name(self, obj):
        return obj.parent.get_full_name()
    
    def get_parent_email(self, obj):
        return obj.parent.email
    
    def get_child_name(self, obj):
        return obj.child.get_full_name()
    
    def get_child_email(self, obj):
        return obj.child.email


class ChildInfoSerializer(serializers.ModelSerializer):
    """
    Serializer for basic child (student) information - for parent's view
    """
    full_name = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'full_name', 'profile_picture']
        read_only_fields = ['id', 'email', 'first_name', 'last_name', 'full_name', 'profile_picture']
    
    def get_full_name(self, obj):
        return obj.get_full_name()


class ChildScheduleSerializer(serializers.Serializer):
    """
    Serializer for viewing child's active schedule - read only for parents
    """
    child = ChildInfoSerializer(read_only=True)
    schedule = ScheduleSerializer(read_only=True, allow_null=True)
    has_active_schedule = serializers.BooleanField(read_only=True)


# ============================================
# Password Reset Serializers
# ============================================

class PasswordResetRequestSerializer(serializers.Serializer):
    """
    Serializer for requesting a password reset code.
    """
    email = serializers.EmailField(required=True)

    def validate_email(self, value):
        """Validate that a user with this email exists."""
        try:
            User.objects.get(email=value)
        except User.DoesNotExist:
            # Don't reveal whether email exists for security
            pass
        return value


class PasswordResetVerifySerializer(serializers.Serializer):
    """
    Serializer for verifying a password reset code.
    """
    email = serializers.EmailField(required=True)
    code = serializers.CharField(required=True, max_length=6, min_length=6)


class PasswordResetConfirmSerializer(serializers.Serializer):
    """
    Serializer for confirming password reset with the reset token.
    """
    reset_token = serializers.UUIDField(required=True)
    new_password = serializers.CharField(
        required=True,
        write_only=True,
        style={'input_type': 'password'}
    )

    def validate_new_password(self, value):
        """Validate the new password meets Django's password requirements."""
        validate_password(value)
        return value


# ============================================
# Faculty-Student Connection Serializers
# ============================================

class ClassCodeSerializer(serializers.ModelSerializer):
    """
    Serializer for ClassCode - used for generating and viewing class codes.
    """
    faculty_name = serializers.SerializerMethodField()

    class Meta:
        model = ClassCode
        fields = ['id', 'subject_code', 'code', 'is_active', 'faculty_name', 'created_at']
        read_only_fields = ['id', 'code', 'is_active', 'faculty_name', 'created_at']

    def get_faculty_name(self, obj):
        return obj.faculty.get_full_name()


class ClassEnrollmentSerializer(serializers.ModelSerializer):
    """
    Serializer for ClassEnrollment - shows enrollment info.
    """
    faculty_name = serializers.SerializerMethodField()
    faculty_email = serializers.SerializerMethodField()
    student_name = serializers.SerializerMethodField()
    student_email = serializers.SerializerMethodField()

    class Meta:
        model = ClassEnrollment
        fields = [
            'id', 'subject_code', 'enrollment_type', 'status', 'enrolled_at',
            'faculty_name', 'faculty_email', 'student_name', 'student_email'
        ]
        read_only_fields = ['id', 'enrolled_at']

    def get_faculty_name(self, obj):
        return obj.faculty.get_full_name()

    def get_faculty_email(self, obj):
        return obj.faculty.email

    def get_student_name(self, obj):
        return obj.student.get_full_name()

    def get_student_email(self, obj):
        return obj.student.email


class FacultyTaskFileSerializer(serializers.ModelSerializer):
    """
    Read-only serializer for FacultyTaskFile — exposes file metadata.
    """
    class Meta:
        model = FacultyTaskFile
        fields = ['id', 'file_name', 'file_size', 'uploaded_at']
        read_only_fields = fields


class FacultyTaskSerializer(serializers.ModelSerializer):
    """
    Serializer for FacultyTask - used by faculty to create/manage tasks.
    Supports multiple file uploads via multipart/form-data.
    Files are sent as 'files' (multiple) or legacy 'file' (single).
    """
    # Write-only: accept files from the request
    file = serializers.FileField(required=False, allow_null=True, write_only=True)

    class Meta:
        model = FacultyTask
        fields = ['id', 'subject_code', 'text', 'due_date', 'file', 'file_name', 'created_at', 'updated_at']
        read_only_fields = ['id', 'file_name', 'created_at', 'updated_at']

    def create(self, validated_data):
        faculty = self.context['request'].user
        # Remove the single 'file' from validated_data — files are handled in the view
        validated_data.pop('file', None)
        return FacultyTask.objects.create(faculty=faculty, **validated_data)


class FacultyTaskWithStatsSerializer(serializers.ModelSerializer):
    """
    Faculty-side view of a task with completion statistics.
    Shows how many students completed vs total enrolled for this subject.
    Uses prefetched completions when available to avoid N+1.
    """
    completed_count = serializers.SerializerMethodField()
    total_enrolled = serializers.SerializerMethodField()
    has_file = serializers.SerializerMethodField()
    files = serializers.SerializerMethodField()

    class Meta:
        model = FacultyTask
        fields = [
            'id', 'subject_code', 'text', 'due_date',
            'completed_count', 'total_enrolled',
            'file_name', 'has_file', 'files',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_has_file(self, obj):
        # Check new multi-file relation first, then legacy field
        if hasattr(obj, '_prefetched_objects_cache') and 'files' in obj._prefetched_objects_cache:
            return len(obj.files.all()) > 0
        if obj.files.exists():
            return True
        return bool(obj.file)

    def get_files(self, obj):
        """Return list of file metadata. Includes legacy single-file for backward compat."""
        task_files = list(obj.files.all()) if hasattr(obj, '_prefetched_objects_cache') and 'files' in obj._prefetched_objects_cache else list(obj.files.all())
        if task_files:
            return FacultyTaskFileSerializer(task_files, many=True).data
        # Backward compat: if the task has a legacy single file, expose it
        if obj.file:
            return [{'id': None, 'file_name': obj.file_name or 'Attachment', 'file_size': None, 'uploaded_at': str(obj.created_at)}]
        return []

    def get_completed_count(self, obj):
        # Use prefetched completions if available
        if hasattr(obj, '_prefetched_objects_cache') and 'completions' in obj._prefetched_objects_cache:
            return sum(1 for c in obj.completions.all() if c.is_completed)
        return obj.completions.filter(is_completed=True).count()

    def get_total_enrolled(self, obj):
        # Cache enrollment counts per subject to avoid repeated queries
        request = self.context.get('request')
        if request and hasattr(request, '_enrollment_count_cache'):
            cache = request._enrollment_count_cache
        else:
            cache = {}
            if request:
                request._enrollment_count_cache = cache

        cache_key = f"{obj.faculty_id}:{obj.subject_code}"
        if cache_key not in cache:
            cache[cache_key] = ClassEnrollment.objects.filter(
                faculty=obj.faculty,
                subject_code=obj.subject_code,
                status='active'
            ).count()
        return cache[cache_key]


class FacultyTaskStudentSerializer(serializers.ModelSerializer):
    """
    Student-side view of a faculty task with their personal completion status.
    Uses prefetched 'student_completions' (via Prefetch with to_attr) to avoid N+1.
    Falls back to query if not prefetched.
    """
    is_completed = serializers.SerializerMethodField()
    completed_at = serializers.SerializerMethodField()
    faculty_name = serializers.SerializerMethodField()
    has_file = serializers.SerializerMethodField()
    files = serializers.SerializerMethodField()

    class Meta:
        model = FacultyTask
        fields = [
            'id', 'subject_code', 'text', 'due_date',
            'is_completed', 'completed_at', 'faculty_name',
            'file_name', 'has_file', 'files',
            'created_at', 'updated_at'
        ]
        read_only_fields = fields

    def get_has_file(self, obj):
        if hasattr(obj, '_prefetched_objects_cache') and 'files' in obj._prefetched_objects_cache:
            return len(obj.files.all()) > 0
        if obj.files.exists():
            return True
        return bool(obj.file)

    def get_files(self, obj):
        task_files = list(obj.files.all()) if hasattr(obj, '_prefetched_objects_cache') and 'files' in obj._prefetched_objects_cache else list(obj.files.all())
        if task_files:
            return FacultyTaskFileSerializer(task_files, many=True).data
        if obj.file:
            return [{'id': None, 'file_name': obj.file_name or 'Attachment', 'file_size': None, 'uploaded_at': str(obj.created_at)}]
        return []

    def _get_completion(self, obj):
        """Get the student's completion record, using prefetch if available."""
        if hasattr(obj, 'student_completions'):
            # Prefetched via Prefetch(..., to_attr='student_completions')
            completions = obj.student_completions
            return completions[0] if completions else None
        # Fallback: query directly
        student = self.context['request'].user
        return obj.completions.filter(student=student).first()

    def get_is_completed(self, obj):
        completion = self._get_completion(obj)
        return completion.is_completed if completion else False

    def get_completed_at(self, obj):
        completion = self._get_completion(obj)
        return completion.completed_at if completion else None

    def get_faculty_name(self, obj):
        return obj.faculty.get_full_name()

