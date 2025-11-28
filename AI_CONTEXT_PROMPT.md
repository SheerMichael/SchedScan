# AI Agent Context Prompt for SchedScan Project

## Project Overview
You are working on **SchedScan**, a cross-platform mobile application (React Native/Expo) that uses OCR to extract course schedules from Certificate of Registration (COR) documents. The app has a Django REST API backend with PostgreSQL database.

## Technology Stack

### Frontend
- **Framework**: React Native with Expo SDK ~54.0
- **Language**: TypeScript
- **Navigation**: Expo Router (file-based routing in `app/` directory)
- **Styling**: NativeWind (Tailwind CSS for React Native)
- **State Management**: React Context (AuthContext for global user state)
- **Storage**: 
  - AsyncStorage for user-specific saved schedules
  - SecureStore for JWT tokens
- **HTTP Client**: Axios with interceptors for auth
- **Icons**: Lucide React Native

### Backend
- **Framework**: Django 5.2.7 with Django REST Framework
- **Database**: PostgreSQL
- **Authentication**: JWT (djangorestframework-simplejwt)
- **OCR Engine**: doctr (Document Text Recognition) with:
  - Detection: db_resnet50
  - Recognition: crnn_vgg16_bn
  - Spatial parsing algorithm for course extraction

## Project Structure

```
SchedScan/
├── backend/
│   ├── api/
│   │   ├── models.py (User, Course)
│   │   ├── views.py (Auth, Upload, Course endpoints)
│   │   ├── serializers.py
│   │   ├── urls.py
│   │   └── utils/
│   │       └── ocr.py (StudentCORExtractor, FacultyCORExtractor)
│   └── core/
│       ├── settings.py
│       └── urls.py
├── frontend/schedscan/
│   ├── app/
│   │   ├── Home/
│   │   │   ├── home.tsx (Dashboard with weekly calendar)
│   │   │   ├── scanner.tsx (COR upload)
│   │   │   ├── schedules.tsx (Schedule management hub)
│   │   │   ├── reminders.tsx (Reminders/notifications)
│   │   │   └── Schedules/
│   │   │       ├── student.tsx (Saved student schedules)
│   │   │       └── faculty.tsx (Saved faculty schedules)
│   │   ├── intro/ (Login/Signup flow)
│   │   └── profile/ (User profile)
│   ├── components/
│   │   ├── studentcard.tsx
│   │   ├── facultycard.tsx
│   │   ├── schedulepreviewcard.tsx
│   │   ├── reminderschedule.tsx
│   │   └── reminderdayheader.tsx
│   ├── services/
│   │   ├── api.ts (Axios instance with JWT interceptors)
│   │   ├── authService.ts (Login, register, logout)
│   │   ├── courseService.ts (Upload COR, get courses)
│   │   └── scheduleStorageService.ts (AsyncStorage management)
│   └── context/
│       └── AuthContext.tsx (Global user state)
└── .env (Environment variables)
```

## Data Models

### User Model (Django)
```python
class User(AbstractUser):
    email: EmailField (unique, primary identifier)
    first_name: CharField
    last_name: CharField
    profile_picture: ImageField (optional)
    created_at: DateTimeField
    updated_at: DateTimeField
```

### Course Model (Django)
```python
class Course(models.Model):
    id: Integer (auto)
    user: ForeignKey → User (CASCADE)
    subject_code: CharField (e.g., "BSCS125781")
    subject_name: CharField (e.g., "SOFTWARE ENGINEERING")
    start_time: CharField (e.g., "07:00AM")
    end_time: CharField (e.g., "09:00AM")
    day: CharField (choices: M, T, W, TH, F, S, TF, MW, MWF, MTH, TTH)
    location: CharField (e.g., "LR7", "LAB2")
    created_at: DateTimeField
    updated_at: DateTimeField
```

**Important**: Day field uses abbreviated codes:
- M = Monday
- T = Tuesday  
- W = Wednesday
- TH = Thursday
- F = Friday
- S = Saturday
- TF/MW/MWF/MTH/TTH = Multiple day combinations

### SavedSchedule Interface (TypeScript - AsyncStorage)
```typescript
interface SavedSchedule {
  id: string;              // Timestamp-based ID
  title: string;           // User-defined name (e.g., "Fall 2025")
  courses: Course[];       // Array of course objects
  uploadType: 'student' | 'faculty';
  uploadDate: string;      // ISO 8601 timestamp
}
```

## API Endpoints

**Base URL**: `http://192.168.1.15:8000/api/` (physical device) or `http://10.0.2.2:8000/api/` (Android emulator)

### Authentication
- `POST /auth/register/` - Register new user
- `POST /auth/login/` - Login (returns JWT tokens)
- `POST /auth/logout/` - Logout (blacklist refresh token)
- `GET /auth/user/` - Get current user profile
- `PATCH /auth/user/` - Update user profile
- `POST /auth/token/refresh/` - Refresh access token

### Courses
- `POST /upload-cor/student/` - Upload student COR (multipart/form-data)
- `POST /upload-cor/faculty/` - Upload faculty COR (multipart/form-data)
- `GET /courses/` - Get all courses for authenticated user

## Key Features & Implementation Details

### 1. User-Specific Data Isolation
- **Server-side**: All Course queries filtered by `request.user`
- **Client-side**: AsyncStorage keys include user ID: `schedules_{type}_{userId}`
- **Migration**: Legacy schedule cleanup on login/register to prevent data leakage

### 2. Authentication Flow
1. User logs in → Backend returns JWT access (1h) and refresh (7d) tokens
2. Tokens stored in SecureStore (encrypted)
3. All API requests include `Authorization: Bearer <access_token>` header
4. Axios interceptor automatically refreshes expired tokens
5. Logout blacklists refresh token and clears local storage

### 3. COR Upload & OCR Flow
1. User selects role (Student/Faculty)
2. User picks document (PDF, image from gallery, or camera)
3. Frontend uploads file to `/upload-cor/{student|faculty}/`
4. Backend saves temp file, runs OCR extraction
5. doctr model extracts text with bounding boxes
6. Spatial parsing algorithm:
   - Detects subject codes (regex: `^[A-Z]{4,}\d{5,}$`)
   - Finds subject names (horizontal proximity to code)
   - Extracts details (time, day, location via regex)
   - Assembles Course objects
7. Backend creates Course records in database
8. Frontend receives extracted courses
9. User prompted for schedule title
10. Frontend saves to AsyncStorage with user ID

### 4. Storage Architecture
- **PostgreSQL**: User profiles, extracted courses (persistent, server-side)
- **AsyncStorage**: User-specific saved schedules (local, per-device)
- **SecureStore**: JWT tokens (encrypted, secure)

### 5. Network Configuration
- **Development**: Django runs on `0.0.0.0:8000` (accessible from LAN)
- **Android Emulator**: Uses `10.0.2.2:8000`
- **iOS Simulator**: Uses `127.0.0.1:8000`
- **Physical Device**: Uses desktop IP `192.168.1.15:8000` (configured in `app.json` extra.apiUrl)

## Current State & Known Issues

### Working Features ✅
- User registration and JWT authentication
- COR upload for students (OCR extraction working)
- Course persistence in PostgreSQL
- User-specific schedule storage in AsyncStorage
- Weekly calendar dashboard
- Saved schedule management (student/faculty tabs)
- Profile management with logout

### In Progress / Placeholder 🚧
- **Faculty COR extraction**: Currently returns empty array (needs implementation)
- **Reminders page**: Has hardcoded placeholder data, needs to be populated with real courses from database

### Recent Fixes
- Fixed network connectivity for physical devices (added IP configuration)
- Removed hardcoded schedule data from home screen
- Implemented user-specific storage keys to prevent data leakage
- Added legacy schedule migration on login

## Important Code Patterns

### Getting Authenticated User
```typescript
import { useAuth } from '../../context/AuthContext';

const { user } = useAuth(); // user contains: { id, email, first_name, last_name, profile_picture }
```

### Fetching Courses from Backend
```typescript
import { courseService } from '../../services/courseService';

const courses = await courseService.getCourses(); // Returns Course[]
```

### Loading Saved Schedules from AsyncStorage
```typescript
import { scheduleStorageService } from '../../services/scheduleStorageService';

const schedules = await scheduleStorageService.getSchedules('student', user.id);
```

### Day Code Mapping
```typescript
const dayCodeToFullName: Record<string, string> = {
  'M': 'Monday',
  'T': 'Tuesday',
  'W': 'Wednesday',
  'TH': 'Thursday',
  'F': 'Friday',
  'S': 'Saturday',
  'TF': 'Tuesday/Friday',
  'MW': 'Monday/Wednesday',
  'MWF': 'Monday/Wednesday/Friday',
  'MTH': 'Monday/Thursday',
  'TTH': 'Tuesday/Thursday'
};
```

### Color Mapping by Day
```typescript
const dayColors: Record<string, string> = {
  'Monday': 'bg-primary-500',
  'Tuesday': 'bg-primary-500', 
  'Wednesday': 'bg-green-500',
  'Thursday': 'bg-blue-800',
  'Friday': 'bg-yellow-500',
  'Saturday': 'bg-purple-500'
};
```

## Development Environment

### Backend Setup
```bash
cd /home/sheer/Desktop/SchedScan
source .venv/bin/activate
cd backend
python manage.py runserver 0.0.0.0:8000
```

### Frontend Setup
```bash
cd /home/sheer/Desktop/SchedScan/frontend/schedscan
npm start
# Scan QR code with Expo Go app
```

### Environment Variables (.env)
```env
DJANGO_SECRET_KEY=django-insecure-dko%1xyodg0$vma6&)=p$m+g@%mi)4x3m7=139qp_du_5pikz+
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=127.0.0.1,localhost,10.0.2.2,192.168.1.15
DB_NAME=schedscan
DB_USER=postgres
DB_PASSWORD=walangforever
DB_HOST=localhost
DB_PORT=5432
```

## Common Tasks

### Adding a New Feature
1. If backend changes needed: Update models → migrations → serializers → views → URLs
2. If frontend changes needed: Create/update components → update services if API calls needed → update screens
3. Test on both Android emulator and physical device

### Debugging Tips
- Check Django logs in terminal running `runserver`
- Check Expo logs in terminal running `npm start`
- Use `console.log()` in frontend (appears in Expo terminal)
- Check `api.ts` for HTTP request/response logs
- Verify user authentication with `useAuth()` hook

## Code Style & Conventions
- **TypeScript**: Use strict typing, define interfaces for data structures
- **React**: Functional components with hooks, no class components
- **Styling**: NativeWind classes (e.g., `className="flex-1 bg-white"`)
- **API Calls**: Always use service layer (`authService`, `courseService`, etc.)
- **Error Handling**: Try-catch blocks with user-friendly Alert messages
- **Naming**: camelCase for variables/functions, PascalCase for components

## Security Notes
- JWT tokens stored in SecureStore (encrypted)
- All API endpoints require authentication except login/register
- User data isolated by user ID on both server and client
- CORS enabled for development (localhost, emulator IPs, LAN IP)
- Production deployment should use HTTPS and restrict ALLOWED_HOSTS

---

## Quick Reference: Current Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| User Authentication | ✅ Complete | JWT with refresh tokens |
| Student COR Upload | ✅ Complete | OCR extraction working |
| Faculty COR Upload | ⚠️ Placeholder | Returns empty array |
| Home Dashboard | ✅ Complete | Shows weekly calendar with real courses |
| Scanner Screen | ✅ Complete | Upload flow with title input |
| Saved Schedules | ✅ Complete | Student/Faculty tabs |
| **Reminders Page** | ⚠️ Needs Work | **Currently has hardcoded data, needs to use real courses** |
| Notifications | 🔲 Not Started | Empty screen |
| User Profile | ✅ Complete | Edit profile, logout |

---

**Last Updated**: November 26, 2025
**Desktop IP**: 192.168.1.15
**Database**: PostgreSQL (schedscan)
