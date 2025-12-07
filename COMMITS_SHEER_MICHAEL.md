# Commits by Sheer Michael C. Librero

## SchedScan Repository - Main Branch

| # | Date | Commit Message | SHA |
|---|------|----------------|-----|
| 1 | Dec 2, 2025 | feat: Add task management, account settings, and schedule deletion | `45d33b9` |
| 2 | Dec 2, 2025 | merge: Resolve conflict in home.tsx - combine main and Home branch changes | `f2ab990` |
| 3 | Dec 2, 2025 | feat: Add timetable generation and download feature | `ca1c590` |
| 4 | Dec 2, 2025 | feat: Add schedule enhancements and cross-device sync | `693611e` |
| 5 | Dec 1, 2025 | Merge pull request #7 from SheerMichael/Home | `82ec028` |
| 6 | Dec 1, 2025 | feat: Improve edit reminders with day splitting, time validation & conflict detection | `3e8b293` |
| 7 | Nov 29, 2025 | feat: Implement active schedule system with day-filtered calendar | `6bb205b` |
| 8 | Nov 29, 2025 | Merge pull request #6 from SheerMichael/Home | `28d00fa` |
| 9 | Nov 28, 2025 | Merge pull request #5 from SheerMichael/Home | `235f883` |
| 10 | Nov 28, 2025 | Merge main into Home - resolve conflict in user_profile.tsx (keep premiumuser state) | `ed71673` |
| 11 | Nov 26, 2025 | Added reminders functionality. Still need fixing, reminders not getting correct data. Have a fever atm | `ee120c2` |
| 12 | Nov 25, 2025 | Fix: Implement user-specific schedule storage and remove hardcoded data (#4) | `a610518` |
| 13 | Nov 25, 2025 | Merge main into Home: Resolve conflicts and integrate user-specific schedule storage | `4751fa1` |
| 14 | Nov 25, 2025 | Fix: Implement user-specific schedule storage and remove hardcoded data | `a9cad8c` |
| 15 | Nov 25, 2025 | Fix: Implement user-specific schedule storage and remove hardcoded data | `619ac5e` |
| 16 | Nov 24, 2025 | feat: implement modular COR upload system and remove frontend placeholders | `40b882a` |
| 17 | Nov 24, 2025 | Merge branch 'main' of https://github.com/SheerMichael/SchedScan | `975d8c2` |
| 18 | Nov 24, 2025 | feat: implement modular COR upload system and remove frontend placeholders | `5cd1ea6` |
| 19 | Nov 23, 2025 | Merge pull request #3 from SheerMichael/Home | `b61c906` |
| 20 | Nov 23, 2025 | Resolve merge conflict in Footer.tsx - keep profile path from Home branch | `6179eb3` |
| 21 | Nov 19, 2025 | OCR integration, error handling, and file validation | `aca0fba` |
| 22 | Nov 19, 2025 | Merge pull request #2 from SheerMichael/Home | `e9a7a8d` |
| 23 | Nov 3, 2025 | Refine README formatting and title | `52faaaa` |
| 24 | Nov 3, 2025 | feat: Implement complete JWT authentication system | `223896b` |
| 25 | Nov 3, 2025 | Merge pull request #1 from SheerMichael/Onboarding,-Login,-and-Registration-Frontend-Complete | `f107de3` |
| 26 | Oct 12, 2025 | will update readme later | `e030ee3` |
| 27 | Oct 12, 2025 | few fixes | `2aee210` |
| 28 | Oct 12, 2025 | project setup | `ea75356` |
| 29 | Oct 10, 2025 | project setup | `96c9a3a` |
| 30 | Oct 10, 2025 | Initial monorepo setup with Django backend and React Native frontend | `2b18c82` |

---

## Commit Details

### Dec 2, 2025 - feat: Add task management, account settings, and schedule deletion
**Backend:**
- Add Task model with subject_code-based task sharing across schedules
- Add TaskSerializer and TaskListCreateView/TaskDetailView APIs
- Add ChangePasswordView and DeleteAccountView for account management
- Add migration 0006_task for Task model

**Frontend:**
- Create taskService.ts with API + AsyncStorage caching for offline support
- Update subjectdetails.tsx with full task CRUD (add, toggle, delete)
- Implement change_password.tsx with validation and API integration
- Implement delete account in user_profile.tsx with password confirmation
- Add schedule deletion to student.tsx, faculty.tsx, and schedulepreviewcard.tsx
- Update home.tsx to pass complete course data and show real-time stats
- Hide subject name display until OCR properly extracts it
- Add expo-checkbox dependency for task checkboxes

---

### Dec 2, 2025 - feat: Add timetable generation and download feature
- Add Pillow-based timetable image generator (timetable_generator.py)
- Add timetable_image field to Schedule model with migration
- Auto-generate timetable on schedule create/update in serializers
- Add API endpoint for timetable PNG download
- Update frontend download to use new Expo SDK 54 APIs (File, Paths, expo/fetch)
- Use expo-sharing for cross-platform save/share functionality
- Fix schedule preview card day code mapping and grid display
- Update package dependencies for expo-sharing

---

### Dec 2, 2025 - feat: Add schedule enhancements and cross-device sync
**Schedule Sorting:**
- Added timeStringToMinutes() function to parse time strings
- Schedules now display earliest times at the top

**Time Conflict Validation:**
- Enhanced timeToMinutes() with flexible regex parsing for various formats
- Added expandDayCode() with full day name support (Monday, Tuesday, etc.)
- Added daysOverlap() and getOverlappingDays() for multi-day conflict detection
- Prevents scheduling multiple subjects at overlapping times

**Draggable Schedule Cards:**
- Added DraggableCard component using Gesture.Pan() API
- Users can now drag and reorder schedule cards
- Added GestureHandlerRootView wrapper to enable gesture handling

**Cross-Device Schedule Sync:**
- Implemented Schedule model in Django backend
- Added API endpoints for schedule CRUD operations
- Updated scheduleStorageService to use API instead of AsyncStorage
- Schedules now sync across all devices for logged-in users

---

### Dec 1, 2025 - feat: Improve edit reminders with day splitting, time validation & conflict detection
**Backend Changes:**
- Split multi-day courses (MTH, TF, etc.) into individual day entries during OCR
- Update Course model DAY_CHOICES to single days only (M, T, W, TH, F, S)
- Add delete-all-courses API endpoint for admin data clearing
- Add migration 0003_alter_course_day

**Frontend Changes (edit_reminders.tsx):**
- Remove school year/semester fields from UI
- Add day dropdown with single-day options
- Add time picker dropdowns with 15-min intervals (96 options)
- Fix dropdown maxHeight to show more items (200px)
- Implement save functionality with schedule storage update
- Add time conflict validation (prevents overlapping schedules on same day)
- Add start/end time validation (start must be before end)
- Add cancel button navigation

---

### Nov 29, 2025 - feat: Implement active schedule system with day-filtered calendar
- Add active schedule functionality to display courses on calendar
- Fix day code mapping (MTH=Mon/Thu, TF=Tue/Fri, etc.) for proper filtering
- Sort schedule cards chronologically (earliest first)
- Add rate limiting (5s cooldown) for COR uploads
- Add 'Apply Reminders' and 'Save Only' options in scanner flow
- Show 'ACTIVE' badge on currently active schedule
- Use subject_code consistently across calendar and reminders
- Comment out School Year card and search bar in reminders
- Update OCRReference.ipynb with comparison tests for notebook vs production OCR

---

### Nov 25, 2025 - Fix: Implement user-specific schedule storage and remove hardcoded data
- Add userId parameter to all schedule storage operations
- Implement automatic migration/cleanup of legacy schedules
- Add schedule cleanup on logout
- Remove hardcoded placeholder schedules from home screen
- Fix React Hook dependency warnings
- Ensure data isolation between user accounts

---

### Nov 24, 2025 - feat: implement modular COR upload system and remove frontend placeholders
- Refactor OCR module with abstract base class pattern (BaseCORExtractor, StudentCORExtractor, FacultyCORExtractor)
- Add separate student/faculty upload endpoints (/api/upload-cor/student/, /api/upload-cor/faculty/)
- Remove hardcoded placeholder data from home calendar (Operating System, Christmas entries)
- Fix JWT authentication to skip auth header for public endpoints (login, register, token refresh)
- Update frontend services to support uploadType parameter
- Add comprehensive documentation (MODULAR_ARCHITECTURE_SUMMARY.md, TROUBLESHOOTING.md)
- Rename OCR.ipynb to OCRReference.ipynb for reference
- Update scanner component to pass upload type to backend

---

### Nov 19, 2025 - OCR integration, error handling, and file validation
- Integrated OCR functionality
- Added error handling
- Implemented file validation

---

### Nov 3, 2025 - feat: Implement complete JWT authentication system
- Complete JWT authentication implementation
- Login/Register/Token refresh functionality

---

### Oct 10, 2025 - Initial monorepo setup with Django backend and React Native frontend
- Initial project structure
- Django backend setup
- React Native (Expo) frontend setup

---

**Total Commits by Sheer Michael: 30**
