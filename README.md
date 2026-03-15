# SchedScan

SchedScan is a comprehensive, cross-platform scheduling management and extraction system designed to streamline academic itinerary tracking for students, faculty, and parents. Leveraging robust optical character recognition (OCR) and an intuitive mobile interface, SchedScan automates the synchronization of schedules, assignments, and academic updates.

## System Architecture

The ecosystem operates across three interconnected platforms:

1. **Backend REST API (Django & DRF)**: Handles core business logic, relational data integrity, JWT authentication, and intelligent schedule extraction via Tesseract-OCR.
2. **Mobile Client (React Native & Expo)**: Serves as the primary user interface for students to view schedules, faculty to manage class synchronizations, and parents to monitor academic progress securely.
3. **Admin Portal (React & Vite)**: A dedicated web monitoring dashboard offering telemetry on OCR extraction health, user analytics, and system administration.

## Key Features

### Student Capabilities
* Automated schedule extraction from uploaded documents and images using advanced OCR mapping.
* Real-time notifications and reminders for upcoming classes and faculty tasks.
* Secure sharing portal enabling delegated access for linked parent accounts.

### Faculty Integrations
* Generation and distribution of unique class codes for student enrollment.
* Automated synchronization of faculty tasks, assignments, and custom remarks directly to the enrolled students' active schedules.
* Conflict detection algorithms to ensure seamless merging of faculty events with existing student schedules.

### Parental View
* Secure linking via unique access codes to monitor child academic itineraries.
* Read-only tracking of class schedules, impending assignments, and faculty remarks.

### System Administration
* Comprehensive extraction health metrics and telemetry.
* System-wide calendar management, user oversight, and manual override capabilities.

## Technology Stack

### Backend
* **Framework**: Django, Django REST Framework
* **Database**: PostgreSQL (Production), SQLite (Development)
* **Authentication**: JSON Web Tokens (JWT)
* **Processing**: Tesseract-OCR
* **Deployment**: Docker, Gunicorn, DigitalOcean App Platform

### Mobile Application (Frontend)
* **Framework**: React Native, Expo, Expo Router
* **State Management & Networking**: SecureStore, Axios
* **Styling**: NativeWind (Tailwind CSS)
* **Deployment**: Expo Application Services (EAS)

### Admin Portal
* **Framework**: React, Vite
* **Styling**: Tailwind CSS, PostCSS
* **Visualizations**: Recharts
* **Routing**: React Router DOM

## Getting Started

### Prerequisites
* Python 3.12+
* Node.js 22+ and npm
* PostgreSQL
* Tesseract OCR engine (installed at the system level)

### 1. Backend Setup

Navigate to the project directory and prepare the Python environment:

```bash
cd /path/to/SchedScan
python3 -m venv .venv
source .venv/bin/activate
cd backend
pip install -r requirements.txt
```

Run database migrations and start the server:

```bash
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

The REST API will be available at `http://127.0.0.1:8000`.

### 2. Mobile Application Setup

Navigate to the mobile frontend directory and install dependencies:

```bash
cd /path/to/SchedScan/frontend/schedscan
npm install
```

Start the Expo development server:

```bash
npx expo start
```

### 3. Admin Portal Setup

Navigate to the admin portal directory and install dependencies:

```bash
cd /path/to/SchedScan/admin
npm install
```

Start the Vite development server:

```bash
npm run dev
```

## Documentation

For further technical details, please refer to the following documentation:
* `API_DOCUMENTATION.md`: Complete API endpoint reference.
* `IMPLEMENTATION_SUMMARY.md`: Architectural decisions and implementation timelines.
