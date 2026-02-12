from rest_framework import status, generics
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
import logging

from ..serializers import ScheduleSerializer, ScheduleListSerializer
from ..models import Course, Schedule

User = get_user_model()
logger = logging.getLogger(__name__)


class ScheduleListCreateView(generics.ListCreateAPIView):
    """
    API endpoint to list all schedules or create a new schedule.
    
    GET /api/schedules/
    Headers: Authorization: Bearer <access_token>
    Query params:
        - upload_type: Filter by 'student' or 'faculty' (optional)
        - include_courses: If 'true', include full course details (optional)
    
    Response (default - lightweight list): [
        {
            "id": 1,
            "title": "1st Semester 2025",
            "upload_type": "student",
            "is_active": true,
            "course_count": 8,
            "created_at": "2025-12-01T...",
            "updated_at": "2025-12-01T..."
        },
        ...
    ]
    
    Response (with include_courses=true): [
        {
            "id": 1,
            "title": "1st Semester 2025",
            "upload_type": "student",
            "is_active": true,
            "courses": [...],  // Full course details
            "created_at": "2025-12-01T...",
            "updated_at": "2025-12-01T..."
        },
        ...
    ]
    
    POST /api/schedules/
    Headers: Authorization: Bearer <access_token>
    Request body: {
        "title": "1st Semester 2025",
        "upload_type": "student",
        "is_active": true,
        "courses": [
            {
                "subject_code": "BSCS125781",
                "subject_name": "SOFTWARE ENGINEERING",
                "start_time": "07:00AM",
                "end_time": "09:00AM",
                "day": "M",
                "location": "LR7"
            },
            ...
        ]
    }
    
    Response: {
        "id": 1,
        "title": "1st Semester 2025",
        "upload_type": "student",
        "is_active": true,
        "courses": [...],
        "created_at": "2025-12-01T...",
        "updated_at": "2025-12-01T..."
    }
    """
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        if self.request.method == 'POST':
            return ScheduleSerializer
        # Support include_courses query param to return full details in list view
        # This avoids N+1 queries when frontend needs full schedule data
        include_courses = self.request.query_params.get('include_courses', '').lower() == 'true'
        if include_courses:
            return ScheduleSerializer
        return ScheduleListSerializer
    
    def get_queryset(self):
        queryset = Schedule.objects.filter(user=self.request.user)
        upload_type = self.request.query_params.get('upload_type', None)
        if upload_type:
            queryset = queryset.filter(upload_type=upload_type)
        # Prefetch courses to optimize queries when including course details
        # This prevents N+1 queries when serializing nested courses
        include_courses = self.request.query_params.get('include_courses', '').lower() == 'true'
        if include_courses:
            queryset = queryset.prefetch_related('courses')
        return queryset


class ScheduleDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    API endpoint to retrieve, update, or delete a specific schedule.
    
    GET /api/schedules/<id>/
    Headers: Authorization: Bearer <access_token>
    
    Response: {
        "id": 1,
        "title": "1st Semester 2025",
        "upload_type": "student",
        "is_active": true,
        "courses": [...],
        "created_at": "2025-12-01T...",
        "updated_at": "2025-12-01T..."
    }
    
    PUT/PATCH /api/schedules/<id>/
    Headers: Authorization: Bearer <access_token>
    Request body: { "title": "Updated Title", "is_active": true, ... }
    
    DELETE /api/schedules/<id>/
    Headers: Authorization: Bearer <access_token>
    """
    serializer_class = ScheduleSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return Schedule.objects.filter(user=self.request.user)


class ScheduleSetActiveView(APIView):
    """
    API endpoint to set a schedule as active (deactivates all others).
    
    POST /api/schedules/<id>/set-active/
    Headers: Authorization: Bearer <access_token>
    
    Response: {
        "message": "Schedule set as active",
        "schedule": { ... }
    }
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request, pk):
        try:
            schedule = Schedule.objects.get(pk=pk, user=request.user)
            
            # Deactivate all other schedules
            Schedule.objects.filter(user=request.user, is_active=True).update(is_active=False)
            
            # Activate this schedule
            schedule.is_active = True
            schedule.save()
            
            serializer = ScheduleSerializer(schedule)
            
            return Response(
                {
                    "message": "Schedule set as active",
                    "schedule": serializer.data
                },
                status=status.HTTP_200_OK
            )
        except Schedule.DoesNotExist:
            return Response(
                {"error": "Schedule not found"},
                status=status.HTTP_404_NOT_FOUND
            )


class ScheduleActiveView(APIView):
    """
    API endpoint to get the currently active schedule.
    
    GET /api/schedules/active/
    Headers: Authorization: Bearer <access_token>
    
    Response: {
        "id": 1,
        "title": "1st Semester 2025",
        "upload_type": "student",
        "is_active": true,
        "courses": [...],
        ...
    }
    
    Returns null/empty if no active schedule.
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        try:
            schedule = Schedule.objects.get(user=request.user, is_active=True)
            serializer = ScheduleSerializer(schedule)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Schedule.DoesNotExist:
            return Response(None, status=status.HTTP_200_OK)


class ScheduleClearActiveView(APIView):
    """
    API endpoint to clear the active schedule (deactivate current).
    
    POST /api/schedules/clear-active/
    Headers: Authorization: Bearer <access_token>
    
    Response: {
        "message": "Active schedule cleared"
    }
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        Schedule.objects.filter(user=request.user, is_active=True).update(is_active=False)
        return Response(
            {"message": "Active schedule cleared"},
            status=status.HTTP_200_OK
        )


class ScheduleTimetableDownloadView(APIView):
    """
    API endpoint to download the generated timetable image for a schedule.
    
    GET /api/schedules/<id>/timetable/
    Headers: Authorization: Bearer <access_token>
    
    Response: PNG image file download
    
    If timetable doesn't exist, it will be generated on-demand.
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request, pk):
        from django.http import FileResponse, HttpResponse
        from ..utils.timetable_generator import generate_timetable_image
        
        try:
            schedule = Schedule.objects.get(pk=pk, user=request.user)
        except Schedule.DoesNotExist:
            return Response(
                {"error": "Schedule not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Check if timetable image exists
        if schedule.timetable_image and schedule.timetable_image.name:
            try:
                # Return existing file
                response = FileResponse(
                    schedule.timetable_image.open('rb'),
                    content_type='image/png'
                )
                filename = f"timetable_{schedule.title.replace(' ', '_')}.png"
                response['Content-Disposition'] = f'attachment; filename="{filename}"'
                return response
            except Exception as e:
                logger.warning(f"Could not open existing timetable file: {e}")
        
        # Generate on-demand if not exists
        try:
            courses_data = list(schedule.courses.values(
                'subject_code', 'subject_name', 'start_time', 
                'end_time', 'day', 'location'
            ))
            
            image_buffer = generate_timetable_image(
                courses=courses_data,
                title=schedule.title,
                upload_type=schedule.upload_type,
                user_name=request.user.get_full_name()
            )
            
            response = HttpResponse(image_buffer.getvalue(), content_type='image/png')
            filename = f"timetable_{schedule.title.replace(' ', '_')}.png"
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response
            
        except Exception as e:
            logger.error(f"Error generating timetable: {str(e)}")
            return Response(
                {"error": "Failed to generate timetable", "details": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class MergeSchedulesView(APIView):
    """
    API endpoint to merge two schedules (e.g., student and faculty) into a new combined schedule.
    Detects time conflicts between courses and allows the user to choose how to handle them.
    
    POST /api/schedules/merge/
    Headers: Authorization: Bearer <access_token>
    Request body: {
        "schedule_ids": [1, 2],  // IDs of schedules to merge
        "title": "Merged Schedule",  // Title for the new merged schedule
        "conflict_resolution": "keep_both" | "keep_faculty" | "keep_student" | "skip_conflicts" | "per_conflict",
        "conflict_choices": [  // Required when using "per_conflict" resolution
            {
                "conflict_id": "conflict_0",
                "choice": "keep_course1" | "keep_course2" | "keep_both" | "skip_both"
            }
        ]
    }
    
    Response (success): {
        "message": "Successfully merged 2 schedules into 'Merged Schedule'",
        "schedule": { ...merged schedule data... },
        "conflicts_found": 2,
        "conflicts_resolved": "keep_both"
    }
    
    Response (conflicts detected - when conflict_resolution not provided): {
        "has_conflicts": true,
        "conflicts": [
            {
                "id": "conflict_0",
                "day": "M",
                "course1": { "subject_code": "CS101", "start_time": "08:00AM", "source_type": "faculty", ... },
                "course2": { "subject_code": "MATH201", "start_time": "08:30AM", "source_type": "student", ... },
                "overlap_minutes": 30
            },
            ...
        ],
        "message": "Time conflicts detected. Please specify conflict_resolution strategy."
    }
    """
    permission_classes = [IsAuthenticated]
    
    def _parse_time(self, time_str: str) -> int:
        """Convert time string (e.g., '08:00AM') to minutes from midnight."""
        import re
        match = re.match(r'(\d{1,2}):(\d{2})(AM|PM)', time_str.upper())
        if not match:
            return 0
        
        hours = int(match.group(1))
        minutes = int(match.group(2))
        period = match.group(3)
        
        if period == 'PM' and hours != 12:
            hours += 12
        elif period == 'AM' and hours == 12:
            hours = 0
        
        return hours * 60 + minutes
    
    def _times_overlap(self, start1: str, end1: str, start2: str, end2: str) -> tuple:
        """
        Check if two time ranges overlap.
        Returns (overlaps: bool, overlap_minutes: int)
        """
        s1 = self._parse_time(start1)
        e1 = self._parse_time(end1)
        s2 = self._parse_time(start2)
        e2 = self._parse_time(end2)
        
        # Check for overlap
        overlap_start = max(s1, s2)
        overlap_end = min(e1, e2)
        
        if overlap_start < overlap_end:
            return True, overlap_end - overlap_start
        return False, 0
    
    def _find_conflicts(self, courses1: list, courses2: list) -> list:
        """
        Find all time conflicts between two lists of courses.
        Returns list of conflict dictionaries with unique IDs.
        """
        conflicts = []
        conflict_index = 0
        
        for c1 in courses1:
            for c2 in courses2:
                # Only check courses on the same day
                if c1['day'] != c2['day']:
                    continue
                
                overlaps, overlap_minutes = self._times_overlap(
                    c1['start_time'], c1['end_time'],
                    c2['start_time'], c2['end_time']
                )
                
                if overlaps:
                    conflicts.append({
                        'id': f'conflict_{conflict_index}',
                        'day': c1['day'],
                        'course1': c1,
                        'course2': c2,
                        'overlap_minutes': overlap_minutes
                    })
                    conflict_index += 1
        
        return conflicts
    
    def _get_course_key(self, course: dict) -> tuple:
        """Generate a unique key for a course."""
        return (course['subject_code'], course['day'], course['start_time'], course['end_time'])
    
    def post(self, request):
        schedule_ids = request.data.get('schedule_ids', [])
        title = request.data.get('title', 'Merged Schedule')
        conflict_resolution = request.data.get('conflict_resolution', None)
        conflict_choices = request.data.get('conflict_choices', [])
        
        # Validate input
        if len(schedule_ids) < 2:
            return Response(
                {"error": "At least 2 schedule IDs are required to merge"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Fetch schedules
        schedules = []
        for sid in schedule_ids:
            try:
                schedule = Schedule.objects.get(pk=sid, user=request.user)
                schedules.append(schedule)
            except Schedule.DoesNotExist:
                return Response(
                    {"error": f"Schedule with ID {sid} not found"},
                    status=status.HTTP_404_NOT_FOUND
                )
        
        # Get courses from all schedules, tracking their source type
        all_courses = []
        courses_by_schedule = []
        faculty_courses = []
        student_courses = []
        
        for schedule in schedules:
            courses = list(schedule.courses.values(
                'subject_code', 'subject_name', 'start_time',
                'end_time', 'day', 'location'
            ))
            # Add source_type to each course based on the schedule's upload_type
            for course in courses:
                source_type = schedule.upload_type if schedule.upload_type in ['student', 'faculty'] else 'student'
                course['source_type'] = source_type
                
                if source_type == 'faculty':
                    faculty_courses.append(course)
                else:
                    student_courses.append(course)
            
            courses_by_schedule.append(courses)
            all_courses.extend(courses)
        
        # Find conflicts between all schedule pairs
        all_conflicts = []
        for i in range(len(courses_by_schedule)):
            for j in range(i + 1, len(courses_by_schedule)):
                conflicts = self._find_conflicts(
                    courses_by_schedule[i],
                    courses_by_schedule[j]
                )
                all_conflicts.extend(conflicts)
        
        # Re-index conflicts to ensure unique IDs
        for idx, conflict in enumerate(all_conflicts):
            conflict['id'] = f'conflict_{idx}'
        
        # If conflicts exist and no resolution strategy provided, return conflicts
        if all_conflicts and not conflict_resolution:
            return Response({
                "has_conflicts": True,
                "conflicts": all_conflicts,
                "conflict_count": len(all_conflicts),
                "message": "Time conflicts detected. Please specify conflict_resolution strategy.",
                "available_strategies": [
                    {"value": "keep_both", "description": "Keep all courses (allow overlapping schedules)"},
                    {"value": "keep_faculty", "description": "Keep faculty courses, add non-conflicting student courses"},
                    {"value": "keep_student", "description": "Keep student courses, add non-conflicting faculty courses"},
                    {"value": "skip_conflicts", "description": "Skip all conflicting courses from both schedules"},
                    {"value": "per_conflict", "description": "Manually choose for each conflict"}
                ]
            }, status=status.HTTP_200_OK)
        
        # Apply conflict resolution
        merged_courses = []
        
        if conflict_resolution == 'keep_both' or not all_conflicts:
            # Keep all courses (including conflicts)
            merged_courses = all_courses
        
        elif conflict_resolution == 'keep_faculty':
            # Keep faculty courses, only add non-conflicting student courses
            merged_courses = faculty_courses.copy()
            for course in student_courses:
                has_conflict = False
                for existing in merged_courses:
                    if existing['day'] == course['day']:
                        overlaps, _ = self._times_overlap(
                            existing['start_time'], existing['end_time'],
                            course['start_time'], course['end_time']
                        )
                        if overlaps:
                            has_conflict = True
                            break
                if not has_conflict:
                    merged_courses.append(course)
        
        elif conflict_resolution == 'keep_student':
            # Keep student courses as priority
            merged_courses = student_courses.copy()
            for course in faculty_courses:
                has_conflict = False
                for existing in merged_courses:
                    if existing['day'] == course['day']:
                        overlaps, _ = self._times_overlap(
                            existing['start_time'], existing['end_time'],
                            course['start_time'], course['end_time']
                        )
                        if overlaps:
                            has_conflict = True
                            break
                if not has_conflict:
                    merged_courses.append(course)
        
        elif conflict_resolution == 'skip_conflicts':
            # Skip all courses that have any conflict
            conflicting_courses = set()
            for conflict in all_conflicts:
                c1_key = self._get_course_key(conflict['course1'])
                c2_key = self._get_course_key(conflict['course2'])
                conflicting_courses.add(c1_key)
                conflicting_courses.add(c2_key)
            
            for course in all_courses:
                course_key = self._get_course_key(course)
                if course_key not in conflicting_courses:
                    merged_courses.append(course)
        
        elif conflict_resolution == 'per_conflict':
            # Handle per-conflict resolution
            if not conflict_choices:
                return Response(
                    {"error": "conflict_choices is required when using per_conflict resolution"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Create a map of conflict choices
            choices_map = {c['conflict_id']: c['choice'] for c in conflict_choices}
            
            # Track which courses to include/exclude
            courses_to_include = set()
            courses_to_exclude = set()
            
            for conflict in all_conflicts:
                conflict_id = conflict['id']
                choice = choices_map.get(conflict_id, 'keep_both')  # Default to keep_both
                
                c1_key = self._get_course_key(conflict['course1'])
                c2_key = self._get_course_key(conflict['course2'])
                
                if choice == 'keep_course1':
                    courses_to_include.add(c1_key)
                    courses_to_exclude.add(c2_key)
                elif choice == 'keep_course2':
                    courses_to_include.add(c2_key)
                    courses_to_exclude.add(c1_key)
                elif choice == 'keep_both':
                    courses_to_include.add(c1_key)
                    courses_to_include.add(c2_key)
                elif choice == 'skip_both':
                    courses_to_exclude.add(c1_key)
                    courses_to_exclude.add(c2_key)
            
            # Add all courses that are not explicitly excluded
            for course in all_courses:
                course_key = self._get_course_key(course)
                # Include if explicitly included or not in any conflict
                if course_key in courses_to_include or course_key not in courses_to_exclude:
                    merged_courses.append(course)
        
        # Legacy support: keep_first and keep_second still work
        elif conflict_resolution == 'keep_first':
            merged_courses = courses_by_schedule[0].copy()
            for courses in courses_by_schedule[1:]:
                for course in courses:
                    has_conflict = False
                    for existing in merged_courses:
                        if existing['day'] == course['day']:
                            overlaps, _ = self._times_overlap(
                                existing['start_time'], existing['end_time'],
                                course['start_time'], course['end_time']
                            )
                            if overlaps:
                                has_conflict = True
                                break
                    if not has_conflict:
                        merged_courses.append(course)
        
        elif conflict_resolution == 'keep_second':
            merged_courses = courses_by_schedule[-1].copy() if len(courses_by_schedule) > 1 else []
            for courses in courses_by_schedule[:-1]:
                for course in courses:
                    has_conflict = False
                    for existing in merged_courses:
                        if existing['day'] == course['day']:
                            overlaps, _ = self._times_overlap(
                                existing['start_time'], existing['end_time'],
                                course['start_time'], course['end_time']
                            )
                            if overlaps:
                                has_conflict = True
                                break
                    if not has_conflict:
                        merged_courses.append(course)
        
        else:
            return Response(
                {"error": f"Invalid conflict_resolution strategy: {conflict_resolution}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Remove duplicates (same subject, day, time)
        seen = set()
        unique_courses = []
        for course in merged_courses:
            key = (course['subject_code'], course['day'], course['start_time'], course['end_time'])
            if key not in seen:
                seen.add(key)
                unique_courses.append(course)
        
        # Create the merged schedule and set it as active
        merged_schedule = Schedule.objects.create(
            user=request.user,
            title=title,
            upload_type='merged',  # Use 'merged' type for merged schedules
            is_active=True  # Automatically set as active so it shows in calendar
        )
        
        # Create courses for the merged schedule
        for course_data in unique_courses:
            Course.objects.create(
                user=request.user,
                schedule=merged_schedule,
                **course_data
            )
        
        # Serialize the response
        serializer = ScheduleSerializer(merged_schedule)
        
        logger.info(f"User {request.user.id} merged {len(schedule_ids)} schedules into schedule {merged_schedule.id} "
                   f"with {len(unique_courses)} courses (conflicts: {len(all_conflicts)}, resolution: {conflict_resolution})")
        
        return Response({
            "message": f"Successfully merged {len(schedule_ids)} schedules into '{title}'",
            "schedule": serializer.data,
            "total_courses": len(unique_courses),
            "conflicts_found": len(all_conflicts),
            "conflicts_resolved": conflict_resolution or "none"
        }, status=status.HTTP_201_CREATED)
