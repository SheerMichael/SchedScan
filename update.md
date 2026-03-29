# SchedScan Extraction Pipeline — Master Update Log

**Last updated:** 2026-03-29 (23:20 PHT)

---

## Executive Summary

The extraction pipeline is now **vision-only, LLM-primary, async**.

- Primary mode: a vision-capable LLM interprets uploaded files directly (images and PDF page renders).
- Legacy OCR/pdfplumber paths are no longer required for normal processing when direct-file mode is enabled.
- Text LLM parsing paths were removed from runtime orchestration to reduce complexity.
- Validation, scoring, ownership checks, async jobs, polling, and push notifications remain in place as reliability guardrails.

Recommended production model for current infrastructure: `granite3.2-vision:2b`.

---

## Architecture — Implemented and Live

```
File upload
    │
    ▼
Direct file understanding (Vision LLM)
    │
    ├── 202 Accepted immediately (user continues using app)
    │
    └── Background daemon thread (run_extraction_job):
             │
             ▼
         ExtractionJob status → 'processing'
             │
             ▼
       LLM Vision Parser (Ollama — PRIMARY): granite3.2-vision:2b
       identifies: student_number, subjects, schedule, location from file visuals
         │
         ├── score >= threshold → accepted
         └── score < threshold → regex fallback path
             │
             ├── accepted → write Course rows → status: 'done'
             └── rejected / error → status: 'failed'
             │
             ▼
         ExtractionLog written (telemetry)
         Push notification sent (NotificationService)
         Polling endpoint returns final state
```

### Role Reversal

| Component | Old Role | New Role |
|---|---|---|
| OCR / pdfplumber | Primary preprocessing | **Optional fallback path only** |
| Vision LLM `parse_document_with_llm_vision()` | N/A | **Primary parser — runs first** |
| Text LLM `parse_with_llm()` | Primary parser | **Removed from runtime orchestration** |
| Regex (`StudentCORExtractor` etc.) | Primary parser | **Last fallback safety net** |
| Processing mode | Synchronous (blocks request) | **Async — 202 + polling + push notification** |

---

## What the Vision LLM Extracts

- `student_number` (required for student COR ownership checks)
- `subject_code`, `subject_name`
- `day`, `start_time`, `end_time`
- `location` (room)
- `semester`, `school_year`

---

## Frontend Integration

```
1. POST /api/upload-cor/student/
   → 202 { job_id: "uuid", status: "processing", message }
   → Show "Processing your schedule…"

2. Poll GET /api/extraction-jobs/{job_id}/ every 3 seconds (max 10 attempts)
   → { status: "processing" }   still running, keep polling
   → { status: "done", courses, confidence, ... }   success
   → { status: "failed", failure_category, message, retryable }   failure

3. Push notification fires automatically on job completion (Expo Push API)
   → success: "Schedule Ready ✅"
   → failure: "Extraction Failed ⚠️"

4. On push notification received → cancel polling immediately, reload schedule
5. After 10 poll attempts without terminal state → show "We'll notify you when done"
```

---

## DigitalOcean Infrastructure Reference

### Ollama Droplet

| Item | Value |
|---|---|
| Name | `ollama-schedscan` |
| Region | Singapore SGP1 |
| Size | `s-2vcpu-4gb` ($32/mo) |
| Public IPv4 | `209.97.172.45` |
| Private IP | `10.104.0.2` |
| VPC | `default-sgp1` / `10.104.0.0/20` |
| OS | Ubuntu 24.04 LTS |
| Primary Vision Model (target) | `granite3.2-vision:2b` |
| Text Model | Not used (vision-only policy) |

### Ollama nginx Proxy

| Item | Value |
|---|---|
| Listens on | Port `8080` (public) |
| Proxies to | `127.0.0.1:11434` (Ollama, localhost only) |
| Auth method | `X-Api-Key` header |
| Config path | `/etc/nginx/sites-available/ollama` |
| API Key | Stored as `EXTRACTION_LLM_API_KEY` in DO App Platform |

**Quick Droplet health check:**
```bash
ssh -i ~/.ssh/id_ed25519 root@209.97.172.45
systemctl status ollama
systemctl status nginx
journalctl -u ollama -n 30
free -h  # confirm RAM not exhausted (~4GB total)
```

**Verify nginx API key gate:**
```bash
# Must return 403
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/api/tags
# Must return 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/api/tags \
  -H "X-Api-Key: <your-key-from-DO-dashboard>"
```

### DO Firewall — `ollama-firewall`

| Rule | Type | Port | Source |
|---|---|---|---|
| SSH | TCP | 22 | `49.157.65.42` only |
| Ollama proxy | TCP | 8080 | All IPv4 + All IPv6 |
| Port 11434 | — | **CLOSED** | Removed |

**Attached to:** `ollama-schedscan` (1 Droplet)

### App Platform — `schedscan-5gfy` Environment Variables

#### LLM Settings

| Key | Value |
|---|---|
| `EXTRACTION_LLM_BASE_URL` | `http://209.97.172.45:8080` |
| `EXTRACTION_LLM_NORMALIZATION_ENABLED` | `True` |
| `EXTRACTION_LLM_VISION_PARSE_ENABLED` | `True` |
| `EXTRACTION_LLM_DIRECT_FILE_PARSE_ENABLED` | `True` |
| `EXTRACTION_LLM_VISION_MODEL_NAME` | `granite3.2-vision:2b` |
| `EXTRACTION_LLM_VISION_MAX_PAGES` | `2` |
| `EXTRACTION_LLM_VISION_REQUIRE_PINNED_MODEL` | `True` |
| `EXTRACTION_LLM_FULL_PARSE_ENABLED` | `False` *(legacy path, not used by runtime orchestration)* |
| `EXTRACTION_LLM_STARTUP_CHECK_ENABLED` | `True` |
| `EXTRACTION_LLM_STARTUP_CHECK_STRICT` | `False` |
| `EXTRACTION_LLM_MODEL_NAME` | *(optional, legacy only)* |
| `EXTRACTION_LLM_API_KEY` | `<redacted-secret-in-do-app-platform>` |
| `EXTRACTION_LLM_MODEL_DIGEST` | *(optional, legacy only)* |
| `EXTRACTION_LLM_REQUIRE_MODEL_DIGEST` | `False` *(legacy only)* |
| `EXTRACTION_LLM_TIMEOUT_SECONDS` | `45` |

#### Quality Gate Settings

| Key | Value |
|---|---|
| `EXTRACTION_ACCEPT_THRESHOLD` | `0.85` |
| `EXTRACTION_RETRY_THRESHOLD` | `0.60` |

---

## Session History

### 2026-03-29 (Session 4) — Vision-Only Runtime Cutover ✅ IMPLEMENTED

**Goal:** Remove text-LLM runtime dependency and keep extraction path vision-first + regex fallback only.

#### Code Changes

| File | What Changed |
|---|---|
| `backend/api/utils/extraction_manager.py` | Removed runtime calls to `parse_with_llm()` and `normalize_with_llm()`; kept vision parser as only LLM execution path; retained regex fallback scoring path. |
| `backend/api/utils/extraction/llm_normalizer.py` | Startup health check now validates the vision model (`EXTRACTION_LLM_VISION_MODEL_NAME`) and vision pinning/digest policy. Vision parser no longer falls back to text model name. |
| `backend/api/utils/extraction_manager.py` | Async job method attribution now treats `llm_vision_parse` as canonical LLM method. |

#### Validation

```
Ran 60 tests in ~13s — OK (0 failures)
```

Suites run: `api.tests.test_llm_normalizer`, `api.tests.test_extraction`.

### 2026-03-29 (Session 3) — Vision-First Direct File Parse ✅ IMPLEMENTED

**Goal:** Remove OCR/pdfplumber dependency from normal extraction path and let the model interpret document contents directly.

#### Code Changes

| File | What Changed |
|---|---|
| `backend/api/utils/extraction/llm_normalizer.py` | Added `parse_document_with_llm_vision()` for direct document-image parsing using Ollama multimodal requests (`images` payload). |
| `backend/api/utils/extraction_manager.py` | Added Stage 0 vision parse; wired vision-first scoring; added direct-file bypass mode to skip OCR/pdfplumber orchestration. |
| `backend/core/settings.py` | Added vision/direct-file flags and model settings: `EXTRACTION_LLM_VISION_PARSE_ENABLED`, `EXTRACTION_LLM_DIRECT_FILE_PARSE_ENABLED`, `EXTRACTION_LLM_VISION_MODEL_NAME`, `EXTRACTION_LLM_VISION_MAX_PAGES`, etc. |
| `backend/api/utils/extraction/scoring.py` | Added reliability prior for `llm_vision_parse`. |
| `backend/api/tests/test_llm_normalizer.py` | Added coverage for vision parser success/disabled behavior. |

#### Validation

```
Ran 60 tests in ~13s — OK (0 failures)
```

Covered suites include async extraction lifecycle and llm normalizer/vision parse tests.

### 2026-03-25 (Session 2) — Async Pipeline: Steps 2–5 ✅ COMPLETE

**All backend async infrastructure implemented and tested.**

#### Code Changes

| File | What Changed |
|---|---|
| `backend/api/models.py` | Added `_temp_file_path` field to `ExtractionJob` (temp file path for background thread) |
| `backend/api/migrations/0032_extractionjob.py` | **New** — initial `ExtractionJob` model migration |
| `backend/api/migrations/0033_extractionjob_add_temppath.py` | **New** — `_temp_file_path` field migration |
| `backend/api/utils/extraction_manager.py` | Added `run_extraction_job()`, `_write_extraction_log_for_job()`, `_send_extraction_job_notification()` |
| `backend/api/views/upload_views.py` | Rewired `BaseCORUploadView.post()` to return 202, launch daemon thread, keep sync ownership check for student CORs |
| `backend/api/views/job_views.py` | **New** — `ExtractionJobStatusView` polling endpoint |
| `backend/api/views/__init__.py` | Exported `ExtractionJobStatusView` |
| `backend/api/urls.py` | Added `extraction-jobs/<uuid:job_id>/` URL |
| `backend/api/tests/test_extraction.py` | 11 new `AsyncExtractionJobTestCase` tests |

#### Key Implementation Details

**`run_extraction_job(job_id)` — the background runner:**
- Reads the `ExtractionJob` from DB, sets `status='processing'`
- Runs `ExtractionManager().extract_schedule()` (LLM primary → regex fallback)
- On accepted result: writes `Course` rows in a transaction, sets `status='done'`
- On rejected result: sets `status='failed'` with `failure_category`
- **Critical safety net:** outer `except Exception` block always sets `status='failed'` and notifies user — a crashed thread can never leave a job hanging in `'processing'` indefinitely
- Always deletes the temp file in a `finally` block — temp file cleanup is fully owned by this function
- On terminal state: writes `ExtractionLog` telemetry + fires Expo push notification

**Upload view changes:**
- Student COR still runs a fast synchronous extraction pass to check ownership (the 403 must remain synchronous — we cannot launch a background job for a file that will be rejected)
- Faculty COR skips the sync pass entirely (no ownership requirement) and goes straight to job creation
- Both return `202 Accepted` with `{ job_id, status, message }`
- `temp_file_path = None` is set before returning to transfer file ownership to the thread (prevents `finally` block from deleting it prematurely)

**Polling endpoint `GET /api/extraction-jobs/{job_id}/`:**
- Enforces ownership: returns `403` if the requesting user does not own the job
- Returns `404` for invalid UUIDs or non-existent jobs
- `pending`/`processing` → `{ status: "processing", message }`
- `done` → `{ status: "done", courses, total_courses, confidence, extraction_method, semester, school_year }`
- `failed` → `{ status: "failed", failure_category, message, retryable }`

#### Test Results

```
Ran 38 tests in 6.1s — OK (0 failures, 0 errors)
```

New tests covering:
- Upload returns 202 + job_id for student COR (with mocked thread)
- Faculty upload returns 202 without calling ExtractionManager (no sync pass)
- Polling returns correct shape for each status
- Polling returns 403 for another user's job
- Polling returns 404 for non-existent job
- `run_extraction_job()` sets `status='done'` and writes courses on success
- **`run_extraction_job()` sets `status='failed'` on unhandled exception (safety net test)**
- `run_extraction_job()` cleans up temp file on both success and failure

---

### 2026-03-25 (Session 1) — LLM-Primary Architecture + Step 1

**Architecture change:**
- LLM promoted from fallback to primary parser
- Regex demoted to silent automatic fallback
- Async processing design agreed (202 + polling + push notification)

**Code changes:**
- `parse_with_llm()` added to `llm_normalizer.py` — full document parse, no seed courses needed
- `EXTRACTION_LLM_FULL_PARSE_ENABLED` setting added to `settings.py`
- Stage B wired into `_finalize_result()` in `extraction_manager.py`
- `ExtractionJob` model created in `models.py` (uuid PK, status, courses, confidence, failure fields)
- Migration `0032_extractionjob.py` generated and applied

---

### 2026-03-22 — Security Hardening + Faculty OCR Fix

**Code changes (commit `3efc00e`):**

| File | Change |
|---|---|
| `backend/core/settings.py` | Added `EXTRACTION_LLM_API_KEY` setting |
| `backend/api/utils/extraction/llm_normalizer.py` | Added `_build_ollama_headers()` — all Ollama HTTP calls send `X-Api-Key` |
| `backend/api/tests/test_llm_normalizer.py` | 2 new tests: key sent when set, absent when empty |
| `backend/api/tests/test_redaction.py` | **New** — 10 PII redaction security regression tests |

**Droplet configuration (manual):**
- nginx installed with API key gate on port 8080
- Port 11434 closed at firewall level
- Firewall attached to Droplet

**Faculty OCR time parser fix:**

`FacultyCORExtractor._convert_to_12hr()` — WMSU faculty IDPs write times without AM/PM markers. Fix applies heuristic: hours 1–6 = PM, hours 7–11 = AM.

| Time on document | Before | After |
|---|---|---|
| `5:30-7:00` | Dropped | `05:30PM–07:00PM` ✅ |
| `7:00-8:30` | Dropped | `07:00AM–08:30AM` ✅ |
| `11:30-1:00` | Dropped | `11:30AM–01:00PM` ✅ |
| `1:30-4:30` | Dropped | `01:30PM–04:30PM` ✅ |

---

## Current Pipeline Status

| Component | Status |
|---|---|
| Phase 1: Quality Gates & Telemetry | ✅ Complete |
| Phase 2: Staged Orchestration | ✅ Complete |
| Phase 3: Vision LLM Parser (primary) | ✅ Live |
| Legacy text LLM parser paths | ⚪ Disabled in runtime orchestration |
| `ExtractionJob` model + migrations | ✅ Done |
| `run_extraction_job()` background runner | ✅ Done |
| Upload views return 202 + launch thread | ✅ Done |
| `GET /api/extraction-jobs/{job_id}/` polling | ✅ Done |
| Push notification on job completion | ✅ Done (via `NotificationService`) |
| Security — Ollama port hardened | ✅ Complete |
| Faculty OCR time disambiguation | ✅ Fixed |
| Student COR handwritten extraction | ✅ Fixed |
| Frontend: Upload flow → poll → show result | ✅ Implemented |
| Frontend: Handle push notification → stop polling | ✅ Implemented |
| Backend: Admin extraction jobs API | ✅ Implemented (`GET /api/admin/extraction/jobs/`) |
| Frontend: Admin dashboard — job visibility | 🟡 Pending UI integration |
| `EXTRACTION_LLM_REQUIRE_MODEL_DIGEST=True` | 🟡 Pending burn-in telemetry |
| Confidence threshold recalibration | 🟡 Pending real-world LLM telemetry |

---

## Clear Next Steps

### Step 6 — Productionize Vision-First Mode

1. Set production env flags:
  - `EXTRACTION_LLM_VISION_PARSE_ENABLED=True`
  - `EXTRACTION_LLM_DIRECT_FILE_PARSE_ENABLED=True`
  - `EXTRACTION_LLM_VISION_MODEL_NAME=granite3.2-vision:2b`
  - `EXTRACTION_LLM_VISION_MAX_PAGES=2`
2. Keep legacy text flags disabled to enforce vision-only runtime:
  - `EXTRACTION_LLM_FULL_PARSE_ENABLED=False`
3. Monitor p50/p95 latency and failure categories for 1 week.

### Step 7 — Frontend: Admin Dashboard Job Visibility (optional)

Add an `ExtractionJob` list to the admin dashboard so admins can monitor stuck/failed jobs.

- Backend: `GET /api/admin/extraction/jobs/` is already implemented (filters: status, user, date, search)
- Frontend: add dashboard tab/table for pending/processing/done/failed breakdown and drill-down

### Step 8 — Threshold Recalibration

After 2–4 weeks of real-world LLM extraction traffic:
1. Pull `ExtractionLog` records where `llm_parse_success=True`
2. Analyze `confidence` distribution
3. Adjust `EXTRACTION_ACCEPT_THRESHOLD` (currently `0.85`) if LLM results are consistently rejected due to scoring model mismatch
4. Enable `EXTRACTION_LLM_REQUIRE_MODEL_DIGEST=True` once model version is confirmed stable

### Step 9 — Model Digest Lock

Once Ollama is confirmed stable on `granite3.2-vision:2b` for 48h+:
```
EXTRACTION_LLM_VISION_REQUIRE_MODEL_DIGEST = True
```
This prevents silent model upgrades from breaking extraction quality.

---

## Rollback Procedures

### Disable LLM primary parser (instant, no redeploy)
```
EXTRACTION_LLM_VISION_PARSE_ENABLED = False
EXTRACTION_LLM_DIRECT_FILE_PARSE_ENABLED = False
EXTRACTION_LLM_FULL_PARSE_ENABLED = False
```
Pipeline falls back to regex-only synchronous extraction.

### Disable LLM entirely
```
EXTRACTION_LLM_NORMALIZATION_ENABLED = False
EXTRACTION_LLM_FULL_PARSE_ENABLED = False
```

### Emergency: Revert to synchronous processing
In `upload_views.py`, comment out the thread launch block and restore a direct `extract_schedule()` call. The 201 response shape is still understood by older app versions.

---

## Risk Register

| Risk | Severity | Mitigation | Status |
|---|---|---|---|
| LLM timeout on large documents | Medium | 45s timeout; regex fallback runs automatically | ✅ Mitigated |
| Ollama Droplet goes down | Low | Regex fallback runs for all jobs | ✅ Mitigated |
| Async thread dies silently | **High** | `except Exception` safety net always marks job `failed` + notifies user | ✅ **Fixed** |
| Vision parse latency spikes on multi-page PDFs | Medium | Limit pages (`EXTRACTION_LLM_VISION_MAX_PAGES`), keep async UX and fallback | 🟡 Monitoring |
| Confidence too strict after LLM parse | Medium | Recalibrate after telemetry data — see Step 8 | 🟡 Pending |
| Digest mismatch after model update | Low | `VISION_REQUIRE_MODEL_DIGEST=False` currently — enable after burn-in | 🟡 Pending |
| Jobs stuck in `processing` if server restarts | Low | Startup recovery marks stale `processing` jobs as `failed` and notifies users | ✅ Fixed |
