# OCR Integration Setup Guide

## Overview
This guide explains how to integrate the COR (Certificate of Registration) OCR functionality into your Django backend.

## Files Created/Modified

### 1. New Files Created:
- `backend/api/utils/__init__.py` - Utils package initialization
- `backend/api/utils/ocr.py` - CORExtractor class for OCR processing

### 2. Modified Files:
- `backend/api/models.py` - Added Course model
- `backend/api/serializers.py` - Added CourseSerializer
- `backend/api/views.py` - Added UploadCORView and UserCoursesView
- `backend/api/urls.py` - Added new endpoints
- `backend/requirements.txt` - Added OCR dependencies

## Installation Steps

### 1. Install Dependencies

```bash
cd backend
source ../.venv/bin/activate  # Activate virtual environment
pip install -r requirements.txt
```

**New Dependencies Added:**
- `python-doctr[torch]` - Document OCR library
- `opencv-python-headless` - Image processing (headless version for servers)
- `Pillow` - Image handling
- `django-cors-headers` - Already installed, but explicitly listed

### 2. Run Database Migrations

```bash
python manage.py makemigrations
python manage.py migrate
```

This will create the `Course` table in your PostgreSQL database.

### 3. Create Media Directories

The media files are automatically handled by Django, but you can create the directory structure:

```bash
mkdir -p media/temp
mkdir -p media/profile_pictures
```

## API Endpoints

### 1. Upload COR Document
**Endpoint:** `POST /api/upload-cor/`

**Authentication:** Required (Bearer token)

**Request:**
```bash
curl -X POST http://127.0.0.1:8000/api/upload-cor/ \
  -H "Authorization: Bearer <access_token>" \
  -F "file=@path/to/cor_document.pdf"
```

**Supported File Types:**
- PDF (.pdf)
- Images (.png, .jpg, .jpeg)

**Response (Success):**
```json
{
  "message": "Successfully processed COR and created 13 courses",
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
      "created_at": "2025-11-19T10:30:00Z",
      "updated_at": "2025-11-19T10:30:00Z"
    },
    ...
  ],
  "total_courses": 13
}
```

**Response (No Courses Found):**
```json
{
  "warning": "No courses found in the document",
  "message": "The document was processed but no course information could be extracted. Please check if the document is a valid COR.",
  "courses": [],
  "total_courses": 0
}
```

**Response (Error):**
```json
{
  "error": "Failed to process the document",
  "details": "Error message here"
}
```

### 2. Get User Courses
**Endpoint:** `GET /api/courses/`

**Authentication:** Required (Bearer token)

**Request:**
```bash
curl -X GET http://127.0.0.1:8000/api/courses/ \
  -H "Authorization: Bearer <access_token>"
```

**Response:**
```json
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
    "created_at": "2025-11-19T10:30:00Z",
    "updated_at": "2025-11-19T10:30:00Z"
  },
  ...
]
```

## Database Model

### Course Model Fields:
- `id` - Primary key (auto)
- `user` - Foreign key to User (who owns this schedule)
- `subject_code` - CharField(50) - Course code (e.g., "BSCS125781")
- `subject_name` - CharField(255) - Course name (e.g., "SOFTWARE ENGINEERING")
- `start_time` - CharField(20) - Start time (e.g., "07:00AM")
- `end_time` - CharField(20) - End time (e.g., "09:00AM")
- `day` - CharField(10) - Day of week (M, T, W, TH, F, S, TF, MW, etc.)
- `location` - CharField(100) - Classroom/location (e.g., "LR7", "LAB2")
- `created_at` - DateTime (auto)
- `updated_at` - DateTime (auto)

## How It Works

### 1. Upload Flow:
1. User uploads PDF/image via POST request
2. File is temporarily saved to `media/temp/`
3. CORExtractor processes the document using doctr
4. OCR extracts text and geometry information
5. Parser groups text into course entries
6. Course objects are created in PostgreSQL
7. Temporary file is deleted
8. Response returns created courses

### 2. OCR Processing:
The `CORExtractor` class uses a spatial/geometric parsing approach:
- Identifies subject codes as anchors
- Finds subject names to the right of anchors
- Collects schedule details below anchors
- Parses times, days, and locations using regex
- Groups information into structured course dictionaries

## Frontend Integration Example

### React Native/Expo Example:

```typescript
// services/courseService.ts
import axios from 'axios';
import { API_URL } from './api';

export const uploadCOR = async (fileUri: string, accessToken: string) => {
  const formData = new FormData();
  
  // For React Native
  formData.append('file', {
    uri: fileUri,
    type: 'application/pdf', // or 'image/jpeg', 'image/png'
    name: 'cor_document.pdf',
  } as any);
  
  const response = await axios.post(
    `${API_URL}/api/upload-cor/`,
    formData,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'multipart/form-data',
      },
    }
  );
  
  return response.data;
};

export const getUserCourses = async (accessToken: string) => {
  const response = await axios.get(
    `${API_URL}/api/courses/`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );
  
  return response.data;
};
```

## Testing

### Test with curl:

1. **Login first:**
```bash
curl -X POST http://127.0.0.1:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "yourpassword"}'
```

2. **Upload COR:**
```bash
curl -X POST http://127.0.0.1:8000/api/upload-cor/ \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -F "file=@/path/to/your/cor.pdf"
```

3. **Get courses:**
```bash
curl -X GET http://127.0.0.1:8000/api/courses/ \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Troubleshooting

### Issue: "Import doctr could not be resolved"
**Solution:** Make sure you've installed the requirements:
```bash
pip install python-doctr[torch] opencv-python-headless Pillow
```

### Issue: "No module named 'api.utils'"
**Solution:** Make sure you have `__init__.py` in the utils folder and restart Django

### Issue: Migration errors
**Solution:** 
```bash
python manage.py makemigrations api
python manage.py migrate
```

### Issue: "Permission denied" on media files
**Solution:** Make sure media directory exists and has proper permissions:
```bash
mkdir -p media/temp
chmod 755 media
```

### Issue: OCR not extracting courses properly
**Solution:** 
- Check that the document is a valid COR format
- Try with higher quality images/PDFs
- Check Django logs for detailed error messages

## Performance Considerations

- OCR processing can take 5-30 seconds depending on document size
- Consider implementing background tasks with Celery for production
- The first model load takes longer (model is cached after first use)
- Temporary files are automatically cleaned up after processing

## Security Notes

- Files are validated for allowed extensions
- Temporary files are stored with user ID in filename
- Files are immediately deleted after processing
- Only authenticated users can upload
- Users can only see their own courses

## Next Steps

1. ✅ Install dependencies
2. ✅ Run migrations
3. ✅ Test with sample COR document
4. Consider adding:
   - Endpoint to delete courses
   - Endpoint to update individual courses
   - Batch delete functionality
   - Course search/filter functionality
   - Export schedule to calendar format
