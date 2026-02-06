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
]
