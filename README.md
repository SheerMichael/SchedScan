# SchedScan

SchedScan is a cross-platform academic schedule management system. Students and faculty upload Certificate of Registration (COR) or Individual Daily Program (IDP) documents; SchedScan extracts the schedule automatically and syncs it across mobile, web, and parent-view surfaces.

Extraction is handled by a multi-stage pipeline: deterministic regex parsing runs first, followed by two optional LLM-powered stages (via a locally-hosted Ollama model) that activate as intelligent fallbacks when the regex yields no results or low-confidence output.

---

## System Architecture

The system runs across three interconnected platforms:

1. **Backend REST API (Django & DRF)** — Core business logic, JWT authentication, PostgreSQL persistence, and the multi-stage extraction pipeline.
2. **Mobile Client (React Native & Expo)** — Primary user interface for students (schedule view, parent sharing, notifications) and faculty (class codes, task sync).
3. **Admin Portal (React & Vite)** — Web dashboard for extraction health telemetry, user analytics, and system administration.

---

## Extraction Pipeline

Schedule extraction uses a three-stage pipeline. Each stage gates the next:

```
Uploaded file
    │
    ▼
Stage 0: Document Profiler (PDF vs image, template family)
    │
    ├── PDF ──► Stage 1A: PDF Text Extractor (pdfplumber)
    │               └── low quality ──► OCR fallback
    └── Image ─► Stage 1B: OCR Extractor (Tesseract / pytesseract)
                    │
                    ▼
          Stage 2: Regex Parser
          (StudentCORExtractor / FacultyCORExtractor)
                    │
                    ├── confidence ≥ 0.85 ──────────────────► accept ✅
                    │
                    ├── 0.60 ≤ confidence < 0.85
                    │       └── Stage A: LLM Normalizer        [opt-in]
                    │               corrects seed courses from regex
                    │               └── improved? ──► accept ✅
                    │
                    └── confidence < 0.60 OR courses == []
                            └── Stage B: LLM Full Parser       [opt-in]
                                    parses raw OCR text directly
                                    extracts courses + metadata
                                    └── success? ──► accept ✅
                                    └── failure  ──► 422 ❌
```

Both LLM stages are off by default and are enabled via feature flags (`EXTRACTION_LLM_NORMALIZATION_ENABLED`, `EXTRACTION_LLM_FULL_PARSE_ENABLED`). All LLM output is schema-validated before use — failures always return empty, never raise.

---

## Key Features

### Student
- Automated schedule extraction from digital PDFs, scanned images, and handwritten COR notes.
- Real-time class reminders and faculty task notifications.
- Delegated parent access via secure sharing codes.

### Faculty
- Unique class code generation for student enrollment.
- Assignment and remark distribution synced directly to enrolled students' schedules.
- Schedule conflict detection.

### Parents
- Read-only view of child's schedule, assignments, and faculty remarks.

### Administration
- Extraction health telemetry (confidence scores, method distribution, failure categories).
- User management, impersonation, and activity logging.

---

## Technology Stack

### Backend
| Component | Technology |
|---|---|
| Framework | Django 4, Django REST Framework |
| Database | PostgreSQL (production), SQLite (development) |
| Authentication | JWT (SimpleJWT) |
| OCR | Tesseract / pytesseract |
| PDF Parsing | pdfplumber |
| LLM Inference | Ollama (local, optional) |
| Deployment | Docker, Gunicorn, DigitalOcean App Platform |

### Mobile Application
| Component | Technology |
|---|---|
| Framework | React Native, Expo, Expo Router |
| Networking | Axios, SecureStore |
| Styling | NativeWind (Tailwind CSS) |
| Deployment | Expo Application Services (EAS) |

### Admin Portal
| Component | Technology |
|---|---|
| Framework | React, Vite |
| Styling | Tailwind CSS, PostCSS |
| Charts | Recharts |
| Routing | React Router DOM |

---

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 22+ and npm
- PostgreSQL
- Tesseract OCR (`sudo apt install tesseract-ocr` or equivalent)
- *(Optional)* [Ollama](https://ollama.ai/) for LLM-backed extraction

### 1. Backend

```bash
cd SchedScan/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Copy and configure environment
cp ../.env.example ../.env   # edit DB credentials, secret key, etc.

python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

API available at `http://127.0.0.1:8000`.

### Due-Task Reminder Scheduler

SchedScan now includes a server-side due-date reminder runner for personal and faculty tasks:

```bash
cd SchedScan/backend
source venv/bin/activate
python manage.py send_task_due_reminders
```

Recommended cadence: run every 5 minutes in production.

Production architecture (recommended): Celery Worker + Celery Beat with Redis broker.

```bash
# worker
cd SchedScan/backend
source venv/bin/activate
CELERY_BROKER_URL=redis://localhost:6379/0 python -m celery -A core worker --loglevel=INFO

# beat scheduler (separate process)
cd SchedScan/backend
source venv/bin/activate
CELERY_BROKER_URL=redis://localhost:6379/0 python -m celery -A core beat --loglevel=INFO
```

Celery beat schedules these jobs every 5 minutes:

- `api.tasks.send_due_task_reminders`
- `api.tasks.send_upcoming_class_reminders`

If you cannot use Celery yet, fallback is still available via management commands (`send_task_due_reminders` and `send_class_reminders`) from cron.

Configuration flags:

- `ENABLE_SERVER_TASK_DUE_REMINDERS` (default: `True`)
- `TASK_DUE_REMINDER_LOOKAHEAD_HOURS` (default: `24`)
- `TASK_DUE_OVERDUE_GRACE_MINUTES` (default: `30`)
- `CELERY_BROKER_URL` (required for worker/beat mode)
- `CELERY_RESULT_BACKEND` (optional, defaults to `CELERY_BROKER_URL`)

Critical reminders are sent with an urgent payload so the mobile app can show invasive alerts.

### 2. Mobile Application

```bash
cd SchedScan/frontend/schedscan
npm install
npx expo start
```

Scan the QR code in Expo Go or run in a simulator.

### 3. Admin Portal

```bash
cd SchedScan/admin
npm install
npm run dev
```

Dashboard available at `http://localhost:5173`.

### 4. LLM Extraction (Optional)

Install Ollama and pull a model:

```bash
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull llama3.2:3b
```

Set environment variables:

```env
EXTRACTION_LLM_NORMALIZATION_ENABLED=True
EXTRACTION_LLM_FULL_PARSE_ENABLED=True
EXTRACTION_LLM_MODEL_NAME=llama3.2:3b
EXTRACTION_LLM_BASE_URL=http://127.0.0.1:11434
EXTRACTION_LLM_REQUIRE_PINNED_MODEL=False   # local dev only
```

---

## Running Tests

```bash
cd backend
source venv/bin/activate
python manage.py test api.tests --verbosity=2
```

---

## Documentation

- [`implementation.md`](./implementation.md) — Extraction pipeline architecture, data contracts, configuration reference, and failure mode guide.
- `API_DOCUMENTATION.md` — Complete endpoint reference.
