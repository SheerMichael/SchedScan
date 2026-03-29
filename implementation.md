# SchedScan: Schedule Extraction Pipeline — Implementation Reference

> **Status:** Active development.
> Last updated: 2026-03-29
> Architecture: Vision-only LLM-primary, async, regex fallback.

---

## 1. Core Philosophy

> **The LLM is the main brain. Regex is only the safety net.**

The pipeline is designed around a single principle: LLMs are better at understanding documents than regex. A model that has seen millions of documents can interpret a handwritten schedule, an OCR-noisy scan, or an unusual format that would break any deterministic parser. Regex is fast and predictable, but brittle — it fails the moment a document deviates from the expected pattern.

The flow is therefore:

1. **Parse file visuals directly** using a vision-capable LLM (images and rendered PDF pages).
2. **LLM extracts structure** — student number, subjects, schedules, and locations.
3. **Regex fallback** activates only when vision output is low confidence or invalid.
4. **Validate and save** — hard schema checks before any DB write.

Processing runs **asynchronously**. The user gets an immediate response and continues using the app while the AI works in the background.

---

## 2. Pipeline Architecture

```
POST /api/upload-cor/{student|faculty}/
        │
        ▼
┌─────────────────────────────────┐
│  Stage 0: Vision File Parse     │
│                                 │
│  PDF  → page render to images   │
│  Image → direct image input     │
│                                 │
│  Output: courses + metadata     │
└─────────────────────────────────┘
  │
  ▼
  202 Accepted ──────────────────────────► Frontend
  { job_id, status: "processing" }         (user continues working)
        │
        ▼ (background thread)
┌─────────────────────────────────┐
│  Stage 1: Vision LLM Parser     │  ← PRIMARY PROCESSOR
│  (Ollama on DigitalOcean)       │
│                                 │
│  Input:  file visuals + upload_type │
│  Output:                        │
│    - student_number             │
│    - semester / school_year     │
│    - courses[]                  │
│        subject_code             │
│        day / start / end time   │
│        location                 │
└─────────────────────────────────┘
        │                │
        │ LLM success    │ LLM failed / low confidence
        │                ▼
        │       ┌──────────────────────────────┐
        │       │  Stage 1B: Fallback          │
        │       │  regex parser                │
        │       │  (StudentCORExtractor /      │
        │       │   FacultyCORExtractor)       │
        │       └──────────────────────────────┘
        │                │
        └────────────────┘
                │
                ▼
┌─────────────────────────────────┐
│  Stage 2: Validate + Score      │
│  validators.py + scoring.py     │
│  Hard gate — rejects bad rows   │
└─────────────────────────────────┘
                │
        ┌───────┴───────┐
        │               │
   confidence ≥ 0.85   confidence < 0.85
        │               │
        ▼               ▼
     Save ✅         Reject 422 ❌
        │
        ▼
  Push notification ──────────────► User's device
  "Your schedule is ready"
        +
  Polling endpoint returns        ← Frontend polling
  { status: "done", courses: [] }
```

---

## 3. Module Map

```
backend/
├── api/
│   ├── utils/
│   │   ├── extraction_manager.py       # Orchestrator — wires all stages, runs async
│   │   ├── ocr.py                      # Optional legacy OCR fallback path
│   │   ├── pdf_extractor.py            # Optional legacy PDF text extraction fallback
│   │   └── extraction/
│   │       ├── orchestrator.py         # Routes by file type (PDF vs image)
│   │       ├── profiler.py             # File type + template family detection
│   │       ├── llm_normalizer.py       # parse_document_with_llm_vision() ← PRIMARY parser
│   │       │                           # parse_with_llm()/normalize_with_llm() retained as legacy helpers
│   │       ├── normalizer.py           # normalize_candidates() — field normalisation
│   │       ├── validators.py           # validate_candidates() — hard gate before DB write
│   │       ├── scoring.py              # score_candidates() — composite confidence score
│   │       ├── fallbacks.py            # should_use_fallback() — quality threshold check
│   │       └── types.py                # Shared type definitions
│   ├── models.py                       # ExtractionJob — tracks async job status
│   ├── views/
│   │   ├── upload_views.py             # POST /api/upload-cor/ → 202, launches background task
│   │   └── job_views.py                # GET /api/extraction-jobs/{job_id}/ — polling endpoint
│   └── tests/
│       ├── test_extraction.py
│       ├── test_llm_normalizer.py
│       ├── test_extraction_scoring.py
│       └── test_extraction_validators.py
└── core/
    └── settings.py                     # All LLM + extraction flags
```

---

## 4. Async Job Lifecycle

### States

```
pending → processing → done
                    └─► failed (regex fallback ran, or full rejection)
```

### ExtractionJob Model (to add to models.py)

```python
class ExtractionJob(models.Model):
    job_id          = models.UUIDField(primary_key=True, default=uuid.uuid4)
    user            = models.ForeignKey(User, on_delete=models.CASCADE)
    upload_type     = models.CharField(max_length=20)   # student / faculty
    status          = models.CharField(max_length=20, default='pending')
    extraction_method = models.CharField(max_length=50, blank=True)
    courses         = models.JSONField(null=True)
    student_number  = models.CharField(max_length=20, blank=True)
    semester        = models.CharField(max_length=20, blank=True)
    school_year     = models.CharField(max_length=20, blank=True)
    confidence      = models.FloatField(null=True)
    failure_category = models.CharField(max_length=50, blank=True)
    error_message   = models.TextField(blank=True)
    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)
```

### Upload Endpoint Behaviour

```
POST /api/upload-cor/student/
└── creates ExtractionJob(status='pending')
└── launches threading.Thread(target=run_extraction_job, args=[job_id])
└── returns 202 { job_id, status: "processing" }
```

### Polling Endpoint

```
GET /api/extraction-jobs/{job_id}/
└── pending   → { status: "processing" }
└── done      → { status: "done", courses: [], confidence: 0.91, ... }
└── failed    → { status: "failed", failure_category: "low_confidence" }
```

Recommended polling interval: **every 3 seconds**, max 10 attempts (~30s), then show manual retry prompt.

### Push Notification

When job transitions to `done` or `failed`, the backend sends a push notification via the existing notification service:

```
"done"   → "✅ Your schedule has been extracted and saved!"
"failed" → "⚠️ We couldn't read your schedule — please try re-uploading."
```

---

## 5. Vision LLM as Primary Parser — parse_document_with_llm_vision()

This is the **main extraction function** called first on every upload when vision mode is enabled.

### What the LLM is asked to do

The prompt provides:
- The upload type context (`STUDENT COR` or `FACULTY IDP`)
- Format hints (what a formal PDF looks like vs a handwritten note)
- The file image(s) as model input
- Strict JSON schema to fill in

The LLM must return:

```json
{
  "doc_metadata": {
    "student_number": "2022-01191",
    "semester": "1ST",
    "school_year": "2025-2026"
  },
  "courses": [
    {
      "subject_code": "OS",
      "subject_name": "Operating Systems",
      "day": "M",
      "start_time": "01:00PM",
      "end_time": "03:00PM",
      "location": "LR1"
    }
  ]
}
```

Every response is **schema-validated** before use. Unknown keys are logged and ignored. On failure (timeout, bad JSON, schema violation), extraction falls through to regex fallback.

### LLM Safety Rules

| Rule | Implementation |
|---|---|
| Prompt injection mitigation | Fixed instruction template + strict response schema |
| Schema enforcement | `ALLOWED_KEYS` whitelist and shape validation |
| Hard timeout | `EXTRACTION_LLM_TIMEOUT_SECONDS` (currently 45s) |
| Input bounding | `EXTRACTION_LLM_VISION_MAX_PAGES` limits PDF pages sent to model |
| Fail closed | Timeout / bad JSON / schema fail → return `([], {}, telemetry)`, never raise |
| Model pinning | `EXTRACTION_LLM_VISION_REQUIRE_PINNED_MODEL=True` rejects `:latest` tags |

---

## 6. Fallback Policy — When It Activates

Fallback path only runs when enabled and needed:

- Vision LLM request timed out
- Vision LLM returned malformed JSON
- Vision LLM response failed schema validation
- Vision LLM score below retry threshold
- Ollama vision model unavailable

Fallback chain:

1. Regex parser (`StudentCORExtractor` / `FacultyCORExtractor`)

In direct-file mode, OCR/pdfplumber are not required for normal success path.

Fallback is transparent to users; method attribution is stored in `extraction_method` and `attempts` telemetry.

---

## 7. Validation Rules (Hard Gate — Always Runs)

Runs after whichever parser produced output (LLM or regex). Failures populate `validator_errors`. Bad rows are dropped; the remaining valid courses are scored.

| Rule | Detail |
|---|---|
| Required fields | `subject_code`, `start_time`, `end_time` |
| Day policy | Soft-required; missing day is accepted as empty string |
| Day validity | One of `M, T, W, TH, F, S` only |
| Time format | `HH:MMAM` / `HH:MMPM`; `start < end`; duration ≤ 8h |
| Duplicates | `(subject_code, day, start_time)` — highest confidence kept |
| Text sanity | `subject_code` character whitelist; >70% symbols → reject |
| Ownership | `student_number` from extraction must match authenticated user |

---

## 8. Confidence Scoring

Composite score computed after validation:

| Component | Student | Faculty |
|---|---|---|
| Field completeness | 0.25 | 0.30 |
| Parse validity | 0.25 | 0.25 |
| Semantic consistency | 0.20 | 0.25 |
| Parser reliability prior | 0.15 | 0.10 |
| Cross-parser agreement | 0.15 | 0.10 |

**Thresholds:**
- `≥ 0.85` → accept & save
- `< 0.85` → reject with 422, job status = `failed`

---

## 9. Configuration Reference

### LLM Settings (DigitalOcean App Platform)

| Setting | Value | Purpose |
|---|---|---|
| `EXTRACTION_LLM_NORMALIZATION_ENABLED` | `True` | Master LLM gate (must be enabled for vision parsing) |
| `EXTRACTION_LLM_VISION_PARSE_ENABLED` | `True` | Enables direct-file vision parser |
| `EXTRACTION_LLM_DIRECT_FILE_PARSE_ENABLED` | `True` | Bypasses OCR/pdfplumber orchestration |
| `EXTRACTION_LLM_VISION_MODEL_NAME` | `granite3.2-vision:2b` | Primary vision model |
| `EXTRACTION_LLM_VISION_MAX_PAGES` | `2` | Limits rendered PDF pages sent to model |
| `EXTRACTION_LLM_FULL_PARSE_ENABLED` | `False` | Legacy text parser flag (not used by runtime orchestration) |
| `EXTRACTION_LLM_MODEL_NAME` | *(optional)* | Legacy text model config (not used by runtime orchestration) |
| `EXTRACTION_LLM_BASE_URL` | `http://209.97.172.45:8080` | Ollama on DigitalOcean Droplet |
| `EXTRACTION_LLM_API_KEY` | *(see update.md)* | nginx X-Api-Key auth |
| `EXTRACTION_LLM_TIMEOUT_SECONDS` | `45` | Hard timeout per LLM call |
| `EXTRACTION_LLM_MAX_INPUT_CHARS` | `6000` | Legacy text-parser input bound (not used in runtime orchestration) |
| `EXTRACTION_LLM_VISION_REQUIRE_PINNED_MODEL` | `True` | Reject `:latest` tags for vision model |
| `EXTRACTION_ACCEPT_THRESHOLD` | `0.85` | Minimum to accept & save |

---

## 10. API Reference

### Upload

```
POST /api/upload-cor/student/
POST /api/upload-cor/faculty/

Request:  multipart/form-data { file }
Response: 202 Accepted
{
  "job_id": "uuid",
  "status": "processing",
  "message": "Your file is being processed. We'll notify you when it's ready."
}
```

### Poll

```
GET /api/extraction-jobs/{job_id}/

Response (processing): { "status": "processing" }
Response (done):        { "status": "done", "courses": [...], "confidence": 0.92, ... }
Response (failed):      { "status": "failed", "failure_category": "low_confidence", "message": "..." }
```

### Error codes

| Code | Meaning |
|---|---|
| `202` | Job accepted, processing in background |
| `200` | Poll response — check `status` field |
| `403` | Student number ownership mismatch |
| `500` | System error |

---

## 11. Frontend Integration

1. `POST` upload → receive `job_id`.
2. Poll `GET /api/extraction-jobs/{job_id}/` every **3 seconds**.
3. On `status: "done"` → refresh schedule view.
4. On `status: "failed"` → show retry prompt.
5. On push notification → stop polling early and reload.
6. Max poll attempts: **10** (~30s). After that, show "Taking longer than expected — we'll notify you when done."

---

## 12. Failure Mode Reference

| Failure | What happens | User sees |
|---|---|---|
| Vision LLM timeout | Regex fallback runs automatically | Normal result (or retry) |
| Vision LLM bad JSON | Regex fallback runs automatically | Normal result (or retry) |
| Regex also fails | Job → `failed`, push notification sent | "Couldn't read your schedule — please re-upload" |
| Student number mismatch | 403 returned synchronously | Error before job is created |
| Ollama vision model down | Regex fallback path handles request | Slower but no hard outage |
| Unexpected exception | Job → `failed`, error logged internally | "Something went wrong — please try again" |

---

## 13. Testing

```bash
cd backend
source venv/bin/activate
python manage.py test api.tests --verbosity=2
```

Key test classes:

| Class | What it covers |
|---|---|
| `ParseDocumentWithLLMVisionTestCase` | `parse_document_with_llm_vision()` — disabled, success, schema behavior |
| `ParseWithLLMTestCase` | Legacy text parser helper coverage (retained for backward compatibility) |
| `LLMNormalizerTestCase` | Legacy text normalizer helper coverage (schema, API key, timeout) |
| `ExtractionManagerTestCase` | Orchestration, async job lifecycle |
| `FacultyOCRDayRecoveryTestCase` | Regex fallback — OCR noise in day tokens |
