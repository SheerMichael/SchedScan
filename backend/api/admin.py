from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.translation import gettext_lazy as _
from .models import User, ClassCode, ClassEnrollment, FacultyTask, FacultyTaskFile, FacultyTaskCompletion


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """
    Custom User admin configuration
    """
    list_display = ['email', 'first_name', 'last_name', 'is_staff', 'is_active', 'created_at']
    list_filter = ['is_staff', 'is_active', 'created_at']
    search_fields = ['email', 'first_name', 'last_name']
    ordering = ['-created_at']
    
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        (_('Personal info'), {'fields': ('first_name', 'last_name', 'profile_picture')}),
        (_('Permissions'), {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        (_('Important dates'), {'fields': ('last_login', 'created_at', 'updated_at')}),
    )
    
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'first_name', 'last_name', 'password1', 'password2'),
        }),
    )
    
    readonly_fields = ['created_at', 'updated_at', 'last_login']


@admin.register(ClassCode)
class ClassCodeAdmin(admin.ModelAdmin):
    list_display = ['code', 'faculty', 'subject_code', 'is_active', 'created_at']
    list_filter = ['is_active', 'created_at']
    search_fields = ['code', 'faculty__email', 'subject_code']


@admin.register(ClassEnrollment)
class ClassEnrollmentAdmin(admin.ModelAdmin):
    list_display = ['student', 'faculty', 'subject_code', 'enrollment_type', 'status', 'enrolled_at']
    list_filter = ['status', 'enrollment_type', 'enrolled_at']
    search_fields = ['student__email', 'faculty__email', 'subject_code']


@admin.register(FacultyTask)
class FacultyTaskAdmin(admin.ModelAdmin):
    list_display = ['text', 'faculty', 'subject_code', 'due_date', 'created_at']
    list_filter = ['created_at', 'due_date']
    search_fields = ['text', 'faculty__email', 'subject_code']


@admin.register(FacultyTaskFile)
class FacultyTaskFileAdmin(admin.ModelAdmin):
    list_display = ['file_name', 'task', 'file_size', 'uploaded_at']
    list_filter = ['uploaded_at']
    search_fields = ['file_name', 'task__text', 'task__faculty__email']
    readonly_fields = ['uploaded_at']


@admin.register(FacultyTaskCompletion)
class FacultyTaskCompletionAdmin(admin.ModelAdmin):
    list_display = ['task', 'student', 'is_completed', 'completed_at']
    list_filter = ['is_completed', 'completed_at']
    search_fields = ['student__email', 'task__text']

