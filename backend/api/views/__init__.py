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
    SetStudentNumberView,
)

# Upload / Course views
from .upload_views import (
    BaseCORUploadView,
    UploadStudentCORView,
    UploadFacultyCORView,
    UserCoursesView,
    DeleteAllCoursesView,
    SubmitIncidentReportView,
)

# Extraction job polling view
from .job_views import (
    ExtractionJobStatusView,
    ExtractionJobRecentView,
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
    TaskUrgentPopupView,
    TaskUrgentActionView,
    TaskUrgencyAnalyticsView,
)

# Note views
from .note_views import (
    NoteListCreateView,
    NoteDetailView,
    FacultyPublishedNoteListView,
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
    ParentChildSearchView,
    ParentLinkRequestView,
    ParentLinkRequestHistoryClearView,
    ParentLinkRequestHistoryDetailView,
    ParentLinkRequestCancelView,
    StudentParentLinkRequestListView,
    StudentParentLinkRequestApproveView,
    StudentParentLinkRequestRejectView,
    ChildScheduleView,
    LinkedParentsView,
    RevokeParentAccessView,
    ChildLinkView,
)

# Notification views
from .notification_views import (
    NotificationListView,
    NotificationMarkReadView,
    NotificationMarkAllReadView,
    NotificationUnreadCountView,
)

# Faculty-Student Connection views
from .faculty_task_views import (
    ClassCodeView,
    FacultyModeActivateView,
    FacultyModeCheckView,
    ClassCodePreviewView,
    StudentEnrollView,
    StudentEnrollSyncView,
    StudentEnrollmentListView,
    StudentUnenrollView,
    FacultyEnrolledStudentsView,
    FacultyRemoveStudentView,
    FacultyTaskListCreateView,
    FacultyTaskDetailView,
    FacultyTaskStatsView,
    FacultyTaskFileDownloadView,
    StudentFacultyTaskListView,
    StudentFacultyTaskCompleteView,
    StudentFacultyTaskCountsView,
)

# Faculty Remark views
from .remark_views import (
    FacultyRemarkListCreateView,
    FacultyRemarkDetailView,
    StudentRemarkListView,
    ParentRemarkListView,
)

# Payment views
from .payment_views import (
    CanAddChildView,
    CreateCheckoutSessionView,
    CheckPaymentStatusView,
    PaymentSuccessView,
    PaymentCancelledView,
    StripeWebhookView,
)

# Public holiday views
from .holiday_views import (
    HolidayListView,
)

# Calendar event views (public + admin)
from .calendar_event_views import (
    CalendarEventListView,
    AdminCalendarEventListCreateView,
    AdminCalendarEventDetailView,
)

# Admin dashboard views
from .admin_views import (
    AdminLoginView,
    AdminUserListView,
    AdminUserDetailView,
    AdminUserActivityView,
    AdminParentLinkListView,
    AdminParentLinkActionView,
    AdminAnalyticsView,
    AdminAnalyticsChartView,
    AdminHolidayListCreateView,
    AdminHolidayDetailView,
    AdminAuditLogView,
    AdminExtractionAnalyticsView,
    AdminExtractionChartView,
    AdminFailedExtractionListView,
    AdminExtractionJobListView,
    AdminIncidentReportListView,
    AdminIncidentReportDetailView,
    # Faculty verification — notification-driven workflow
    AdminPendingVerificationsView,
    AdminPendingVerificationApproveView,
    AdminPendingVerificationRejectView,
)

# Pending enrollment consent views (student-facing faculty match flow)
from .pending_enrollment_views import (
    PendingEnrollmentListView,
    PendingEnrollmentAcceptView,
    PendingEnrollmentDeclineView,
    PendingEnrollmentBulkAcceptView,
)

# Classmate discovery views
from .classmate_views import (
    StudentClassmateListView,
    FacultyClassRosterView,
)
