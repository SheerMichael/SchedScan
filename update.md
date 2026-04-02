# SchedScan Extraction Pipeline — Master Update Log

**Last updated:** 2026-03-31 (23:30 PHT)

---

## Executive Summary

The extraction pipeline is now **vision-only, LLM-primary, async**.

- Primary mode: a vision-capable LLM interprets uploaded files directly (images and PDF page renders).
- Legacy OCR/pdfplumber paths are no longer required for normal processing when direct-file mode is enabled.
- Text LLM parsing paths were removed from runtime orchestration to reduce complexity.
- Validation, scoring, ownership checks, async jobs, polling, and push notifications remain in place as reliability guardrails.

Recommended production model for current infrastructure: `granite3.2-vision:2b`.

### Critical Reality Check (2026-03-31)

We made real progress, but rollout readiness was delayed by configuration drift and access-control debugging.

**What we actually accomplished during the deployment hardening cycle:**

- Restored Droplet SSH access after connectivity and console handshake issues.
- Identified the root cause of repeated nginx `403` responses: mismatched key testing (`placeholder`/empty variable values vs enforced nginx key).
- Confirmed nginx API-key gate behavior now works as intended: no-key requests return `403`, correct key returns `200`.
- Updated App Platform extraction flags to vision-only runtime settings.

**What we confirmed during runtime triage (late-session):**

- Model and gateway are healthy at rest (`ollama list` includes `granite3.2-vision:2b`; nginx key gate returns expected `403/200`).
- Primary production failure was **runtime memory pressure** on the 4GB Ollama Droplet during model runner startup:
  - Ollama logs showed `llama runner process has terminated: signal: killed` and `timed out waiting for llama runner to start`.
- Mitigations were applied on the Droplet:
  - 6GB swap file enabled and persisted in `/etc/fstab`.
  - Ollama service constrained to single-model/single-parallel execution (`OLLAMA_NUM_PARALLEL=1`, `OLLAMA_MAX_LOADED_MODELS=1`, `OLLAMA_KEEP_ALIVE=5m`).
  - Post-mitigation `curl /api/generate` with API key returned successful JSON response.

**What is still required before calling rollout complete:**

- Run end-to-end production smoke tests (upload -> `202` -> polling terminal state -> DB write + push behavior) after the memory fix.
- Apply upload-type threshold overrides in App Platform (faculty currently over-rejected by global threshold).
- Capture burn-in telemetry window (confidence and failure categories) before digest lock.

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
| `EXTRACTION_LLM_VISION_REQUIRE_MODEL_DIGEST` | `False` *(enable after burn-in)* |
| `EXTRACTION_LLM_VISION_MODEL_DIGEST` | *(optional until digest lock)* |
| `EXTRACTION_LLM_FULL_PARSE_ENABLED` | `False` *(legacy path, not used by runtime orchestration)* |
| `EXTRACTION_LLM_STARTUP_CHECK_ENABLED` | `True` |
| `EXTRACTION_LLM_STARTUP_CHECK_STRICT` | `False` |
| `EXTRACTION_LLM_STARTUP_CHECK_TIMEOUT_SECONDS` | `2` |
| `EXTRACTION_LLM_MODEL_NAME` | *(optional, legacy only)* |
| `EXTRACTION_LLM_API_KEY` | `<redacted-secret-in-do-app-platform>` |
| `EXTRACTION_LLM_MODEL_DIGEST` | *(optional, legacy only)* |
| `EXTRACTION_LLM_REQUIRE_MODEL_DIGEST` | `False` *(legacy only)* |
| `EXTRACTION_LLM_TIMEOUT_SECONDS` | `45` |

#### Scoring / Threshold Overrides (recommended for current rollout)

| Key | Value | Notes |
|---|---|---|
| `EXTRACTION_ACCEPT_THRESHOLD_STUDENT` | `0.85` | Keep strict ownership/student quality guard |
| `EXTRACTION_RETRY_THRESHOLD_STUDENT` | `0.60` | Existing student retry floor |
| `EXTRACTION_ACCEPT_THRESHOLD_FACULTY` | `0.72` | Reduces false low-confidence rejects on faculty files |
| `EXTRACTION_RETRY_THRESHOLD_FACULTY` | `0.50` | Keeps fallback behavior without over-rejecting |

#### Ollama Droplet Runtime Overrides (systemd)

| Setting | Value |
|---|---|
| `OLLAMA_NUM_PARALLEL` | `1` |
| `OLLAMA_MAX_LOADED_MODELS` | `1` |
| `OLLAMA_KEEP_ALIVE` | `5m` |
| Swap | `6GB /swapfile` enabled |

#### Quality Gate Settings

| Key | Value |
|---|---|
| `EXTRACTION_ACCEPT_THRESHOLD` | `0.85` |
| `EXTRACTION_RETRY_THRESHOLD` | `0.60` |

---

## Session History

### 2026-03-31 (Session 7) — Production Runtime Stability + Ownership Hotfix ✅ IMPLEMENTED

**Goal:** Resolve persistent production failures after deployment (`low_confidence`, `student_number missing`) and complete high-signal diagnostics.

#### Runtime Findings

- Ollama runtime was reachable but model runner frequently died under load on the 4GB Droplet (`signal: killed`).
- This produced downstream symptoms in app flows:
  - faculty uploads ending as `low_confidence`,
  - student uploads failing ownership gate with `STUDENT_NUMBER_MISSING`.

#### Infrastructure Mitigations Applied

- Added and activated `6GB` swap.
- Added Ollama systemd overrides to reduce memory spikes:
  - `OLLAMA_NUM_PARALLEL=1`
  - `OLLAMA_MAX_LOADED_MODELS=1`
  - `OLLAMA_KEEP_ALIVE=5m`
- Restarted Ollama and validated direct generate call success via nginx key-gated endpoint.

#### Code Hotfixes Pushed to `main`

- Commit `f633159`:
  - LLM JSON parse recovery for wrapped outputs.
  - Schema-safe sanitization before validation.
  - Reduced brittle scoring penalties for optional fields.
  - Day/time validation hardening for real faculty formats.
- Commit `8e97d2d`:
  - Student number normalization and raw-text recovery fallback during synchronous ownership verification.
  - Supports compact and spaced formats (`YYYYNNNNN`, `YYYY NNNNN`, `YYYY-NNNNN`).

#### Validation

```bash
39 targeted tests passed (validators + llm normalizer + redaction + ownership helpers)
```

### 2026-03-31 (Session 6) — Admin Visibility Integration ✅ IMPLEMENTED

**Goal:** Complete admin-side operational visibility for async extraction jobs.

#### Code Changes

- Commit `b79325e`:
  - Added admin API client support for `GET /api/admin/extraction/jobs/`.
  - Added Extraction Jobs tab to admin health screen with:
    - status/upload-type/date filters,
    - queue breakdown cards,
    - paginated table,
    - per-job detail modal.

#### Validation

```bash
Admin production build succeeded (Vite build OK)
```

### 2026-03-31 (Session 5) — Deployment Hardening + Config Drift Fixes ✅ IN PROGRESS

**Goal:** Complete production readiness for vision-only runtime after infra and auth-key troubleshooting.

#### Accomplishments

- Restored administrative access path to Droplet (SSH + operational console workflow).
- Validated network path: public proxy port `8080` reachable while SSH required targeted recovery.
- Corrected nginx/API-key verification process and confirmed expected gate behavior:
  - Missing key -> `403`
  - Correct key -> `200`
- Reconciled App Platform extraction env vars to vision-first settings (`VISION_PARSE=True`, `DIRECT_FILE_PARSE=True`, `FULL_PARSE=False`).

#### Root Cause of Delay

- Repeated `403` checks were caused by key mismatch during manual tests:
  - placeholder values used in curl headers,
  - silent `read -s` usage with empty variable in some attempts,
  - nginx enforcing a different key than the one being tested.

#### Remaining Operational Work

- Confirm vision model presence on Droplet (`granite3.2-vision:2b`).
- Perform full production smoke test cycle.
- Rotate key again and keep it synchronized across nginx + App Platform.

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
| Phase 3: Vision LLM Parser (primary) | 🟡 Code complete; production validation in progress |
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
| Nginx `X-Api-Key` gate verification | ✅ Fixed (403 without key, 200 with correct key) |
| SSH / Droplet ops access stability | ✅ Recovered |
| Vision model installed on Droplet | ✅ Confirmed (`granite3.2-vision:2b`) |
| Frontend: Admin dashboard — job visibility | ✅ Implemented and pushed (`b79325e`) |
| Ollama runtime memory stabilization | ✅ Swap + single-runner constraints applied |
| Student ownership fallback for missing ID formats | ✅ Implemented and pushed (`8e97d2d`) |
| `EXTRACTION_LLM_REQUIRE_MODEL_DIGEST=True` | 🟡 Pending burn-in telemetry |
| Confidence threshold recalibration | 🟡 Pending upload-type threshold rollout + telemetry |

---

## Clear Next Steps

### Step 6 — Complete Productionization (Post-Runtime-Stabilization)

1. Keep runtime stability controls in place on Droplet:
  - ensure `/swapfile` remains active after reboot (`swapon --show`)
  - ensure Ollama service override env vars are loaded (`systemctl show ollama --property=Environment`)
2. Re-validate key gate quickly:
  - no key -> `403`
  - correct key -> `200`
3. Confirm production env flags:
  - `EXTRACTION_LLM_VISION_PARSE_ENABLED=True`
  - `EXTRACTION_LLM_DIRECT_FILE_PARSE_ENABLED=True`
  - `EXTRACTION_LLM_VISION_MODEL_NAME=granite3.2-vision:2b`
  - `EXTRACTION_LLM_VISION_MAX_PAGES=1` (temporary stabilization mode)
  - `EXTRACTION_LLM_FULL_PARSE_ENABLED=False`
4. Apply upload-type thresholds:
  - `EXTRACTION_ACCEPT_THRESHOLD_FACULTY=0.72`
  - `EXTRACTION_RETRY_THRESHOLD_FACULTY=0.50`
5. Run smoke tests (student + faculty uploads) and record outcomes.

### Step 7 — End-to-End Production Verification (required)

Run and log at least 5 representative files:

1. 2 clean PDFs
2. 1 image-based upload
3. 1 low-quality/noisy input
4. 1 failure-path sample

Acceptance criteria:

- Upload endpoint returns `202` consistently.
- Polling endpoint reaches terminal state (`done` or `failed`) without hanging.
- Successful runs write expected course rows.
- Failure runs provide actionable `failure_category`.

### Step 8 — Frontend: Admin Dashboard Job Visibility (optional)

1. Set production env flags:
  - `EXTRACTION_LLM_VISION_PARSE_ENABLED=True`
  - `EXTRACTION_LLM_DIRECT_FILE_PARSE_ENABLED=True`
  - `EXTRACTION_LLM_VISION_MODEL_NAME=granite3.2-vision:2b`
  - `EXTRACTION_LLM_VISION_MAX_PAGES=2`
2. Keep legacy text flags disabled to enforce vision-only runtime:
  - `EXTRACTION_LLM_FULL_PARSE_ENABLED=False`
3. Monitor p50/p95 latency and failure categories for 1 week.

Add an `ExtractionJob` list to the admin dashboard so admins can monitor stuck/failed jobs.

- Backend: `GET /api/admin/extraction/jobs/` is already implemented (filters: status, user, date, search)
- Frontend: add dashboard tab/table for pending/processing/done/failed breakdown and drill-down

### Step 9 — Threshold Recalibration

After 2–4 weeks of real-world LLM extraction traffic:
1. Pull `ExtractionLog` records where `llm_parse_success=True`
2. Analyze `confidence` distribution
3. Adjust `EXTRACTION_ACCEPT_THRESHOLD` (currently `0.85`) if LLM results are consistently rejected due to scoring model mismatch
4. Enable `EXTRACTION_LLM_REQUIRE_MODEL_DIGEST=True` once model version is confirmed stable

### Step 10 — Model Digest Lock

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
| Confidence too strict after LLM parse (faculty) | Medium | Upload-type thresholds + telemetry recalibration | 🟡 In progress |
| Digest mismatch after model update | Low | `VISION_REQUIRE_MODEL_DIGEST=False` currently — enable after burn-in | 🟡 Pending |
| Jobs stuck in `processing` if server restarts | Low | Startup recovery marks stale `processing` jobs as `failed` and notifies users | ✅ Fixed |
| Ollama runner OOM on 4GB host | High | 6GB swap + single parallel/loaded model constraints | ✅ Mitigated |
