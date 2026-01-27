# SchedScan - System Architecture Documentation

## Table of Contents
1. [Overview](#overview)
2. [Technology Stack](#technology-stack)
3. [System Architecture](#system-architecture)
4. [Backend Architecture](#backend-architecture)
5. [Frontend Architecture](#frontend-architecture)
6. [Core Features](#core-features)
7. [Data Models](#data-models)
8. [API Endpoints](#api-endpoints)
9. [Authentication & Security](#authentication--security)
10. [File Upload & OCR Processing](#file-upload--ocr-processing)
11. [Storage Strategy](#storage-strategy)
12. [Key Implementation Details](#key-implementation-details)

---

## Overview

**SchedScan** is a cross-platform scheduling management system that allows students and faculty to scan, manage, and organize their class schedules. The app provides intelligent OCR-based schedule extraction from Certificate of Registration (COR) documents, cross-device synchronization, task management, and visual timetable generation.

### Primary Use Cases
- **Students**: Upload COR documents to extract class schedules, manage tasks, view timetables
- **Faculty**: Upload faculty schedules, manage teaching assignments, track course locations
- **Cross-Device Sync**: Seamlessly sync schedules across multiple devices using cloud backend
- **Task Management**: Create subject-specific tasks and to-dos linked to courses
- **Timetable Visualization**: Generate and download visual weekly timetable images

---

## Technology Stack

### Backend
- **Framework**: Django 5.2.7 (Python 3.12+)
- **Database**: PostgreSQL
- **API**: Django REST Framework (DRF)
- **Authentication**: JWT (Simple JWT) with token refresh & blacklisting
- **OCR Engine**: doctr (Document Text Recognition)
- **Image Processing**: Pillow (PIL)
- **CORS**: django-cors-headers

### Frontend
- **Framework**: React Native (Expo)
- **Language**: TypeScript
- **Navigation**: Expo Router (file-based routing)
- **State Management**: React Context API
- **Styling**: NativeWind (TailwindCSS for React Native)
- **Storage**: AsyncStorage (local), SecureStore (tokens)
- **HTTP Client**: Axios with interceptors
- **Icons**: Lucide React Native

### Development Tools
- **Virtual Environment**: Python venv
- **Package Manager**: npm (frontend), pip (backend)
- **Version Control**: Git

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     MOBILE CLIENT LAYER                      │
│                                                               │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │   React    │  │   Expo     │  │ NativeWind │            │
│  │  Native    │  │   Router   │  │   (CSS)    │            │
│  └────────────┘  └────────────┘  └────────────┘            │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │          Context Providers & Services               │   │
│  │  - AuthContext (User state)                         │   │
│  │  - authService (Login/Register)                     │   │
│  │  - scheduleStorageService (Schedule CRUD)           │   │
│  │  - courseService (Course operations)                │   │
│  │  - taskService (Task management)                    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTPS/REST API
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      API GATEWAY LAYER                       │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │         Django REST Framework (DRF)                 │   │
│  │  - JWT Authentication Middleware                    │   │
│  │  - CORS Configuration                               │   │
│  │  - Request/Response Serialization                   │   │
│  │  - Rate Limiting (Client-side)                      │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    BUSINESS LOGIC LAYER                      │
│                                                               │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │   Auth     │  │  Schedule  │  │   Task     │            │
│  │  Views     │  │   Views    │  │   Views    │            │
│  └────────────┘  └────────────┘  └────────────┘            │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Utility Services                       │   │
│  │  - OCR Extractor (StudentCOR, FacultyCOR)          │   │
│  │  - Timetable Generator (Image creation)            │   │
│  │  - Day Code Expander (M, TH, MWF → individual)     │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      DATA ACCESS LAYER                       │
│                                                               │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │    User    │  │  Schedule  │  │   Course   │            │
│  │   Model    │  │   Model    │  │   Model    │            │
│  └────────────┘  └────────────┘  └────────────┘            │
│                                                               │
│  ┌────────────┐  ┌─────────────────────────────────────┐   │
│  │    Task    │  │      Django ORM                     │   │
│  │   Model    │  │   (PostgreSQL Interface)            │   │
│  └────────────┘  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     DATABASE LAYER                           │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              PostgreSQL Database                    │   │
│  │  - Users                                            │   │
│  │  - Schedules (with is_active flag)                 │   │
│  │  - Courses (linked to schedules)                   │   │
│  │  - Tasks (linked to subject codes)                 │   │
│  │  - JWT Token Blacklist                             │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                       FILE STORAGE                           │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Media Files (Django MEDIA_ROOT)           │   │
│  │  - /media/profile_pictures/                         │   │
│  │  - /media/timetables/                               │   │
│  │  - /media/temp/                                     │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Backend Architecture

### Django Project Structure
```
backend/
├── manage.py                    # Django management CLI
├── core/                        # Project configuration
│   ├── settings.py             # Django settings (DB, JWT, CORS, etc.)
│   ├── urls.py                 # Root URL configuration
│   ├── wsgi.py                 # WSGI server entry point
│   └── asgi.py                 # ASGI server entry point
├── api/                         # Main application
│   ├── models.py               # Database models (User, Course, Schedule, Task)
│   ├── serializers.py          # DRF serializers for API responses
│   ├── views.py                # API view endpoints
│   ├── urls.py                 # API URL routing
│   ├── admin.py                # Django admin configuration
│   ├── migrations/             # Database migration files
│   └── utils/                  # Utility modules
│       ├── extraction_manager.py  # Hybrid extraction orchestrator
│       ├── pdf_extractor.py    # PDF text extraction (primary)
│       ├── ocr.py              # OCR extraction (fallback)
│       └── timetable_generator.py  # Timetable image generation
├── media/                       # User-uploaded files
│   ├── profile_pictures/
│   ├── timetables/
│   └── temp/
└── db.sqlite3                   # SQLite (dev only, PostgreSQL in prod)
```

### Key Backend Components

#### 1. Models (`api/models.py`)
- **User**: Custom user model with email authentication
- **Schedule**: Groups courses into named schedules
- **Course**: Individual class sessions extracted from COR
- **Task**: Subject-specific to-do items

#### 2. Views (`api/views.py`)
- **Authentication Views**: Register, Login, Logout, Token Refresh
- **User Profile Views**: Get/Update profile, Change password, Delete account
- **Schedule Views**: CRUD operations, set active schedule, generate timetable
- **Course Views**: Legacy endpoints for direct course manipulation
- **Task Views**: Create, read, update, delete tasks

#### 3. Utilities
- **Extraction Manager** (`utils/extraction_manager.py`):
  - **Hybrid extraction strategy**: PDF text extraction (primary) with OCR fallback
  - Automatically selects optimal extraction method based on file type and quality
  - Quality validation and confidence scoring
  - Performance tracking and method logging
  - Returns extraction metadata (method, confidence, processing time)

- **PDF Text Extractor** (`utils/pdf_extractor.py`):
  - **Primary extraction method for digital PDFs** (10-50x faster than OCR)
  - Uses pdfplumber for direct text extraction from embedded PDF text
  - Table detection and structural parsing
  - Spatial text analysis for non-tabular data
  - Pattern matching for subject codes, times, days, locations
  - Separate extractors for Student COR and Faculty COR formats
  - Multi-day course splitting (MTH → M, TH)
  - Quality scoring for extraction validation
  
- **OCR Extractor** (`utils/ocr.py`):
  - **Fallback method for scanned PDFs and images**
  - Uses doctr (deep learning OCR) for text recognition
  - Handles poor quality PDFs and photographed documents
  - Geometric/spatial parsing approach
  - Pattern matching for schedule components
  - Preserved from original implementation for robustness
  
  
- **Timetable Generator** (`utils/timetable_generator.py`):
  - Creates visual weekly timetable images using Pillow
  - Color-coded by SchedScan branding (#990100 red)
  - Exports as PNG for download


---

## Frontend Architecture

### React Native Project Structure
```
frontend/schedscan/
├── app/                         # Expo Router pages
│   ├── _layout.tsx             # Root layout
│   ├── index.tsx               # Landing/redirect page
│   ├── intro/                  # Onboarding screens
│   │   ├── getstarted.tsx
│   │   ├── intro.tsx
│   │   ├── login.tsx
│   │   └── signup.tsx
│   ├── Home/                   # Main app screens (authenticated)
│   │   ├── _layout.tsx         # Tab navigation
│   │   ├── home.tsx            # Dashboard
│   │   ├── scanner.tsx         # COR upload
│   │   ├── schedules.tsx       # Schedule list
│   │   ├── reminders.tsx       # Reminders/Tasks
│   │   ├── notification.tsx    # Notifications
│   │   ├── Reminders/
│   │   │   └── edit_reminders.tsx  # Edit schedule entry
│   │   ├── Schedules/
│   │   │   ├── faculty.tsx     # Faculty schedule view
│   │   │   └── student.tsx     # Student schedule view
│   │   └── Subject/
│   │       └── subjectdetails.tsx  # Course details + tasks
│   ├── profile/                # User profile screens
│   │   ├── user_profile.tsx
│   │   ├── change_password.tsx
│   │   ├── my_plans.tsx
│   │   └── reminder_sys.tsx
│   └── payment/                # Payment/premium features
│       ├── pay.tsx
│       └── purchased.tsx
├── components/                  # Reusable UI components
│   ├── facultycard.tsx         # Faculty schedule card
│   ├── studentcard.tsx         # Student schedule card
│   ├── schedulepreviewcard.tsx # Schedule preview
│   ├── notifitem.tsx           # Notification item
│   └── reminderschedule.tsx    # Reminder schedule item
├── context/                     # React Context
│   └── AuthContext.tsx         # Authentication state
├── services/                    # API & storage services
│   ├── api.ts                  # Axios instance with JWT interceptors
│   ├── authService.ts          # Auth API calls
│   ├── courseService.ts        # Course API calls
│   ├── scheduleStorageService.ts # Schedule sync & storage
│   └── taskService.ts          # Task API calls
├── assets/                      # Static assets (images, fonts)
├── package.json
├── tsconfig.json
└── tailwind.config.js
```

### Key Frontend Components

#### 1. Context Providers
- **AuthContext**: Manages user authentication state, login/logout actions, token storage

#### 2. Services
- **api.ts**: Configured axios instance with:
  - Automatic JWT token attachment
  - Token refresh on 401 errors
  - Platform-specific API URL detection (Android emulator, iOS simulator, physical device)
  
- **scheduleStorageService.ts**: 
  - Hybrid storage (local AsyncStorage + backend sync)
  - Rate limiting (5-second cooldown)
  - Active schedule management
  - Timetable image download
  
- **taskService.ts**:
  - Task CRUD with cache-first strategy
  - Offline support with AsyncStorage fallback

#### 3. Navigation
- Uses Expo Router (file-based routing)
- Tab navigation for main app sections
- Stack navigation for details/edit screens

---

## Core Features

### 1. **User Authentication**
- Email-based authentication (no username)
- JWT access tokens (1-hour lifetime)
- JWT refresh tokens (7-day lifetime)
- Secure token storage using Expo SecureStore
- Token blacklisting on logout
- Password change functionality
- Account deletion

### 2. **Schedule Management**
- **Upload COR**: Scan PDF/image of Certificate of Registration
- **Multiple Schedules**: Users can save multiple schedules (e.g., "Fall 2024", "Spring 2025")
- **Active Schedule**: One schedule marked as active per user
- **Cross-Device Sync**: Schedules synced across devices via backend API
- **Timetable Export**: Generate and download visual timetable images
- **Schedule Types**: Student or Faculty format

### 3. **Course Management**
- **Automatic Extraction**: OCR extracts subject code, time, day, location
- **Multi-Day Support**: Courses meeting multiple days (MTH, MWF) split into individual entries
- **Conflict Detection**: Validates for time/day conflicts before saving
- **Edit Courses**: Modify course details (time, location, day)
- **Time Validation**: Ensures start time < end time

### 4. **Task Management**
- **Subject-Specific Tasks**: Tasks linked to course subject codes
- **Shared Across Schedules**: Same subject in different schedules shares tasks
- **Completion Tracking**: Mark tasks as complete/incomplete
- **Offline Support**: Tasks cached locally, synced when online

### 5. **OCR Processing**
- **Supported Formats**: PDF, JPG, PNG
- **Two Extractors**: 
  - StudentCORExtractor: Extracts student schedules
  - FacultyCORExtractor: Extracts faculty schedules
- **Pattern Matching**: Regex patterns for subject codes, times, days, locations
- **Day Code Expansion**: MTH → [M, TH], MWF → [M, W, F]

### 6. **Timetable Visualization**
- **Weekly Grid Layout**: Sunday-Saturday columns, time rows
- **Color-Coded**: SchedScan branding red (#990100)
- **Course Details**: Shows subject code, location, time
- **Export as PNG**: Users can download timetable image

### 7. **Rate Limiting (Client-Side)**
- **Upload Cooldown**: 5-second cooldown between uploads
- **User Feedback**: Shows remaining cooldown time

---

## Data Models

### User Model
```python
class User(AbstractUser):
    email = EmailField(unique=True)           # Primary identifier
    first_name = CharField(max_length=150)
    last_name = CharField(max_length=150)
    profile_picture = ImageField(upload_to='profile_pictures/')
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)
```

**Key Points**:
- Email is the USERNAME_FIELD (no username field)
- Uses Django's AbstractUser for built-in auth features
- Custom manager (CustomUserManager) handles user creation

---

### Schedule Model
```python
class Schedule(Model):
    user = ForeignKey(User, on_delete=CASCADE)
    title = CharField(max_length=255)                    # User-defined name
    upload_type = CharField(choices=['student', 'faculty'])
    is_active = BooleanField(default=False)              # Only one active per user
    timetable_image = ImageField(upload_to='timetables/')
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)
```

**Key Points**:
- Groups courses into named schedules (e.g., "Fall 2024")
- Only one schedule can be active at a time (enforced in `save()` method)
- Auto-generates timetable image on creation
- Indexed by (user, upload_type) and (user, is_active)

---

### Course Model
```python
class Course(Model):
    user = ForeignKey(User, on_delete=CASCADE)
    schedule = ForeignKey(Schedule, on_delete=CASCADE)
    subject_code = CharField(max_length=50)              # e.g., "BSCS125781"
    subject_name = CharField(max_length=255, blank=True)
    start_time = CharField(max_length=20)                # e.g., "07:00AM"
    end_time = CharField(max_length=20)                  # e.g., "09:00AM"
    day = CharField(max_length=10, choices=DAY_CHOICES)  # M, T, W, TH, F, S
    location = CharField(max_length=100, blank=True)     # e.g., "LR7", "LAB2"
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)
```

**Key Points**:
- Multi-day courses split into individual day entries during OCR
- Day choices: M, T, W, TH, F, S (single day per record)
- Times stored as strings for simplicity
- Indexed by (user, subject_code) and (user, day)

---

### Task Model
```python
class Task(Model):
    user = ForeignKey(User, on_delete=CASCADE)
    subject_code = CharField(max_length=50)              # Links to Course
    text = CharField(max_length=500)                     # Task description
    is_completed = BooleanField(default=False)
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)
```

**Key Points**:
- Tasks linked by subject_code, NOT by schedule
- Shared across all schedules with same subject_code
- Indexed by (user, subject_code)

---

## API Endpoints

### Authentication
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/register/` | Register new user | Public |
| POST | `/api/auth/login/` | Login user | Public |
| POST | `/api/auth/logout/` | Logout & blacklist token | Required |
| POST | `/api/auth/token/refresh/` | Refresh access token | Public |
| GET | `/api/auth/user/` | Get user profile | Required |
| PATCH | `/api/auth/user/` | Update user profile | Required |
| POST | `/api/auth/change-password/` | Change password | Required |
| DELETE | `/api/auth/delete-account/` | Delete account | Required |

### Schedules
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/schedules/` | List all schedules | Required |
| POST | `/api/schedules/` | Create schedule (+ upload COR) | Required |
| GET | `/api/schedules/{id}/` | Get schedule details | Required |
| PUT/PATCH | `/api/schedules/{id}/` | Update schedule | Required |
| DELETE | `/api/schedules/{id}/` | Delete schedule | Required |
| POST | `/api/schedules/{id}/set-active/` | Set as active schedule | Required |
| GET | `/api/schedules/active/` | Get active schedule | Required |
| POST | `/api/schedules/clear-active/` | Clear active schedule | Required |
| GET | `/api/schedules/{id}/timetable/` | Download timetable image | Required |

### Courses (Legacy)
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/upload-cor/student/` | Upload student COR | Required |
| POST | `/api/upload-cor/faculty/` | Upload faculty COR | Required |
| GET | `/api/courses/` | Get user courses | Required |
| DELETE | `/api/courses/delete-all/` | Delete all courses | Required |

### Tasks
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/tasks/?subject_code=CODE` | Get tasks for subject | Required |
| POST | `/api/tasks/` | Create task | Required |
| GET | `/api/tasks/{id}/` | Get task details | Required |
| PUT/PATCH | `/api/tasks/{id}/` | Update task | Required |
| DELETE | `/api/tasks/{id}/` | Delete task | Required |

---

## Authentication & Security

### JWT Token Flow
1. **Login**: User submits email + password
2. **Server**: Validates credentials, generates access + refresh tokens
3. **Client**: Stores tokens in SecureStore (encrypted)
4. **Requests**: Client attaches access token in `Authorization: Bearer <token>` header
5. **Token Expiry**: Access token expires after 1 hour
6. **Refresh**: Client uses refresh token to get new access token (transparent to user)
7. **Logout**: Refresh token added to blacklist, client clears stored tokens

### Security Features
- **Password Hashing**: Django's `set_password()` uses PBKDF2
- **Token Blacklisting**: Prevents reuse of logged-out tokens
- **CORS**: Configured to allow frontend origins
- **HTTPS**: Recommended for production
- **Secure Storage**: Tokens stored in Expo SecureStore (encrypted)

### Token Configuration (Backend)
```python
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
}
```

---

## File Upload & Hybrid Extraction Processing

### Upload Flow
1. **User selects file** (PDF/image) via DocumentPicker or Camera
2. **Frontend validates** file type and size
3. **Rate limit check** (5-second cooldown)
4. **File uploaded** via multipart/form-data to backend
5. **Backend saves** file to `/media/temp/`
6. **Hybrid extraction** runs via ExtractionManager:
   - For PDFs: Try PDF text extraction first → Validate quality → Fallback to OCR if needed
   - For images: Use OCR directly
7. **Courses parsed** and validated
8. **Multi-day courses split** (MTH → M, TH)
9. **Schedule + courses saved** to database
10. **Timetable image generated** and saved
11. **Response sent** to frontend with schedule ID and extraction metadata

### Hybrid Extraction Strategy

The system intelligently chooses between two extraction methods:

**Method Selection:**
- **Digital PDFs** → PDF Text Extraction (pdfplumber) - Fast & Accurate
- **Scanned/Poor Quality PDFs** → OCR Fallback (doctr) - Robust
- **Images (JPG/PNG)** → OCR Direct (doctr) - Only Option

**Quality Validation:**
- Each extraction is scored (0.0 - 1.0 scale)
- Threshold: 60% for PDF extraction
- If score < 60%, automatically fallback to OCR

**Performance:**
- PDF Text Extraction: ~0.1-0.5 seconds (10-50x faster)
- OCR Extraction: ~3-10 seconds

### PDF Text Extraction Process (Primary)

#### StudentCORExtractor
- **Purpose**: Extract student schedules from COR documents
- **Pattern Matching**:
  - Subject Code: `[A-Z]{2,4}\d+` (e.g., BSCS125781)
  - Time: `\d{1,2}:\d{2}[AP]M` (e.g., 07:00AM)
  - Day: `(M|T|W|TH|F|S|MTH|TF|MW|MWF|...)`
  - Location: `(LR\d+|LAB\d+|GYM|...)` (classroom codes)

#### FacultyCORExtractor
- **Purpose**: Extract faculty schedules
- **Differences**: 
  - Different document format/layout
  - May include instructor names
  - Different location patterns

#### Day Code Expansion
```python
DAY_CODE_EXPANSION = {
    'M': ['M'],
    'TH': ['TH'],
    'MTH': ['M', 'TH'],
    'MWF': ['M', 'W', 'F'],
    'MTWTHF': ['M', 'T', 'W', 'TH', 'F'],
    ...
}
```
Multi-day codes are split into individual Course records for easier querying and display.

---

## Storage Strategy

### Hybrid Storage Model
SchedScan uses a **hybrid storage strategy** combining local and cloud storage:

#### Local Storage (AsyncStorage)
- **Purpose**: Offline access, caching, performance
- **Stored Data**:
  - Tasks cache (by subject code)
  - Rate limit timestamps
  - Legacy schedule migration flags

#### Cloud Storage (PostgreSQL via Django ORM)
- **Purpose**: Cross-device sync, data persistence, sharing
- **Stored Data**:
  - User accounts
  - All schedules and courses
  - Tasks (with local cache)
  - Authentication tokens (blacklist)

#### Secure Storage (Expo SecureStore)
- **Purpose**: Encrypted storage for sensitive data
- **Stored Data**:
  - JWT access token
  - JWT refresh token
  - User data (serialized JSON)

### Data Sync Strategy
1. **Create/Update**: Save to backend first, then update local cache
2. **Read**: Try backend first, fall back to local cache if offline
3. **Delete**: Delete from backend, then clear local cache
4. **Conflict Resolution**: Backend is source of truth

---

## Key Implementation Details

### 1. Active Schedule Management
- Each user can have multiple schedules, but only ONE can be active
- Setting a schedule as active automatically deactivates all others
- Implemented in `Schedule.save()` method:
```python
def save(self, *args, **kwargs):
    if self.is_active:
        Schedule.objects.filter(user=self.user, is_active=True)\
            .exclude(pk=self.pk).update(is_active=False)
    super().save(*args, **kwargs)
```

### 2. Schedule Conflict Detection
- Frontend validates time/day conflicts before saving
- Handles multi-day codes (MTH, MWF) correctly
- Compares time ranges using minutes since midnight
- Shows user-friendly conflict messages with overlapping days

```typescript
// Check if two time ranges overlap
const timesOverlap = (start1, end1, start2, end2) => {
    const start1Min = timeToMinutes(start1);
    const end1Min = timeToMinutes(end1);
    const start2Min = timeToMinutes(start2);
    const end2Min = timeToMinutes(end2);
    return start1Min < end2Min && end1Min > start2Min;
};

// Check if two day codes share any common day
const daysOverlap = (day1, day2) => {
    const days1 = expandDayCode(day1);
    const days2 = expandDayCode(day2);
    return days1.some(d1 => days2.includes(d1));
};
```

### 3. Task Sharing Across Schedules
- Tasks are linked by `subject_code`, NOT by `schedule_id`
- If user has "BSCS101" in Fall 2024 and Spring 2025, tasks are shared
- This design choice reflects real-world usage: tasks for a subject don't change across semesters

### 4. Rate Limiting (Client-Side)
- Prevents API spam by enforcing 5-second cooldown between uploads
- Stored in AsyncStorage: `last_upload_timestamp_{userId}`
- Shows remaining cooldown time to user

### 5. Time Picker Implementation
- Custom modal-based time picker (no native pickers)
- Scrollable hour/minute/period selectors
- Validates start_time < end_time before saving
- Formats: "7:00 AM", "07:00AM", "2:30 PM" all supported

### 6. Timetable Image Generation
- Creates 7-column grid (Sun-Sat)
- Time rows from 7 AM to 9 PM
- Color-coded course blocks with subject code, location
- Watermark: "Generated by SchedScan"
- Exported as PNG (downloadable by user)

### 7. Legacy Schedule Migration
- Older versions stored schedules only locally
- `migrateLegacySchedules()` clears old local-only schedules on login
- Ensures users start fresh with cloud-synced schedules

### 8. API Platform Detection
```typescript
const getApiUrl = () => {
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8000/api';  // Android emulator
  }
  return 'http://127.0.0.1:8000/api';  // iOS simulator / web
};
```
- Automatically detects platform (Android/iOS/Web)
- Uses correct localhost address for emulators

### 9. Token Refresh Flow
- Axios response interceptor catches 401 errors
- Automatically attempts token refresh using refresh token
- If refresh succeeds, retries original request with new access token
- If refresh fails, clears all auth data and redirects to login

---

## Database Schema

```sql
-- Users
CREATE TABLE api_user (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(128) NOT NULL,
    first_name VARCHAR(150),
    last_name VARCHAR(150),
    profile_picture VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Schedules
CREATE TABLE api_schedule (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES api_user(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    upload_type VARCHAR(10) CHECK (upload_type IN ('student', 'faculty')),
    is_active BOOLEAN DEFAULT FALSE,
    timetable_image VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_schedule_user_type ON api_schedule(user_id, upload_type);
CREATE INDEX idx_schedule_user_active ON api_schedule(user_id, is_active);

-- Courses
CREATE TABLE api_course (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES api_user(id) ON DELETE CASCADE,
    schedule_id INTEGER REFERENCES api_schedule(id) ON DELETE CASCADE,
    subject_code VARCHAR(50) NOT NULL,
    subject_name VARCHAR(255),
    start_time VARCHAR(20) NOT NULL,
    end_time VARCHAR(20) NOT NULL,
    day VARCHAR(10) CHECK (day IN ('M', 'T', 'W', 'TH', 'F', 'S')),
    location VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_course_user_subject ON api_course(user_id, subject_code);
CREATE INDEX idx_course_user_day ON api_course(user_id, day);

-- Tasks
CREATE TABLE api_task (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES api_user(id) ON DELETE CASCADE,
    subject_code VARCHAR(50) NOT NULL,
    text VARCHAR(500) NOT NULL,
    is_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_task_user_subject ON api_task(user_id, subject_code);
```

---

## Environment Configuration

### Backend (.env)
```bash
DJANGO_SECRET_KEY=<secret_key>
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1

DB_NAME=schedscan_db
DB_USER=postgres
DB_PASSWORD=<password>
DB_HOST=localhost
DB_PORT=5432
```

### Frontend (app.json)
```json
{
  "expo": {
    "extra": {
      "apiUrl": "http://YOUR_LOCAL_IP:8000/api"  // For physical devices
    }
  }
}
```

---

## Deployment Considerations

### Backend Production Checklist
- [ ] Set `DEBUG=False`
- [ ] Use strong `SECRET_KEY`
- [ ] Configure PostgreSQL (not SQLite)
- [ ] Set up HTTPS (nginx + SSL certificate)
- [ ] Configure CORS for production frontend URL
- [ ] Set up media file storage (AWS S3, etc.)
- [ ] Configure email backend for notifications
- [ ] Set up logging and monitoring
- [ ] Configure gunicorn/uwsgi for production server

### Frontend Production Checklist
- [ ] Update API URL to production backend
- [ ] Configure app store credentials
- [ ] Set up push notifications (Expo Push)
- [ ] Configure analytics (if needed)
- [ ] Test on physical devices (Android/iOS)
- [ ] Optimize images and assets
- [ ] Build production bundles (EAS Build)

---

## Future Enhancements

### Planned Features
1. **Push Notifications**: Reminders for upcoming classes
2. **Calendar Integration**: Sync with Google Calendar, iCal
3. **Sharing**: Share schedules with classmates/colleagues
4. **Dark Mode**: Theme support
5. **Multi-Language**: Internationalization (i18n)
6. **Premium Features**: Advanced analytics, unlimited schedules
7. **Parent Access**: Allow parents to view student schedules
8. **Offline Mode**: Full offline functionality with background sync
9. **AI Suggestions**: Smart schedule conflict resolution
10. **Export Formats**: PDF, CSV export options

---

## Troubleshooting

### Common Issues

#### Backend
- **Database Connection Error**: Verify PostgreSQL is running, check credentials
- **OCR Not Working**: Ensure doctr library is installed, check PDF/image quality
- **CORS Errors**: Add frontend URL to `CORS_ALLOWED_ORIGINS`
- **Token Expired**: Refresh token automatically, or re-login

#### Frontend
- **Cannot Connect to Backend**: Check API URL, ensure backend is running
- **Login Fails**: Verify credentials, check network connection
- **Schedule Not Syncing**: Check authentication, verify user_id
- **Upload Fails**: Check file format, verify rate limit

---

## Testing

### Backend Testing
```bash
cd backend
python manage.py test api
```

### Frontend Testing
```bash
cd frontend/schedscan
npm test
```

### Manual Testing Checklist
- [ ] User registration and login
- [ ] Upload student COR (PDF)
- [ ] Upload faculty COR (image)
- [ ] Create/edit/delete schedules
- [ ] Set active schedule
- [ ] Create/complete tasks
- [ ] Download timetable image
- [ ] Logout and re-login
- [ ] Cross-device sync (login on different device)

---

## Contact & Support

For issues, feature requests, or contributions:
- **GitHub**: [SheerMichael/SchedScan](https://github.com/SheerMichael/SchedScan)
- **Email**: [your-email@example.com]

---

## License

[Specify license here, e.g., MIT License]

---

*Last Updated: December 8, 2025*
*Version: 1.0*
*Maintainer: SchedScan Development Team*
