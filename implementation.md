# SchedScan: Schedule Extraction Pipeline - Implementation Reference

> Status: Active production profile with strict vision-only execution, adaptive budgets, and chunked parsing path.
> Last updated: 2026-04-10 (Session 12)
> Architecture: Vision-first LLM primary, async job lifecycle, no runtime regex fallback in strict mode.

## 1. Current Runtime Model

SchedScan now runs extraction as a vision-first async pipeline:

1. Upload endpoint accepts file and immediately returns `202` with `job_id`.
2. Background worker thread runs extraction and persistence.
3. Vision parser (`parse_document_with_llm_vision`) is the primary parser.
4. In strict production mode (`EXTRACTION_VISION_ONLY_MODE=True`), OCR/regex fallback is disabled.
5. Polling endpoint and push notifications deliver terminal result (`done` or `failed`).

The runtime target model is `granite3.2-vision:2b` through nginx key-gated proxy.

## 2. End-to-End Flow

```text
POST /api/upload-cor/{student|faculty}/
  -> create ExtractionJob(status=pending)
  -> submit bounded worker thread
  -> return 202 { job_id, status: "processing" }

Background worker:
  -> ExtractionJob.status = processing
  -> ExtractionManager.extract_schedule()
  -> parse_document_with_llm_vision(...)
  -> validate + score
  -> persist Schedule + Course rows on success
  -> write ExtractionLog telemetry
  -> send push notification
  -> mark done or failed

GET /api/extraction-jobs/{job_id}/
  -> processing | done | failed
```

## 3. Vision Parser Behavior

Main implementation file:
- `backend/api/utils/extraction/llm_normalizer.py`

### 3.1 Prompt/response contract

The parser requests strict JSON with:
- `doc_metadata.student_number`
- `doc_metadata.semester`
- `doc_metadata.school_year`
- `courses[]` items including code, day, start/end time, location

Response is sanitized and schema-checked before returning courses.

### 3.2 Adaptive budget profile (Session 12)

New adaptive controls select per-attempt budgets based on file complexity:
- file size (MB)
- image megapixels
- tier classification (`normal`, `heavy`, `very_heavy`)

Adaptive first-pass can shrink:
- timeout budget
- page count
- max tokens
- image edge/quality
- PDF DPI

Optional grayscale on first pass is now supported for heavy documents.

### 3.3 Chunked image slicing mode (Option 1, Session 12)

For tall/complex documents, parser can split each prepared page/image into horizontal chunks:
- configurable chunk count
- configurable overlap ratio
- minimum height guard
- maximum emitted chunk cap

Each chunk is sent as an individual vision request, then merged:
- metadata merged first-non-empty by field
- courses merged and deduplicated
- telemetry records chunk_count, chunk_success_count, chunk_error_count, deduped_course_count

This reduces single-request context pressure and improves recoverability on dense pages.

### 3.4 Metadata gate tuning

`parse_document_metadata_with_llm_vision()` now uses dedicated preprocessing budgets:
- separate connect/read timeout tuple
- smaller image edge and quality
- lower metadata PDF DPI
- optional grayscale

Goal: faster ownership gate with less compute overhead.

## 4. Async Worker Safety

Upload worker scheduling lives in:
- `backend/api/views/upload_views.py`

Current protections:
- bounded semaphore limits in-process extraction threads
- worker wrapper always releases slot on completion
- stale slot reconciliation helper repairs leaked permits in abnormal/mock thread scenarios

Session 12 added `_repair_extraction_thread_slots_if_needed()` to avoid false `EXTRACTION_BUSY` saturation when test/mocked thread lifecycles do not release permits normally.

## 5. ExtractionJob Lifecycle

States:
- `pending`
- `processing`
- `done`
- `failed`

Terminal payload behavior:
- `done`: includes extracted and persisted courses/schedule metadata
- `failed`: includes failure category (`timeout`, `low_confidence`, `parse_error`, etc.) with retryable messaging where applicable

Important behavior from Session 11+12:
- if no courses are extracted, confidence is normalized to `0.0` to avoid misleading mid-confidence artifacts
- timeout failures are classified explicitly as `timeout`

## 6. Configuration Reference (Current Controls)

### 6.1 Core strict-vision flags

| Key | Purpose |
|---|---|
| `EXTRACTION_VISION_ONLY_MODE` | Enforce direct vision path |
| `EXTRACTION_LLM_DIRECT_FILE_PARSE_ENABLED` | Enable direct-file vision parser |
| `EXTRACTION_LLM_DIRECT_FILE_FALLBACK_ON_REJECT` | Fallback toggle (disabled in strict profile) |
| `EXTRACTION_LLM_VISION_PARSE_ENABLED` | Vision parser master toggle |

### 6.2 Adaptive budget knobs (added Session 12)

| Key |
|---|
| `EXTRACTION_LLM_VISION_ADAPTIVE_BUDGET_ENABLED` |
| `EXTRACTION_LLM_VISION_ADAPTIVE_GRAYSCALE_ENABLED` |
| `EXTRACTION_LLM_VISION_ADAPTIVE_FIRST_PASS_TIMEOUT_SECONDS` |
| `EXTRACTION_LLM_VISION_ADAPTIVE_FILE_SIZE_MB_LARGE` |
| `EXTRACTION_LLM_VISION_ADAPTIVE_FILE_SIZE_MB_HUGE` |
| `EXTRACTION_LLM_VISION_ADAPTIVE_IMAGE_MP_LARGE` |
| `EXTRACTION_LLM_VISION_ADAPTIVE_IMAGE_MP_HUGE` |

### 6.3 Chunking knobs (Option 1 rollout)

| Key |
|---|
| `EXTRACTION_LLM_VISION_CHUNKING_ENABLED` |
| `EXTRACTION_LLM_VISION_CHUNKING_FORCE_ENABLED` |
| `EXTRACTION_LLM_VISION_CHUNK_COUNT` |
| `EXTRACTION_LLM_VISION_CHUNK_OVERLAP_RATIO` |
| `EXTRACTION_LLM_VISION_CHUNKING_MIN_HEIGHT_PX` |
| `EXTRACTION_LLM_VISION_CHUNKING_MAX_CHUNKS` |

### 6.4 Metadata gate knobs (added Session 12)

| Key |
|---|
| `EXTRACTION_LLM_VISION_METADATA_IMAGE_MAX_EDGE` |
| `EXTRACTION_LLM_VISION_METADATA_IMAGE_QUALITY` |
| `EXTRACTION_LLM_VISION_METADATA_PDF_DPI` |
| `EXTRACTION_LLM_VISION_METADATA_GRAYSCALE_ENABLED` |

### 6.5 Request/retry core knobs

| Key |
|---|
| `EXTRACTION_LLM_TIMEOUT_SECONDS` |
| `EXTRACTION_LLM_VISION_CONNECT_TIMEOUT_SECONDS` |
| `EXTRACTION_LLM_VISION_RETRY_COUNT` |
| `EXTRACTION_LLM_VISION_RETRY_TIMEOUT_SECONDS` |
| `EXTRACTION_LLM_VISION_MAX_TOKENS` |
| `EXTRACTION_LLM_VISION_RETRY_MAX_TOKENS` |
| `EXTRACTION_LLM_VISION_MAX_PAGES` |
| `EXTRACTION_LLM_VISION_RETRY_MAX_PAGES` |
| `EXTRACTION_LLM_VISION_IMAGE_MAX_EDGE` |
| `EXTRACTION_LLM_VISION_IMAGE_QUALITY` |
| `EXTRACTION_LLM_VISION_PDF_DPI` |
| `EXTRACTION_LLM_VISION_RETRY_PDF_DPI` |

## 7. Operational Profile (DigitalOcean)

Current known infrastructure:
- App Platform service: `schedscan-5gfy`
- Ollama droplet: `ollama-schedscan` (`s-2vcpu-8gb`)
- nginx key-gated proxy: `http://209.97.172.45:8080`

Runtime hardening already applied:
- `OLLAMA_NUM_PARALLEL=1`
- `OLLAMA_MAX_LOADED_MODELS=1`
- `OLLAMA_KEEP_ALIVE=30m`
- swap enabled (`6GB`)

## 8. API Contract

### Upload

`POST /api/upload-cor/student/`
`POST /api/upload-cor/faculty/`

Returns `202`:

```json
{
  "job_id": "uuid",
  "status": "processing",
  "message": "Your file is being processed. We'll notify you when it's ready."
}
```

### Poll

`GET /api/extraction-jobs/{job_id}/`

Returns status payload:
- processing
- done (with courses/confidence/extraction metadata)
- failed (with failure_category/message/retryable)

## 9. Validation and Scoring

Post-parse validation always runs:
- required fields
- day/time normalization and constraints
- duplicate collapse
- ownership checks for student uploads

Scoring gates acceptance. In strict mode there is no regex rescue path if vision fails.

## 10. Testing and Verification

Session 12 backend verification after adaptive + chunking implementation:

```bash
cd backend
python manage.py test api.tests.test_llm_normalizer --keepdb
python manage.py test api.tests.test_extraction api.tests.test_extraction_health --keepdb
```

Observed results during this implementation cycle:
- `test_llm_normalizer`: 31 passed
- `test_extraction + test_extraction_health`: 101 passed

New test coverage added in Session 12:
- retry timeout profile can be lower than base timeout
- adaptive heavy-tier budget behavior
- chunked request merge + dedupe behavior
- metadata gate connect/read timeout tuple

## 11. Changed Files (Session 12)

Backend code:
- `backend/api/utils/extraction/llm_normalizer.py`
- `backend/core/settings.py`
- `backend/api/views/upload_views.py`
- `backend/api/tests/test_llm_normalizer.py`

Documentation:
- `implementation.md`
- `update.md`

## 12. Known Remaining Work

1. Run focused production smoke set against prior timeout samples after chunking rollout.
2. Keep monitoring `llm_failure_reason` distribution for timeout trend change.
3. If timeout rate remains high, proceed with Option 2 fallback strategy or queue-worker refactor.
