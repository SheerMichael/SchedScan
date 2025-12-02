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
    
    # Course/Schedule endpoints (legacy)
    path('upload-cor/student/', views.UploadStudentCORView.as_view(), name='upload_student_cor'),
    path('upload-cor/faculty/', views.UploadFacultyCORView.as_view(), name='upload_faculty_cor'),
    path('courses/', views.UserCoursesView.as_view(), name='user_courses'),
    path('courses/delete-all/', views.DeleteAllCoursesView.as_view(), name='delete_all_courses'),
    
    # Schedule endpoints (new - for cross-device sync)
    path('schedules/', views.ScheduleListCreateView.as_view(), name='schedule_list_create'),
    path('schedules/active/', views.ScheduleActiveView.as_view(), name='schedule_active'),
    path('schedules/clear-active/', views.ScheduleClearActiveView.as_view(), name='schedule_clear_active'),
    path('schedules/<int:pk>/', views.ScheduleDetailView.as_view(), name='schedule_detail'),
    path('schedules/<int:pk>/set-active/', views.ScheduleSetActiveView.as_view(), name='schedule_set_active'),
]
