# SchedScan

SchedScan is a cross-platform scheduling management system built with **Django**, **PostgreSQL**, and **React Native**.  
It provides smart schedule scanning and management tools for both students and faculty.

---

## JWT Authentication

**Status**: ✅ **IMPLEMENTED AND WORKING**

The backend now has complete JWT authentication with:
- User registration with email, password, and profile picture
- Email-based login (no username required)
- JWT access tokens (1 hour lifetime)
- JWT refresh tokens (7 days lifetime)
- Token refresh endpoint
- Logout with token blacklisting
- Protected user profile endpoints

### API Endpoints:
```
POST   /api/auth/register/       - Register new user
POST   /api/auth/login/          - Login user
POST   /api/auth/logout/         - Logout user
GET    /api/auth/user/           - Get user profile
PATCH  /api/auth/user/           - Update user profile
POST   /api/auth/token/refresh/  - Refresh access token
```

### Quick Test:
```bash
# Register a user
curl -X POST http://127.0.0.1:8000/api/auth/register/ \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "SecurePass123!", "first_name": "John", "last_name": "Doe"}'
```

📖 **Full API Documentation**: See `API_DOCUMENTATION.md`  
📋 **Implementation Details**: See `IMPLEMENTATION_SUMMARY.md`

---

## 🚀 How to Run the Project

### Prerequisites
- Python 3.12+
- Node.js 22+ and npm
- PostgreSQL

### Backend (Django)

1. **Start PostgreSQL** (if not running):
   ```bash
   sudo systemctl start postgresql
   ```

2. **Activate virtual environment**:
   ```bash
   cd /home/sheer/Desktop/SchedScan
   source .venv/bin/activate
   ```

3. **Run migrations** (first time or after model changes):
   ```bash
   cd backend
   python manage.py migrate
   ```

4. **Create superuser** (optional, for admin access):
   ```bash
   python manage.py createsuperuser
   ```

5. **Start Django development server**:
   ```bash
   python manage.py runserver
   ```
   Backend will run at: http://127.0.0.1:8000

### Frontend (React Native/Expo)

1. **Navigate to frontend directory**:
   ```bash
   cd /home/sheer/Desktop/SchedScan/frontend/schedscan
   ```

2. **Start Expo development server**:
   ```bash
   npm start
   # Or for specific platforms:
   npm run android  # For Android
   npm run ios      # For iOS
   npm run web      # For web browser
   ```

3. **Scan QR code** with Expo Go app on your phone, or press:
   - `a` for Android emulator
   - `i` for iOS simulator
   - `w` for web browser

---

## 📦 Dependencies

### Backend Dependencies
All Python dependencies are in `backend/requirements.txt` and already installed in `.venv/`:
- Django 5.2.7
- Django REST Framework
- PostgreSQL adapter (psycopg2-binary)
- JWT authentication
- python-decouple & python-dotenv

### Frontend Dependencies
All npm dependencies are in `frontend/schedscan/package.json` and already installed:
- Expo ~54.0
- React Native 0.81.4
- React Navigation
- NativeWind (Tailwind for RN)
- Lucide React Native (icons)
- Expo Image Picker
- React Native SVG

---

## ⚙️ Environment Variables

Configuration is in `.env` at the project root:
```env
DJANGO_SECRET_KEY=<your-secret-key>
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=127.0.0.1,localhost

DB_NAME=schedscan_db
DB_USER=sheer
DB_PASSWORD=
DB_HOST=localhost
DB_PORT=5432

API_URL=http://127.0.0.1:8000
```

---
