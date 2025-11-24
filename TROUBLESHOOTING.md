# Troubleshooting: 404 Error on Upload

## Problem
Getting a 404 error when trying to upload/scan files:
```
API Error: { message: 'Request failed with status code 404', status: 404, url: '/upload-cor/' }
```

## Root Cause
The frontend code is updated to use the new endpoints (`/upload-cor/student/` or `/upload-cor/faculty/`), but the Metro bundler (React Native/Expo dev server) is serving cached JavaScript that still references the old `/upload-cor/` endpoint.

## Solution

### Option 1: Restart Metro Bundler with Cache Clear (Recommended)
```bash
# Stop the current Metro bundler (Ctrl+C)
# Then restart with cache cleared:
cd frontend/schedscan
npx expo start --clear
```

### Option 2: Force Reload in App
In the Expo app, shake the device or press:
- **Android Emulator**: Ctrl+M or Cmd+M
- **iOS Simulator**: Ctrl+D or Cmd+D
Then select "Reload" from the menu

### Option 3: Restart Everything
```bash
# Terminal 1 - Stop and restart backend
cd backend
source ../.venv/bin/activate
python manage.py runserver

# Terminal 2 - Stop and restart frontend with cache clear
cd frontend/schedscan
npx expo start --clear
```

## Verification

After restarting, the logs should show:
```
API Request: POST /upload-cor/student/  # ✅ Correct (with role)
```

Instead of:
```
API Request: POST /upload-cor/  # ❌ Wrong (old endpoint)
```

## Backend Endpoints (Updated)
- ✅ `POST /api/upload-cor/student/` - Upload as student
- ✅ `POST /api/upload-cor/faculty/` - Upload as faculty
- ❌ `POST /api/upload-cor/` - OLD (removed)

## What Changed
We split the single upload endpoint into two role-specific endpoints to support different extraction methods for student and faculty CORs.
