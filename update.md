# SchedScan Extraction Pipeline — Master Update Log

**Last updated:** 2026-03-25 (14:32 PHT)

---

## Executive Summary

The extraction pipeline has been fully migrated to a **LLM-primary, async** architecture. The LLM (Ollama on DigitalOcean) is the main processor — it reads raw OCR/PDF text and intelligently identifies student numbers, subjects, schedules, and locations. Regex parsers are retained as a silent automatic fallback. Processing runs asynchronously: uploads return a `202 Accepted` immediately, jobs run in background threads, push notifications and a polling endpoint are wired to inform the frontend when extraction completes.

---

## Architecture — Implemented and Live

```
File upload
    │
    ▼
Text extraction (OCR / pdfplumber)
    │
    ├── Student COR: sync ownership check (student_number must match user)
    │       └── fails → 403/422 (synchronous, no thread launched)
    │
    ├── 202 Accepted immediately (user continues using app)
    │
    └── Background daemon thread (run_extraction_job):
             │
             ▼
         ExtractionJob status → 'processing'
             │
             ▼
         LLM (Ollama — PRIMARY): llama3.2:3b
         identifies: student_number, subjects, schedule, location
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
| Regex (`StudentCORExtractor` etc.) | Primary parser | **Silent fallback only** |
| LLM `parse_with_llm()` | Last-resort fallback | **Primary parser — runs first** |
| Processing mode | Synchronous (blocks request) | **Async — 202 + polling + push notification** |

---

## What the LLM Extracts

- `student_number` (required for student COR)
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
| Model | `llama3.2:3b` |
| Model digest | `a80c4f17acd55265feec403c7aef86be0c25983ab279d83f3bcd3abbcb5b8b72` |

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
| `EXTRACTION_LLM_FULL_PARSE_ENABLED` | `True` ← **must be set** |
| `EXTRACTION_LLM_STARTUP_CHECK_ENABLED` | `True` |
| `EXTRACTION_LLM_STARTUP_CHECK_STRICT` | `False` |
| `EXTRACTION_LLM_MODEL_NAME` | `llama3.2:3b` |
| `EXTRACTION_LLM_API_KEY` | `<redacted-secret-in-do-app-platform>` |
| `EXTRACTION_LLM_MODEL_DIGEST` | `a80c4f17acd55265feec403c7aef86be0c25983ab279d83f3bcd3abbcb5b8b72` |
| `EXTRACTION_LLM_REQUIRE_MODEL_DIGEST` | `False` *(enable after stable burn-in)* |
| `EXTRACTION_LLM_TIMEOUT_SECONDS` | `45` |

#### Quality Gate Settings

| Key | Value |
|---|---|
| `EXTRACTION_ACCEPT_THRESHOLD` | `0.85` |
| `EXTRACTION_RETRY_THRESHOLD` | `0.60` |

---

## Session History

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
| Phase 3: LLM Normalization (Stage A) | ✅ Live and secured |
| Phase 3B: LLM Full Parser (Stage B — primary) | ✅ Implemented |
| `ExtractionJob` model + migrations | ✅ Done |
| `run_extraction_job()` background runner | ✅ Done |
| Upload views return 202 + launch thread | ✅ Done |
| `GET /api/extraction-jobs/{job_id}/` polling | ✅ Done |
| Push notification on job completion | ✅ Done (via `NotificationService`) |
| Security — Ollama port hardened | ✅ Complete |
| Faculty OCR time disambiguation | ✅ Fixed |
| Student COR handwritten extraction | ✅ Fixed |
| **Frontend: Upload flow → poll → show result** | 🔴 Not yet implemented |
| **Frontend: Handle push notification → stop polling** | 🔴 Not yet implemented |
| **Frontend: Admin dashboard — job visibility** | 🟡 Optional / future |
| `EXTRACTION_LLM_REQUIRE_MODEL_DIGEST=True` | 🟡 Pending burn-in telemetry |
| Confidence threshold recalibration | 🟡 Pending real-world LLM telemetry |

---

## Clear Next Steps

### Step 6 — Frontend: Async Upload UX (mobile)

**Files:** `frontend/schedscan/services/courseService.ts`, scan screen(s), `_layout.tsx`

1. **Upload call** — after `POST /api/upload-cor/student/`, read `job_id` from the 202 response instead of reading courses directly.
2. **Polling loop** — implement a polling function in `courseService.ts`:
   ```ts
   async function pollExtractionJob(jobId: string, maxAttempts = 10): Promise<JobResult> {
     for (let i = 0; i < maxAttempts; i++) {
       await sleep(3000);
       const res = await api.get(`/extraction-jobs/${jobId}/`);
       if (res.data.status === 'done' || res.data.status === 'failed') return res.data;
     }
     return { status: 'timeout' };
   }
   ```
3. **UI states** — show a loading/spinner state while polling. On `done`, navigate to schedule. On `failed`, show the `message` with a retry button. On `timeout`, show "We'll notify you when done".
4. **Push notification handler** — when a `data.type === 'extraction_job'` notification arrives, cancel any active poll and navigate to schedule if `status === 'done'`. Use `expo-notifications` `addNotificationResponseReceivedListener`.

### Step 7 — Frontend: Admin Dashboard Job Visibility (optional)

Add an `ExtractionJob` list to the admin dashboard so admins can monitor stuck/failed jobs.

- Backend: add `GET /api/admin/extraction-jobs/` (filter by status, user, date)
- Frontend: new admin page showing pending/processing/done/failed breakdown

### Step 8 — Threshold Recalibration

After 2–4 weeks of real-world LLM extraction traffic:
1. Pull `ExtractionLog` records where `llm_parse_success=True`
2. Analyze `confidence` distribution
3. Adjust `EXTRACTION_ACCEPT_THRESHOLD` (currently `0.85`) if LLM results are consistently rejected due to scoring model mismatch
4. Enable `EXTRACTION_LLM_REQUIRE_MODEL_DIGEST=True` once model version is confirmed stable

### Step 9 — Model Digest Lock

Once Ollama is confirmed stable on `llama3.2:3b` for 48h+:
```
EXTRACTION_LLM_REQUIRE_MODEL_DIGEST = True
```
This prevents silent model upgrades from breaking extraction quality.

---

## Rollback Procedures

### Disable LLM primary parser (instant, no redeploy)
```
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
| Ollama Droplet goes down | Low | Regex fallback runs for all jobs — no disruption | ✅ Mitigated |
| Async thread dies silently | **High** | `except Exception` safety net always marks job `failed` + notifies user | ✅ **Fixed** |
| Frontend not updated to handle 202 | Medium | App will receive 202 without courses — treat as error | 🔴 **Open — Step 6** |
| Confidence too strict after LLM parse | Medium | Recalibrate after telemetry data — see Step 8 | 🟡 Pending |
| Digest mismatch after model update | Low | `REQUIRE_MODEL_DIGEST=False` currently — enable after burn-in | 🟡 Pending |
| Jobs stuck in `processing` if server restarts | Low | On restart, scan for `processing` jobs older than 5min and mark `failed` | 🔴 Not yet implemented |
