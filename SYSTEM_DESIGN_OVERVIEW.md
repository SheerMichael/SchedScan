# SchedScan - System Design Overview

**Document Purpose**: Comprehensive system design documentation for SchedScan scheduling management application

**Last Updated**: November 25, 2025

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Data Flow](#data-flow)
4. [Data Model (ERD)](#data-model-erd)
5. [Component Design](#component-design)
6. [Technology Stack](#technology-stack)
7. [API Specifications](#api-specifications)
8. [Security & Authentication](#security--authentication)
9. [Storage Architecture](#storage-architecture)
10. [User Interface Design](#user-interface-design)

---

## Executive Summary

### What is SchedScan?

SchedScan is a **cross-platform mobile application** that digitizes and manages academic schedules using **Optical Character Recognition (OCR)** technology. It extracts course information from Certificate of Registration (COR) documents and provides intelligent schedule management for both **students** and **faculty members**.

### Core Features
- **Smart OCR Document Processing**: Upload COR documents (PDF or images) and automatically extract course schedules
- **Dual-Role Support**: Separate workflows for student and faculty users
- **User-Specific Storage**: Secure, isolated schedule data per authenticated user
- **JWT Authentication**: Email-based authentication with secure token management
- **Cross-Platform**: React Native app supporting iOS, Android, and web platforms
- **RESTful Backend**: Django-powered API with PostgreSQL database

### Key Technologies
- **Frontend**: React Native (Expo SDK 54), TypeScript, NativeWind (Tailwind CSS)
- **Backend**: Django 5.2.7, Django REST Framework, PostgreSQL
- **OCR Engine**: doctr (Document Text Recognition) with deep learning models
- **Authentication**: JWT (djangorestframework-simplejwt)
- **Storage**: PostgreSQL (server), AsyncStorage (client-side), SecureStore (tokens)

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  React Native Mobile App (Expo)                          │  │
│  │  - TypeScript                                            │  │
│  │  - React Navigation (Expo Router)                        │  │
│  │  - NativeWind Styling                                    │  │
│  │  - AsyncStorage (Local Schedules)                        │  │
│  │  - SecureStore (Auth Tokens)                             │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↕ HTTP/HTTPS (REST API)
┌─────────────────────────────────────────────────────────────────┐
│                        API GATEWAY LAYER                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Django REST Framework                                   │  │
│  │  - CORS Middleware                                       │  │
│  │  - JWT Authentication Middleware                         │  │
│  │  - Multipart Form Parser (File Uploads)                  │  │
│  │  - Token Blacklist                                       │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────────┐
│                      APPLICATION LAYER                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Auth      │  │  Course     │  │   OCR Processing        │ │
│  │  Service    │  │  Service    │  │   - doctr KIE Model     │ │
│  │  - Register │  │  - Upload   │  │   - Spatial Parser      │ │
│  │  - Login    │  │  - Extract  │  │   - Regex Extraction    │ │
│  │  - Logout   │  │  - List     │  │   - PDF/Image Support   │ │
│  │  - Profile  │  │  - Delete   │  │   - 300 DPI Processing  │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────────┐
│                       DATA LAYER                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  PostgreSQL Database                                     │  │
│  │  - User Table                                            │  │
│  │  - Course Table                                          │  │
│  │  - Token Blacklist Table                                 │  │
│  │  - Media Storage (Profile Pictures)                      │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### System Components

#### 1. **Frontend (React Native)**
- **Entry Point**: Expo Router (`app/` directory structure)
- **Authentication Context**: Global user state management
- **Services Layer**: API communication, storage management
- **UI Components**: Reusable cards, headers, navigation
- **Screens**: 
  - Intro flow (Get Started, Login, Signup)
  - Home dashboard with weekly schedule view
  - Scanner for COR uploads
  - Schedule lists (Student/Faculty)
  - Notifications & Reminders
  - User Profile

#### 2. **Backend (Django)**
- **Core Module**: Django settings, URL routing, WSGI/ASGI
- **API Module**: Models, Views, Serializers, URL patterns
- **Utils Module**: OCR extraction logic
- **Middleware**: CORS, JWT authentication, session management

#### 3. **OCR Processing Engine**
- **Model**: doctr Key Information Extraction (KIE) predictor
- **Architecture**: 
  - Detection: `db_resnet50`
  - Recognition: `crnn_vgg16_bn`
- **Processing Pipeline**:
  1. Load document (PDF at 300 DPI or images)
  2. Run KIE model for text extraction with geometry
  3. Sort elements by spatial position (Y, then X)
  4. Anchor detection (subject codes via regex)
  5. Spatial parsing (subject names on same row)
  6. Details extraction (time, day, location via regex)
  7. Course object assembly

#### 4. **Storage Architecture**
- **Server-Side (PostgreSQL)**:
  - User profiles
  - Extracted course schedules
  - Token blacklist
  - Media files
  
- **Client-Side**:
  - **AsyncStorage**: User-specific saved schedules (`schedules_{type}_{userId}`)
  - **SecureStore**: JWT access/refresh tokens, user data

---

## Data Flow

### Context Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                         USER ACTIONS                                 │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION FLOW                               │
│                                                                      │
│  1. User Registration/Login                                          │
│     └→ Frontend sends credentials to /api/auth/register or /login    │
│     └→ Backend validates and generates JWT tokens                    │
│     └→ Tokens stored in SecureStore                                  │
│     └→ User object stored in AuthContext                             │
│     └→ Legacy schedule cleanup triggered                             │
│                                                                      │
│  2. Authenticated Requests                                           │
│     └→ Access token sent in Authorization header                     │
│     └→ Django JWT middleware validates token                         │
│     └→ User identity extracted from token                            │
│     └→ Request proceeds to view handler                              │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│                    CORE WORKFLOW: COR UPLOAD                         │
│                                                                      │
│  STEP 1: Document Selection                                          │
│  ┌────────────────────────────────────────────────────┐             │
│  │  User selects role (Student/Faculty)               │             │
│  │  User picks file source:                           │             │
│  │    • Document Picker (PDF)                         │             │
│  │    • Image Gallery                                 │             │
│  │    • Camera Capture                                │             │
│  └────────────────────────────────────────────────────┘             │
│                       ↓                                              │
│  STEP 2: File Upload & Processing                                    │
│  ┌────────────────────────────────────────────────────┐             │
│  │  Frontend: FormData creation with file             │             │
│  │  POST /api/upload-cor/{student|faculty}/           │             │
│  │  Headers: Authorization: Bearer <token>            │             │
│  │                                                     │             │
│  │  Backend: File validation                          │             │
│  │    • Check file extension (.pdf, .jpg, .png)       │             │
│  │    • Save to temp storage                          │             │
│  │    • Log upload event                              │             │
│  └────────────────────────────────────────────────────┘             │
│                       ↓                                              │
│  STEP 3: OCR Extraction                                              │
│  ┌────────────────────────────────────────────────────┐             │
│  │  Load document via doctr                           │             │
│  │    • PDFs: 300 DPI resolution                      │             │
│  │    • Images: Original resolution                   │             │
│  │                                                     │             │
│  │  Run KIE predictor model                           │             │
│  │    • Text extraction with bounding boxes           │             │
│  │    • Geometry-based element sorting                │             │
│  │                                                     │             │
│  │  Spatial parsing algorithm:                        │             │
│  │    1. Detect subject code anchors (regex)          │             │
│  │    2. Find subject names (horizontal proximity)    │             │
│  │    3. Extract details blob (vertical proximity)    │             │
│  │    4. Parse time/day/location (regex patterns)     │             │
│  │    5. Assemble course objects                      │             │
│  └────────────────────────────────────────────────────┘             │
│                       ↓                                              │
│  STEP 4: Database Persistence                                        │
│  ┌────────────────────────────────────────────────────┐             │
│  │  For each extracted course:                        │             │
│  │    Course.objects.create(                          │             │
│  │      user=request.user,                            │             │
│  │      subject_code=...,                             │             │
│  │      subject_name=...,                             │             │
│  │      start_time=...,                               │             │
│  │      end_time=...,                                 │             │
│  │      day=...,                                      │             │
│  │      location=...                                  │             │
│  │    )                                               │             │
│  │                                                     │             │
│  │  Cleanup temp file                                 │             │
│  │  Return course list to frontend                    │             │
│  └────────────────────────────────────────────────────┘             │
│                       ↓                                              │
│  STEP 5: Client-Side Storage                                         │
│  ┌────────────────────────────────────────────────────┐             │
│  │  User prompted for schedule title                  │             │
│  │  scheduleStorageService.saveSchedule(              │             │
│  │    title,                                          │             │
│  │    courses,                                        │             │
│  │    uploadType,                                     │             │
│  │    user.id  ← USER-SPECIFIC KEY                    │             │
│  │  )                                                 │             │
│  │                                                     │             │
│  │  AsyncStorage key: schedules_{type}_{userId}       │             │
│  │  Data structure:                                   │             │
│  │    [                                               │             │
│  │      {                                             │             │
│  │        id: timestamp,                              │             │
│  │        title: "Fall 2025",                         │             │
│  │        courses: [...],                             │             │
│  │        uploadType: "student",                      │             │
│  │        uploadDate: ISO string                      │             │
│  │      }                                             │             │
│  │    ]                                               │             │
│  └────────────────────────────────────────────────────┘             │
│                       ↓                                              │
│  STEP 6: Navigation to Schedule View                                 │
│  ┌────────────────────────────────────────────────────┐             │
│  │  Router navigates to:                              │             │
│  │    /Home/Schedules/student or                      │             │
│  │    /Home/Schedules/faculty                         │             │
│  │                                                     │             │
│  │  Screen loads schedules from AsyncStorage          │             │
│  │  Displays schedule preview cards                   │             │
│  └────────────────────────────────────────────────────┘             │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│                    SCHEDULE VIEWING FLOW                             │
│                                                                      │
│  Dashboard (Home Screen):                                            │
│    • GET /api/courses/ → Fetch all user courses from server         │
│    • Display weekly calendar grid                                   │
│    • Show course cards by day                                       │
│                                                                      │
│  Saved Schedules (Student/Faculty Tabs):                             │
│    • Load from AsyncStorage using user.id                           │
│    • Display list of saved schedules with title and date            │
│    • SchedulePreviewCard component shows weekly grid               │
│    • Click to expand and view full details                          │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│                    LOGOUT FLOW                                       │
│                                                                      │
│  1. User clicks logout in profile screen                             │
│  2. scheduleStorageService.clearAllSchedules(user.id)                │
│     └→ Removes user-specific schedule keys                          │
│     └→ Removes legacy schedule keys (backward compatibility)         │
│  3. authService.logout()                                             │
│     └→ POST /api/auth/logout/ with refresh token                    │
│     └→ Backend blacklists refresh token                             │
│     └→ SecureStore tokens deleted                                   │
│  4. AuthContext resets user state                                    │
│  5. Router navigates to login screen                                 │
└──────────────────────────────────────────────────────────────────────┘
```

### Data Flow Diagram (DFD)

#### Level 0: Context Diagram
```
┌──────────┐                                        ┌──────────┐
│          │   Registration/Login Credentials       │          │
│  User    │──────────────────────────────────────→ │          │
│ (Student │                                        │          │
│    or    │   ← JWT Tokens & User Profile          │          │
│ Faculty) │                                        │ SchedScan│
│          │   COR Document Upload                  │  System  │
│          │──────────────────────────────────────→ │          │
│          │                                        │          │
│          │   ← Extracted Course Schedules         │          │
│          │                                        │          │
│          │   Schedule Management Actions          │          │
│          │──────────────────────────────────────→ │          │
│          │                                        │          │
│          │   ← Schedule Data & Notifications      │          │
└──────────┘                                        └──────────┘
```

#### Level 1: System Components DFD
```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   ┌──────────┐                                                      │
│   │  User    │                                                      │
│   └─────┬────┘                                                      │
│         │                                                           │
│         │ ① Credentials                                            │
│         ↓                                                           │
│   ┌─────────────────┐          ② Validate          ┌────────────┐ │
│   │  Authentication │─────────────────────────────→ │   User DB  │ │
│   │     Service     │ ← User Record                 └────────────┘ │
│   └────────┬────────┘                                              │
│            │ ③ JWT Tokens                                          │
│            ↓                                                        │
│   ┌─────────────────┐                                              │
│   │   Client App    │                                              │
│   │  (Secure Store) │                                              │
│   └────────┬────────┘                                              │
│            │                                                        │
│            │ ④ COR Upload (with Auth Token)                        │
│            ↓                                                        │
│   ┌─────────────────┐          ⑤ File Data         ┌────────────┐ │
│   │  File Upload    │────────────────────────────→  │ Temp Storage│ │
│   │    Handler      │                               └────────────┘ │
│   └────────┬────────┘                                              │
│            │ ⑥ File Path                                           │
│            ↓                                                        │
│   ┌─────────────────┐                                              │
│   │  OCR Processing │                                              │
│   │     Engine      │                                              │
│   │  (doctr Model)  │                                              │
│   └────────┬────────┘                                              │
│            │ ⑦ Extracted Course Data                               │
│            ↓                                                        │
│   ┌─────────────────┐          ⑧ Course Objects    ┌────────────┐ │
│   │  Course Manager │─────────────────────────────→ │ Course DB  │ │
│   │     Service     │ ← Saved Courses               └────────────┘ │
│   └────────┬────────┘                                              │
│            │ ⑨ Course List JSON                                    │
│            ↓                                                        │
│   ┌─────────────────┐                                              │
│   │   Client App    │                                              │
│   │ (AsyncStorage)  │                                              │
│   └────────┬────────┘                                              │
│            │ ⑩ User Schedule Views                                 │
│            ↓                                                        │
│   ┌─────────────────┐          ⑪ Query Courses      ┌────────────┐│
│   │  Schedule View  │────────────────────────────→  │ Course DB  ││
│   │     Service     │ ← Course Data                 └────────────┘│
│   └─────────────────┘                                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Model (ERD)

### Entity Relationship Diagram

```
┌──────────────────────────────────────────────────────┐
│                     User                             │
├──────────────────────────────────────────────────────┤
│ PK  id: INTEGER (Auto)                               │
│     email: VARCHAR(255) UNIQUE NOT NULL              │
│     password: VARCHAR(128) HASHED                    │
│     first_name: VARCHAR(150) NOT NULL                │
│     last_name: VARCHAR(150) NOT NULL                 │
│     profile_picture: FILE (Nullable)                 │
│     is_staff: BOOLEAN DEFAULT FALSE                  │
│     is_active: BOOLEAN DEFAULT TRUE                  │
│     is_superuser: BOOLEAN DEFAULT FALSE              │
│     created_at: TIMESTAMP WITH TIME ZONE             │
│     updated_at: TIMESTAMP WITH TIME ZONE             │
├──────────────────────────────────────────────────────┤
│ Methods:                                             │
│   • get_full_name() → String                         │
│   • get_short_name() → String                        │
│   • __str__() → email                                │
└──────────────────────────────────────────────────────┘
                        │
                        │ 1:N (One-to-Many)
                        │
                        ↓
┌──────────────────────────────────────────────────────┐
│                    Course                            │
├──────────────────────────────────────────────────────┤
│ PK  id: INTEGER (Auto)                               │
│ FK  user: INTEGER → User.id (CASCADE)                │
│     subject_code: VARCHAR(50) NOT NULL               │
│     subject_name: VARCHAR(255)                       │
│     start_time: VARCHAR(20) NOT NULL                 │
│     end_time: VARCHAR(20) NOT NULL                   │
│     day: VARCHAR(10) (Choices: M, T, W, TH, F, S,    │
│          TF, MW, MWF, MTH, TTH)                      │
│     location: VARCHAR(100)                           │
│     created_at: TIMESTAMP WITH TIME ZONE             │
│     updated_at: TIMESTAMP WITH TIME ZONE             │
├──────────────────────────────────────────────────────┤
│ Indexes:                                             │
│   • (user, subject_code) - Composite                 │
│   • (user, day) - Composite                          │
├──────────────────────────────────────────────────────┤
│ Ordering: [day, start_time]                          │
└──────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────┐
│          OutstandingToken (JWT)                      │
├──────────────────────────────────────────────────────┤
│ PK  id: INTEGER (Auto)                               │
│ FK  user: INTEGER → User.id (CASCADE, Nullable)      │
│     jti: VARCHAR(255) UNIQUE NOT NULL                │
│     token: TEXT NOT NULL                             │
│     created_at: TIMESTAMP WITH TIME ZONE             │
│     expires_at: TIMESTAMP WITH TIME ZONE             │
└──────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────┐
│         BlacklistedToken (JWT)                       │
├──────────────────────────────────────────────────────┤
│ PK  id: INTEGER (Auto)                               │
│ FK  token: INTEGER → OutstandingToken.id (CASCADE)   │
│     blacklisted_at: TIMESTAMP WITH TIME ZONE         │
└──────────────────────────────────────────────────────┘
```

### Relationships

1. **User → Course** (One-to-Many)
   - **Cardinality**: One User can have multiple Courses
   - **Foreign Key**: `Course.user` → `User.id`
   - **Delete Rule**: CASCADE (if user deleted, all courses deleted)
   - **Related Name**: `user.courses.all()`

2. **User → OutstandingToken** (One-to-Many)
   - **Cardinality**: One User can have multiple active tokens
   - **Foreign Key**: `OutstandingToken.user` → `User.id`
   - **Delete Rule**: CASCADE
   - **Purpose**: Track all issued refresh tokens

3. **OutstandingToken → BlacklistedToken** (One-to-One)
   - **Cardinality**: One token can be blacklisted once
   - **Foreign Key**: `BlacklistedToken.token` → `OutstandingToken.id`
   - **Delete Rule**: CASCADE
   - **Purpose**: Invalidate tokens on logout

### Database Indexes

**Course Table**:
```sql
CREATE INDEX idx_course_user_subject ON api_course(user_id, subject_code);
CREATE INDEX idx_course_user_day ON api_course(user_id, day);
```

**Performance Optimization**:
- Fast lookups for "all courses by user and subject"
- Efficient filtering for "user's Monday classes"

---

## Component Design

### Frontend Component Hierarchy

```
App Root (Expo Router)
├── _layout.tsx (Root Layout with AuthContext Provider)
│
├── index.tsx (Entry/Redirect)
│
├── intro/
│   ├── intro.tsx (Welcome Screen)
│   ├── getstarted.tsx (Onboarding)
│   ├── login.tsx (Login Form)
│   └── signup.tsx (Registration Form)
│
├── Home/
│   ├── _layout.tsx (Tabs Navigator)
│   ├── home.tsx (Dashboard - Weekly Calendar)
│   ├── scanner.tsx (COR Upload Screen)
│   ├── schedules.tsx (Schedule Management Hub)
│   ├── reminders.tsx (Reminders List)
│   ├── notification.tsx (Notification Center)
│   ├── Footer.tsx (Bottom Tab Bar)
│   │
│   └── Schedules/
│       ├── student.tsx (Saved Student Schedules)
│       └── faculty.tsx (Saved Faculty Schedules)
│
└── profile/
    └── user_profile.tsx (User Settings & Logout)

Components/
├── studentcard.tsx (Student Schedule Card)
├── facultycard.tsx (Faculty Schedule Card)
├── schedulepreviewcard.tsx (Calendar Grid View)
├── notifitem.tsx (Notification Item)
├── reminderschedule.tsx (Reminder Card)
└── reminderdayheader.tsx (Day Section Header)

Context/
└── AuthContext.tsx (Global Auth State)

Services/
├── api.ts (Axios HTTP Client)
├── authService.ts (Auth API Calls)
├── courseService.ts (Course API Calls)
└── scheduleStorageService.ts (AsyncStorage Manager)
```

### Backend Component Structure

```
backend/
├── core/
│   ├── settings.py (Django Configuration)
│   ├── urls.py (Root URL Routing)
│   ├── wsgi.py (WSGI Server Config)
│   └── asgi.py (ASGI Server Config)
│
└── api/
    ├── models.py (Data Models)
    │   ├── CustomUserManager
    │   ├── User (Custom User Model)
    │   └── Course
    │
    ├── serializers.py (DRF Serializers)
    │   ├── RegisterSerializer
    │   ├── LoginSerializer
    │   ├── UserSerializer
    │   ├── UserWithTokenSerializer
    │   └── CourseSerializer
    │
    ├── views.py (API Endpoints)
    │   ├── RegisterView
    │   ├── LoginView
    │   ├── LogoutView
    │   ├── UserProfileView
    │   ├── BaseCORUploadView
    │   ├── UploadStudentCORView
    │   ├── UploadFacultyCORView
    │   └── UserCoursesView
    │
    ├── urls.py (API URL Patterns)
    │
    └── utils/
        └── ocr.py (OCR Processing)
            ├── BaseCORExtractor (Abstract)
            ├── StudentCORExtractor
            ├── FacultyCORExtractor
            └── get_cor_extractor() (Factory)
```

---

## Technology Stack

### Frontend Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| **React Native** | 0.81.4 | Cross-platform mobile framework |
| **Expo** | ~54.0 | Development platform & build tools |
| **TypeScript** | ^5.7.2 | Type-safe JavaScript |
| **React Navigation** | ^7.1.6 | Navigation library |
| **Expo Router** | ^5.0.0 | File-based routing |
| **NativeWind** | ^4.1.23 | Tailwind CSS for RN |
| **Lucide React Native** | ^1.0.0 | Icon library |
| **Axios** | ^1.7.9 | HTTP client |
| **AsyncStorage** | 2.2.0 | Local key-value storage |
| **SecureStore** | 14.0.0 | Secure token storage |
| **Document Picker** | 13.0.2 | File selection |
| **Image Picker** | 16.0.4 | Image/camera access |

### Backend Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| **Django** | 5.2.7 | Python web framework |
| **Django REST Framework** | Latest | RESTful API toolkit |
| **djangorestframework-simplejwt** | Latest | JWT authentication |
| **PostgreSQL** | Latest | Relational database |
| **psycopg2-binary** | Latest | PostgreSQL adapter |
| **doctr** | Latest | OCR library |
| **python-dotenv** | Latest | Environment variable management |
| **Pillow** | Latest | Image processing |
| **CORS Headers** | Latest | Cross-origin resource sharing |

### OCR Processing Stack

| Component | Details |
|-----------|---------|
| **Library** | doctr (Document Text Recognition) |
| **Model Type** | KIE (Key Information Extraction) Predictor |
| **Detection Model** | db_resnet50 (Differentiable Binarization) |
| **Recognition Model** | crnn_vgg16_bn (Convolutional RNN with VGG16) |
| **Preprocessing** | 300 DPI for PDFs, original resolution for images |
| **Backend** | PyTorch (deep learning framework) |

---

## API Specifications

### Base Configuration

- **Base URL**: `http://127.0.0.1:8000/api/`
- **Content Types**: `application/json`, `multipart/form-data`
- **Authentication**: JWT Bearer Token in `Authorization` header
- **Token Lifetime**: Access (1 hour), Refresh (7 days)

### Endpoints

#### 1. Authentication Endpoints

**POST /api/auth/register/**
```json
Request (multipart/form-data):
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "first_name": "John",
  "last_name": "Doe",
  "profile_picture": <FILE> (optional)
}

Response (201 Created):
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "profile_picture": "http://127.0.0.1:8000/media/profile_pictures/image.jpg",
    "created_at": "2025-11-25T10:00:00Z"
  },
  "tokens": {
    "access": "eyJ0eXAiOiJKV1QiLCJhbGc...",
    "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc..."
  },
  "message": "User registered successfully"
}
```

**POST /api/auth/login/**
```json
Request:
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}

Response (200 OK):
{
  "user": { /* same as register */ },
  "tokens": { /* JWT tokens */ },
  "message": "Login successful"
}
```

**POST /api/auth/logout/**
```json
Request (Authenticated):
Headers: { "Authorization": "Bearer <access_token>" }
Body: { "refresh": "<refresh_token>" }

Response (200 OK):
{
  "message": "Logout successful"
}
```

**GET /api/auth/user/**
```json
Request (Authenticated):
Headers: { "Authorization": "Bearer <access_token>" }

Response (200 OK):
{
  "id": 1,
  "email": "user@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "profile_picture": "http://...",
  "created_at": "2025-11-25T10:00:00Z",
  "updated_at": "2025-11-25T10:00:00Z"
}
```

**PATCH /api/auth/user/**
```json
Request (Authenticated, multipart/form-data):
{
  "first_name": "Jonathan",
  "profile_picture": <FILE> (optional)
}

Response (200 OK):
{
  "id": 1,
  "email": "user@example.com",
  "first_name": "Jonathan",
  "last_name": "Doe",
  /* ... */
}
```

**POST /api/auth/token/refresh/**
```json
Request:
{
  "refresh": "<refresh_token>"
}

Response (200 OK):
{
  "access": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc..."  // New refresh token (rotation enabled)
}
```

#### 2. Course/COR Upload Endpoints

**POST /api/upload-cor/student/**
```json
Request (Authenticated, multipart/form-data):
Headers: { "Authorization": "Bearer <access_token>" }
Body: {
  "file": <PDF or IMAGE FILE>
}

Response (201 Created):
{
  "message": "Successfully processed STUDENT COR and created 5 courses",
  "courses": [
    {
      "id": 1,
      "user": 1,
      "subject_code": "BSCS125781",
      "subject_name": "SOFTWARE ENGINEERING",
      "start_time": "07:00AM",
      "end_time": "09:00AM",
      "day": "S",
      "location": "LR7",
      "created_at": "2025-11-25T10:05:00Z",
      "updated_at": "2025-11-25T10:05:00Z"
    },
    /* ... more courses ... */
  ],
  "total_courses": 5,
  "upload_type": "student"
}

Error Response (400 Bad Request):
{
  "error": "Invalid file type. Allowed types: .pdf, .png, .jpg, .jpeg"
}

Error Response (500 Internal Server Error):
{
  "error": "Failed to process the document",
  "details": "Error message details"
}
```

**POST /api/upload-cor/faculty/**
- Same format as student endpoint
- Returns `upload_type: "faculty"`
- Currently returns empty courses array (placeholder)

**GET /api/courses/**
```json
Request (Authenticated):
Headers: { "Authorization": "Bearer <access_token>" }

Response (200 OK):
[
  {
    "id": 1,
    "user": 1,
    "subject_code": "BSCS125781",
    "subject_name": "SOFTWARE ENGINEERING",
    "start_time": "07:00AM",
    "end_time": "09:00AM",
    "day": "S",
    "location": "LR7",
    "created_at": "2025-11-25T10:05:00Z",
    "updated_at": "2025-11-25T10:05:00Z"
  },
  /* ... more courses ... */
]
```

### Error Handling

All API endpoints follow consistent error response format:

```json
{
  "error": "Error message summary",
  "details": "Detailed error information (optional)",
  "field_errors": {  // For validation errors
    "email": ["This field is required."],
    "password": ["Password must be at least 8 characters."]
  }
}
```

**HTTP Status Codes**:
- `200 OK`: Successful GET, PATCH
- `201 Created`: Successful POST (resource created)
- `400 Bad Request`: Validation errors, malformed requests
- `401 Unauthorized`: Missing or invalid authentication
- `403 Forbidden`: Valid token but insufficient permissions
- `404 Not Found`: Resource doesn't exist
- `500 Internal Server Error`: Server-side processing errors

---

## Security & Authentication

### JWT Authentication Flow

```
┌──────────┐                                          ┌──────────┐
│  Client  │                                          │  Server  │
└────┬─────┘                                          └────┬─────┘
     │                                                      │
     │  1. POST /auth/register or /auth/login              │
     │  Body: { email, password }                          │
     │─────────────────────────────────────────────────────→│
     │                                                      │
     │                2. Validate Credentials               │
     │                3. Generate JWT Tokens                │
     │                   - Access Token (1 hour)            │
     │                   - Refresh Token (7 days)           │
     │                4. Store in OutstandingToken table    │
     │                                                      │
     │  ← Response: { user, tokens }                        │
     │←─────────────────────────────────────────────────────│
     │                                                      │
     │  5. Store Tokens in SecureStore                      │
     │     - access_token                                   │
     │     - refresh_token                                  │
     │     - user (JSON)                                    │
     │                                                      │
     │  6. Authenticated Request                            │
     │  Header: Authorization: Bearer <access_token>        │
     │─────────────────────────────────────────────────────→│
     │                                                      │
     │                7. JWT Middleware Validates Token     │
     │                   - Verify signature (HS256)         │
     │                   - Check expiration                 │
     │                   - Check blacklist                  │
     │                   - Extract user_id from payload     │
     │                8. Attach request.user                │
     │                9. Process Request                    │
     │                                                      │
     │  ← Response: Protected Resource                      │
     │←─────────────────────────────────────────────────────│
     │                                                      │
     │  10. Access Token Expires (after 1 hour)             │
     │                                                      │
     │  11. POST /auth/token/refresh/                       │
     │  Body: { refresh: <refresh_token> }                  │
     │─────────────────────────────────────────────────────→│
     │                                                      │
     │                12. Validate Refresh Token            │
     │                13. Blacklist Old Refresh Token       │
     │                14. Generate New Token Pair           │
     │                                                      │
     │  ← Response: { access, refresh }                     │
     │←─────────────────────────────────────────────────────│
     │                                                      │
     │  15. Update SecureStore with New Tokens              │
     │                                                      │
     │  16. POST /auth/logout/                              │
     │  Body: { refresh: <refresh_token> }                  │
     │─────────────────────────────────────────────────────→│
     │                                                      │
     │                17. Add Token to Blacklist            │
     │                18. Invalidate Token                  │
     │                                                      │
     │  ← Response: { message: "Logout successful" }        │
     │←─────────────────────────────────────────────────────│
     │                                                      │
     │  19. Clear SecureStore                               │
     │      - Delete access_token                           │
     │      - Delete refresh_token                          │
     │      - Delete user                                   │
     │  20. Clear AsyncStorage Schedules                    │
     │  21. Reset AuthContext                               │
     │  22. Navigate to Login Screen                        │
     │                                                      │
└─────┘                                                └─────────┘
```

### JWT Token Structure

**Access Token Payload**:
```json
{
  "token_type": "access",
  "exp": 1732538400,  // Expiration (1 hour)
  "iat": 1732534800,  // Issued at
  "jti": "abc123...", // JWT ID
  "user_id": 1
}
```

**Refresh Token Payload**:
```json
{
  "token_type": "refresh",
  "exp": 1733139600,  // Expiration (7 days)
  "iat": 1732534800,  // Issued at
  "jti": "def456...", // JWT ID
  "user_id": 1
}
```

### Security Measures

1. **Password Hashing**
   - Algorithm: Django's PBKDF2 with SHA256
   - Automatic salting
   - 390,000 iterations (Django 5.x default)

2. **Token Security**
   - HMAC-SHA256 signing algorithm
   - Secret key stored in environment variables
   - Token rotation on refresh (old tokens blacklisted)
   - Secure storage via Expo SecureStore (encrypted)

3. **API Security**
   - CORS configured for trusted origins
   - CSRF protection for session-based requests
   - File upload validation (type, size)
   - User-specific data isolation (all queries filtered by `request.user`)

4. **Data Isolation**
   - Server-side: All course queries filtered by authenticated user ID
   - Client-side: AsyncStorage keys include user ID (`schedules_{type}_{userId}`)
   - No cross-user data access possible

5. **HTTPS Enforcement**
   - Production deployment requires HTTPS
   - Secure cookie flags enabled in production
   - HSTS headers configured

---

## Storage Architecture

### Server-Side Storage (PostgreSQL)

**Database**: `schedscan_db`

**Tables**:
1. `api_user` - User profiles
2. `api_course` - Extracted course schedules
3. `token_blacklist_outstandingtoken` - Active refresh tokens
4. `token_blacklist_blacklistedtoken` - Invalidated tokens

**Media Storage**:
- **Directory**: `backend/media/`
- **Profile Pictures**: `media/profile_pictures/`
- **Temporary Uploads**: `media/temp/` (auto-cleaned after processing)

**Backup Strategy** (Recommended):
- Daily PostgreSQL dumps
- Media file backups
- Environment variable version control

### Client-Side Storage

#### SecureStore (Encrypted)
**Purpose**: Sensitive authentication data
**Storage Location**: Platform-specific secure storage (Keychain on iOS, EncryptedSharedPreferences on Android)

**Keys**:
- `access_token`: JWT access token
- `refresh_token`: JWT refresh token
- `user`: Serialized user object JSON

#### AsyncStorage (Unencrypted)
**Purpose**: User-specific schedule data
**Storage Location**: Platform-specific local storage

**Key Pattern**:
```
schedules_{uploadType}_{userId}
Example: schedules_student_1
Example: schedules_faculty_1
```

**Data Structure**:
```typescript
interface SavedSchedule {
  id: string;              // Timestamp-based ID
  title: string;           // User-defined name
  courses: Course[];       // Array of course objects
  uploadType: 'student' | 'faculty';
  uploadDate: string;      // ISO 8601 timestamp
}

// Stored as JSON array
AsyncStorage['schedules_student_1'] = [
  {
    id: "1732534800000",
    title: "Fall 2025",
    courses: [/* Course objects */],
    uploadType: "student",
    uploadDate: "2025-11-25T10:00:00.000Z"
  },
  /* ... more schedules ... */
]
```

**Migration Strategy**:
- On login/register: `migrateLegacySchedules(userId)` removes old non-user-specific keys
- Legacy keys: `schedules_student`, `schedules_faculty` (deprecated)

---

## User Interface Design

### Design System

**Color Palette**:
```
Primary Colors:
  - primary-500: #EF4444 (Red-500)
  - primary-600: #DC2626 (Red-600) 
  - primary-900: #7F1D1D (Red-900)
  
Accent Colors:
  - accent-maroon: #800000
  - B88080: Pinkish-brown (background)
  
Neutral Colors:
  - white: #FFFFFF
  - gray-200: #E5E7EB
  - gray-600: #4B5563
  - gray-700: #374151
  - gray-800: #1F2937
  - black: #000000
```

**Typography**:
- Font Family: System default (SF Pro on iOS, Roboto on Android)
- Weights: Regular (400), Semibold (600), Bold (700)
- Sizes: xs, sm, base, lg, xl, 2xl, 3xl, 4xl

**Spacing**: Tailwind 4px increments (1 = 4px, 2 = 8px, 4 = 16px, etc.)

### Screen Designs

#### 1. Welcome/Onboarding Flow
- **intro.tsx**: Splash screen with app logo
- **getstarted.tsx**: Feature highlights, call-to-action buttons
- **login.tsx**: Email + password form, "Forgot Password" link, navigation to signup
- **signup.tsx**: Registration form with profile picture upload

#### 2. Home Dashboard (home.tsx)
**Layout**:
- Top: User greeting, current date
- Center: Weekly calendar grid (7 days)
- Cards: Course blocks with subject, time, location
- Color-coded by day
- Bottom: Tab navigation (Home, Scanner, Schedules, Reminders, Notifications)

#### 3. Scanner Screen (scanner.tsx)
**Layout**:
- Top: Back button, "Scan as" title
- Center: Camera viewfinder with corner brackets
- Role Selection Modal: "Faculty" vs "Student" buttons
- Bottom Action Bar:
  - Gallery icon (left)
  - Capture button (center, large, circular)
  - Document picker icon (right)
- Post-Upload: Title input modal with "Cancel" and "Save Schedule" buttons

#### 4. Schedule Management (schedules.tsx → student.tsx / faculty.tsx)
**Layout**:
- Tabs: "Student" and "Faculty"
- List of saved schedules:
  - Title
  - Upload date
  - Course count
  - Preview grid (SchedulePreviewCard)
- Empty state: "No schedules saved" message

#### 5. User Profile (user_profile.tsx)
**Layout**:
- Profile picture (circular)
- User name and email
- Edit profile button
- Logout button (red, at bottom)
- Logout confirmation modal

### Responsive Design
- Mobile-first approach
- Supports iOS, Android, and web
- Adaptive layouts for different screen sizes
- Safe area handling for notched devices

---

## Proposed Prototype Features

### Phase 1: Current Implementation ✅
- [x] User registration and authentication
- [x] JWT token management with refresh and blacklisting
- [x] COR document upload (PDF and images)
- [x] Student COR OCR extraction (doctr-based spatial parsing)
- [x] Course data persistence in PostgreSQL
- [x] User-specific schedule storage in AsyncStorage
- [x] Weekly calendar dashboard view
- [x] Saved schedule management (student/faculty tabs)
- [x] Profile management with picture upload
- [x] Logout with data cleanup

### Phase 2: In Progress / Planned 🚧
- [ ] Faculty COR extraction implementation (currently placeholder)
- [ ] Course conflict detection (overlapping schedules)
- [ ] Schedule sharing functionality (export/import)
- [ ] Reminder system with notifications
- [ ] Calendar integration (Google Calendar, Apple Calendar)
- [ ] Dark mode support
- [ ] Offline mode with data sync

### Phase 3: Future Enhancements 🔮
- [ ] AI-powered schedule optimization
- [ ] Group scheduling for teams/study groups
- [ ] Event creation and management
- [ ] Location-based reminders (geofencing)
- [ ] Multi-semester/year schedule management
- [ ] Analytics dashboard (study hours, attendance tracking)
- [ ] Social features (find classmates, share notes)
- [ ] Integration with learning management systems (LMS)
- [ ] Voice input for quick event creation
- [ ] Widget support for home screen

---

## Performance Considerations

### OCR Processing
- **PDF Processing**: 300 DPI for optimal text recognition
- **Average Processing Time**: 5-15 seconds per document
- **Timeout**: 30 seconds for upload requests
- **Model Loading**: Lazy initialization (first request only)

### Database Optimization
- **Indexes**: Composite indexes on (user, subject_code) and (user, day)
- **Query Optimization**: Always filter by `request.user` to leverage indexes
- **Connection Pooling**: Configured in Django settings

### Client-Side Performance
- **Lazy Loading**: Schedules loaded only when screens are focused
- **Memoization**: React hooks (useCallback, useMemo) prevent unnecessary re-renders
- **Image Optimization**: Profile pictures compressed before upload
- **AsyncStorage**: Batch operations with `multiRemove` for cleanup

---

## Deployment Architecture

### Development Environment
- **Backend**: Django dev server on `http://127.0.0.1:8000`
- **Database**: PostgreSQL local instance
- **Frontend**: Expo development server on `http://localhost:8081`
- **Testing**: Expo Go app for mobile testing

### Production Recommendations

**Backend**:
- **Server**: Gunicorn/uWSGI with Nginx reverse proxy
- **Database**: Managed PostgreSQL (AWS RDS, Google Cloud SQL)
- **Media Storage**: Cloud storage (AWS S3, Google Cloud Storage)
- **Environment**: Docker containers, Kubernetes orchestration

**Frontend**:
- **Build**: Expo Application Services (EAS Build)
- **Distribution**: 
  - iOS: Apple App Store (via TestFlight for beta)
  - Android: Google Play Store
  - Web: Static hosting (Netlify, Vercel)

**CI/CD**:
- GitHub Actions for automated testing
- EAS Build for mobile app builds
- Automated database migrations on deployment

---

## Testing Strategy

### Unit Testing
- **Backend**: Django TestCase for models, views, serializers
- **Frontend**: Jest + React Native Testing Library

### Integration Testing
- **API Testing**: Postman/Insomnia collections
- **End-to-End**: Detox for React Native

### OCR Testing
- **Test Dataset**: Sample COR documents from different institutions
- **Accuracy Metrics**: Precision, recall, F1-score for extracted fields
- **Regression Testing**: Baseline documents for each release

---

## Conclusion

SchedScan is a comprehensive, production-ready scheduling management system that combines modern mobile development practices with advanced OCR technology. The architecture is designed for scalability, security, and user experience, with clear separation of concerns and well-defined data flows.

**Key Strengths**:
1. **User-Centric Design**: Intuitive interface, role-based workflows
2. **Security First**: JWT authentication, data isolation, encrypted storage
3. **Scalable Architecture**: Modular components, clean API design
4. **Advanced OCR**: Spatial parsing with high accuracy
5. **Cross-Platform**: Single codebase for iOS, Android, web

**Ready for Documentation**: This system design provides all necessary details for creating Context Flow Diagrams, Data Flow Diagrams, ERD, and prototype documentation.

---

**Document Version**: 1.0  
**Generated**: November 25, 2025  
**Contact**: [Your Contact Information]
