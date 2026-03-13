from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.translation import gettext_lazy as _
from .models import (
    User, ClassCode, ClassEnrollment,
    FacultyTask, FacultyTaskFile, FacultyTaskCompletion, FacultyRemark,
    Holiday, AdminAuditLog,
)


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """
    Custom User admin configuration
    """
    list_display = ['email', 'first_name', 'last_name', 'user_type', 'is_verified', 'is_staff', 'is_active', 'created_at']
    list_filter = ['user_type', 'is_verified', 'is_staff', 'is_active', 'created_at']
    search_fields = ['email', 'first_name', 'last_name', 'student_number']
    ordering = ['-created_at']
    
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        (_('Personal info'), {'fields': ('first_name', 'last_name', 'user_type', 'student_number', 'profile_picture')}),
        (_('Verification'), {'fields': ('is_verified',)}),
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


@admin.register(FacultyRemark)
class FacultyRemarkAdmin(admin.ModelAdmin):
    list_display = ['faculty', 'student', 'subject_code', 'short_text', 'created_at']
    list_filter = ['subject_code', 'created_at']
    search_fields = ['faculty__email', 'student__email', 'subject_code', 'text']
    readonly_fields = ['created_at', 'updated_at']
    raw_id_fields = ['faculty', 'student']

    def short_text(self, obj):
        return obj.text[:80] + ('...' if len(obj.text) > 80 else '')
    short_text.short_description = 'Text'


@admin.register(FacultyTaskCompletion)
class FacultyTaskCompletionAdmin(admin.ModelAdmin):
    list_display = ['task', 'student', 'is_completed', 'completed_at']
    list_filter = ['is_completed', 'completed_at']
    search_fields = ['student__email', 'task__text']


@admin.register(Holiday)
class HolidayAdmin(admin.ModelAdmin):
    list_display = ['name', 'date', 'holiday_type', 'created_by', 'created_at']
    list_filter = ['holiday_type', 'date']
    search_fields = ['name']
    readonly_fields = ['created_at', 'updated_at']
    raw_id_fields = ['created_by']


@admin.register(AdminAuditLog)
class AdminAuditLogAdmin(admin.ModelAdmin):
    list_display = ['admin', 'action', 'target_type', 'target_id', 'ip_address', 'created_at']
    list_filter = ['action', 'created_at']
    search_fields = ['admin__email', 'detail']
    readonly_fields = ['admin', 'action', 'target_type', 'target_id', 'detail', 'ip_address', 'created_at']

    def has_add_permission(self, request):
        return False  # Audit logs are system-generated; forbid manual creation

    def has_change_permission(self, request, obj=None):
        return False  # Immutable records

