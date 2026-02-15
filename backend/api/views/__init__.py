"""
Views package for the SchedScan API.

Re-exports all views so that `from . import views` + `views.RegisterView`
continues to work in urls.py without any changes.
"""

# Auth views
from .auth_views import (
    index,
    RegisterView,
    LoginView,
    LogoutView,
    UserProfileView,
)

# Upload / Course views
from .upload_views import (
    BaseCORUploadView,
    UploadStudentCORView,
    UploadFacultyCORView,
    UserCoursesView,
    DeleteAllCoursesView,
)

# Schedule views
from .schedule_views import (
    ScheduleListCreateView,
    ScheduleDetailView,
    ScheduleSetActiveView,
    ScheduleActiveView,
    ScheduleClearActiveView,
    ScheduleTimetableDownloadView,
    MergeSchedulesView,
)

# Task views
from .task_views import (
    TaskListCreateView,
    TaskDetailView,
    TaskCountsView,
)

# Account management views
from .account_views import (
    ChangePasswordView,
    DeleteAccountView,
)

# Password reset views
from .password_reset_views import (
    PasswordResetRequestView,
    PasswordResetVerifyView,
    PasswordResetConfirmView,
)

# Parent / push notification views
from .parent_views import (
    RegisterPushTokenView,
    GenerateInviteCodeView,
    ValidateInviteCodeView,
    UseInviteCodeView,
    ChildScheduleView,
    LinkedParentsView,
    RevokeParentAccessView,
    ChildLinkView,
)

# Faculty-Student Connection views
from .faculty_task_views import (
    ClassCodeView,
    StudentEnrollView,
    StudentEnrollmentListView,
    StudentUnenrollView,
    FacultyEnrolledStudentsView,
    FacultyRemoveStudentView,
    FacultyTaskListCreateView,
    FacultyTaskDetailView,
    FacultyTaskStatsView,
    StudentFacultyTaskListView,
    StudentFacultyTaskCompleteView,
    StudentFacultyTaskCountsView,
)
