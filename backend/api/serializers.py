from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework.validators import UniqueValidator
from rest_framework_simplejwt.tokens import RefreshToken
from .models import Course, Schedule, Task
from .utils.timetable_generator import generate_and_save_timetable

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """
    Serializer for User model - used for retrieving user data
    """
    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'profile_picture', 'created_at']
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
    profile_picture = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = User
        fields = ['email', 'password', 'password2', 'first_name', 'last_name', 'profile_picture']

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
