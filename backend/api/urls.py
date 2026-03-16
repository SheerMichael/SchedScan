from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from . import views

urlpatterns = [
    # Test endpoint
    path('', views.index, name='index'),
    
    # Authentication endpoints
    path('auth/register/', views.RegisterView.as_view(), name='register'),
    path('auth/login/', views.LoginView.as_view(), name='login'),
    path('auth/logout/', views.LogoutView.as_view(), name='logout'),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    
    # User profile
    path('auth/user/', views.UserProfileView.as_view(), name='user_profile'),
    
    # Account management
    path('auth/change-password/', views.ChangePasswordView.as_view(), name='change_password'),
    path('auth/delete-account/', views.DeleteAccountView.as_view(), name='delete_account'),
    
    # Password reset
    path('auth/password-reset/request/', views.PasswordResetRequestView.as_view(), name='password_reset_request'),
    path('auth/password-reset/verify/', views.PasswordResetVerifyView.as_view(), name='password_reset_verify'),
    path('auth/password-reset/confirm/', views.PasswordResetConfirmView.as_view(), name='password_reset_confirm'),

    
    # Course/Schedule endpoints (legacy)
    path('upload-cor/student/', views.UploadStudentCORView.as_view(), name='upload_student_cor'),
    path('upload-cor/faculty/', views.UploadFacultyCORView.as_view(), name='upload_faculty_cor'),
    path('courses/', views.UserCoursesView.as_view(), name='user_courses'),
    path('courses/delete-all/', views.DeleteAllCoursesView.as_view(), name='delete_all_courses'),
    
    # Schedule endpoints (new - for cross-device sync)
    path('schedules/', views.ScheduleListCreateView.as_view(), name='schedule_list_create'),
    path('schedules/active/', views.ScheduleActiveView.as_view(), name='schedule_active'),
    path('schedules/clear-active/', views.ScheduleClearActiveView.as_view(), name='schedule_clear_active'),
    path('schedules/merge/', views.MergeSchedulesView.as_view(), name='schedule_merge'),
    path('schedules/<int:pk>/', views.ScheduleDetailView.as_view(), name='schedule_detail'),
    path('schedules/<int:pk>/set-active/', views.ScheduleSetActiveView.as_view(), name='schedule_set_active'),
    path('schedules/<int:pk>/timetable/', views.ScheduleTimetableDownloadView.as_view(), name='schedule_timetable_download'),
    
    # Task endpoints
    path('tasks/', views.TaskListCreateView.as_view(), name='task_list_create'),
    path('tasks/counts/', views.TaskCountsView.as_view(), name='task_counts'),  # Batch counts endpoint
    path('tasks/<int:pk>/', views.TaskDetailView.as_view(), name='task_detail'),
    
    # Push notification endpoints
    path('push-token/', views.RegisterPushTokenView.as_view(), name='register_push_token'),
    
    # Notification history endpoints
    path('notifications/', views.NotificationListView.as_view(), name='notification_list'),
    path('notifications/read-all/', views.NotificationMarkAllReadView.as_view(), name='notification_read_all'),
    path('notifications/unread-count/', views.NotificationUnreadCountView.as_view(), name='notification_unread_count'),
    path('notifications/<int:pk>/read/', views.NotificationMarkReadView.as_view(), name='notification_mark_read'),
    
    # Parental view endpoints - Invite codes
    path('auth/invite-code/generate/', views.GenerateInviteCodeView.as_view(), name='generate_invite_code'),
    path('auth/invite-code/validate/', views.ValidateInviteCodeView.as_view(), name='validate_invite_code'),
    path('auth/invite-code/use/', views.UseInviteCodeView.as_view(), name='use_invite_code'),
    
    # Parental view endpoints - Parent side
    path('parent/child/', views.ChildLinkView.as_view(), name='child_link'),
    path('parent/child/schedule/', views.ChildScheduleView.as_view(), name='child_schedule'),
    
    # Parental view endpoints - Student side
    path('student/parents/', views.LinkedParentsView.as_view(), name='linked_parents'),
    path('student/parents/<int:link_id>/revoke/', views.RevokeParentAccessView.as_view(), name='revoke_parent_access'),
    
    # Faculty-Student Connection endpoints
    path('faculty/activate/', views.FacultyModeActivateView.as_view(), name='faculty_activate'),
    path('faculty/check/', views.FacultyModeCheckView.as_view(), name='faculty_check'),
    path('faculty/class-code/', views.ClassCodeView.as_view(), name='class_code'),
    path('faculty/tasks/', views.FacultyTaskListCreateView.as_view(), name='faculty_task_list_create'),
    path('faculty/tasks/<int:pk>/', views.FacultyTaskDetailView.as_view(), name='faculty_task_detail'),
    path('faculty/tasks/<int:pk>/stats/', views.FacultyTaskStatsView.as_view(), name='faculty_task_stats'),
    path('faculty/tasks/<int:pk>/file/', views.FacultyTaskFileDownloadView.as_view(), name='faculty_task_file'),
    path('faculty/enrolled-students/', views.FacultyEnrolledStudentsView.as_view(), name='faculty_enrolled_students'),
    path('faculty/remove-student/', views.FacultyRemoveStudentView.as_view(), name='faculty_remove_student'),
    path('student/enroll/', views.StudentEnrollView.as_view(), name='student_enroll'),
    path('student/enroll/sync/', views.StudentEnrollSyncView.as_view(), name='student_enroll_sync'),
    path('student/enroll/preview/', views.ClassCodePreviewView.as_view(), name='student_enroll_preview'),
    path('student/unenroll/', views.StudentUnenrollView.as_view(), name='student_unenroll'),
    path('student/enrollments/', views.StudentEnrollmentListView.as_view(), name='student_enrollments'),
    path('student/faculty-tasks/', views.StudentFacultyTaskListView.as_view(), name='student_faculty_tasks'),
    path('student/faculty-tasks/counts/', views.StudentFacultyTaskCountsView.as_view(), name='student_faculty_task_counts'),
    path('student/faculty-tasks/<int:pk>/complete/', views.StudentFacultyTaskCompleteView.as_view(), name='student_faculty_task_complete'),

    # Faculty Remark endpoints
    path('faculty/remarks/', views.FacultyRemarkListCreateView.as_view(), name='faculty_remark_list_create'),
    path('faculty/remarks/<int:pk>/', views.FacultyRemarkDetailView.as_view(), name='faculty_remark_detail'),
    path('student/remarks/', views.StudentRemarkListView.as_view(), name='student_remark_list'),
    path('parent/child/remarks/', views.ParentRemarkListView.as_view(), name='parent_remark_list'),

    # Public holiday endpoint (all authenticated users)
    path('holidays/', views.HolidayListView.as_view(), name='holiday_list'),

    # Public calendar events endpoint (filtered by user role)
    path('calendar-events/', views.CalendarEventListView.as_view(), name='calendar_event_list'),

    # Payment endpoints
    path('payment/can-add-child/', views.CanAddChildView.as_view(), name='can_add_child'),
    path('payment/create-checkout-session/', views.CreateCheckoutSessionView.as_view(), name='create_checkout_session'),
    path('payment/status/', views.CheckPaymentStatusView.as_view(), name='check_payment_status'),
    path('payment/webhook/', views.StripeWebhookView.as_view(), name='stripe_webhook'),
    path('payment/success/', views.PaymentSuccessView.as_view(), name='payment_success'),
    path('payment/cancelled/', views.PaymentCancelledView.as_view(), name='payment_cancelled'),

    # -----------------------------------------------------------------------
    # Admin dashboard endpoints (all require is_staff via IsAdminUser)
    # -----------------------------------------------------------------------
    path('admin/login/', views.AdminLoginView.as_view(), name='admin_login'),

    # User management
    path('admin/users/', views.AdminUserListView.as_view(), name='admin_user_list'),
    path('admin/users/<int:pk>/', views.AdminUserDetailView.as_view(), name='admin_user_detail'),
    path('admin/users/<int:pk>/activity/', views.AdminUserActivityView.as_view(), name='admin_user_activity'),

    # Parent-child link management
    path('admin/parent-links/', views.AdminParentLinkListView.as_view(), name='admin_parent_link_list'),
    path('admin/parent-links/<int:pk>/', views.AdminParentLinkActionView.as_view(), name='admin_parent_link_action'),

    # Analytics
    path('admin/analytics/', views.AdminAnalyticsView.as_view(), name='admin_analytics'),
    path('admin/analytics/chart/', views.AdminAnalyticsChartView.as_view(), name='admin_analytics_chart'),

    # Holiday CRUD
    path('admin/holidays/', views.AdminHolidayListCreateView.as_view(), name='admin_holiday_list'),
    path('admin/holidays/<int:pk>/', views.AdminHolidayDetailView.as_view(), name='admin_holiday_detail'),

    # Calendar Event CRUD
    path('admin/calendar-events/', views.AdminCalendarEventListCreateView.as_view(), name='admin_calendar_event_list'),
    path('admin/calendar-events/<int:pk>/', views.AdminCalendarEventDetailView.as_view(), name='admin_calendar_event_detail'),

    # Audit log
    path('admin/audit-log/', views.AdminAuditLogView.as_view(), name='admin_audit_log'),

    # Extraction health monitoring (admin)
    path('admin/extraction/analytics/', views.AdminExtractionAnalyticsView.as_view(), name='admin_extraction_analytics'),
    path('admin/extraction/analytics/chart/', views.AdminExtractionChartView.as_view(), name='admin_extraction_chart'),
    path('admin/extraction/failed/', views.AdminFailedExtractionListView.as_view(), name='admin_failed_extractions'),

    # Incident reports (admin)
    path('admin/incidents/', views.AdminIncidentReportListView.as_view(), name='admin_incident_list'),
    path('admin/incidents/<int:pk>/', views.AdminIncidentReportDetailView.as_view(), name='admin_incident_detail'),

    # Incident reports (mobile user)
    path('reports/submit/', views.SubmitIncidentReportView.as_view(), name='submit_incident_report'),
]
