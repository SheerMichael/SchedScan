# SchedScan: Schedule Extraction Pipeline - Implementation Reference

> Status: Active production profile with cloud vision primary (Gemini), async job lifecycle, strict vision-only mode.
> Last updated: 2026-04-12 (Session 13)
> Architecture: Cloud-first vision LLM primary, async job lifecycle, on-device OCR fallback planned.

## 1. Current Runtime Model

SchedScan runs extraction as a cloud-first async pipeline:

1. Upload endpoint accepts file and immediately returns `202` with `job_id`.
2. Background worker thread runs extraction and persistence.
3. Cloud vision parser (`parse_document_with_cloud_vision` → Gemini API) is the primary parser.
4. In `auto` mode, if cloud providers fail, the system falls back to Ollama code path (currently a dead path since the droplet was decommissioned).
5. In strict production mode (`EXTRACTION_VISION_ONLY_MODE=True`), local OCR/regex fallback is disabled on the server.
6. Polling endpoint and push notifications deliver terminal result (`done` or `failed`).

The runtime primary model is **Gemini 2.5 Flash Lite** through Google's free-tier REST API.

## 2. End-to-End Flow

```text
POST /api/upload-cor/{student|faculty}/
  -> create ExtractionJob(status=pending)
  -> submit bounded worker thread
  -> return 202 { job_id, status: "processing" }

Background worker:
  -> ExtractionJob.status = processing
  -> ExtractionManager.extract_schedule()
  -> parse_document_with_llm_vision() 
       ↳ EXTRACTION_LLM_PROVIDER=auto
       ↳ cloud_llm_client.parse_document_with_cloud_vision()
            ↳ Gemini REST API (1-3s)
            ↳ Groq failover (planned)
  -> validate + score
  -> persist Schedule + Course rows on success
  -> write ExtractionLog telemetry
  -> send push notification
  -> mark done or failed

GET /api/extraction-jobs/{job_id}/
  -> processing | done | failed
```

## 3. Cloud Vision Client

### 3.1 Module: `backend/api/utils/extraction/cloud_llm_client.py`

Provider-agnostic cloud vision client. Two public entry points:

- `parse_document_with_cloud_vision(file_path, upload_type)` → `(courses, doc_metadata, telemetry)`
- `parse_document_metadata_with_cloud_vision(file_path, upload_type)` → `(doc_metadata, telemetry)`

### 3.2 Provider implementations

| Provider | Function | API Style | Free Tier |
|---|---|---|---|
| **Gemini** | `_call_gemini_vision()` | REST (generativelanguage.googleapis.com) | ~1000 RPD, 15 RPM |
| **Groq** | `_call_groq_vision()` | OpenAI-compatible REST | ~1000 RPD, 30 RPM |

### 3.3 Provider routing

Routing is controlled by `EXTRACTION_LLM_PROVIDER`:

| Value | Behavior |
|---|---|
| `ollama` | Ollama only (legacy, default) |
| `gemini` | Gemini only |
| `groq` | Groq only |
| `cloud` | Gemini → Groq |
| `auto` | Gemini → Groq → Ollama fallback |

In `auto` mode, the routing preamble in `llm_normalizer.py` tries cloud first. If cloud succeeds, returns immediately. If cloud fails and provider is `auto`, falls through to existing Ollama code.

### 3.4 Design decisions

- **No SDK dependency** — both providers accessed via `requests` (already in requirements.txt)
- **Lazy imports** — shared helpers imported from `llm_normalizer.py` at call time to avoid circular dependencies
- **Same telemetry format** — `llm_provider` added to telemetry dict, all other fields compatible with downstream scoring/logging
- **Existing Ollama code untouched** — zero risk of regression on the legacy path

## 4. Vision Parser Behavior (Ollama Legacy Path)

Main implementation file:
- `backend/api/utils/extraction/llm_normalizer.py`

### 4.1 Prompt/response contract

The parser requests strict JSON with:
- `doc_metadata.student_number`
- `doc_metadata.semester`
- `doc_metadata.school_year`
- `courses[]` items including code, day, start/end time, location

Response is sanitized and schema-checked before returning courses.

### 4.2 Adaptive budget profile (Session 12)

Adaptive controls select per-attempt budgets based on file complexity:
- file size (MB)
- image megapixels
- tier classification (`normal`, `heavy`, `very_heavy`)

### 4.3 Chunked image slicing mode (Session 12)

For tall/complex documents, parser can split each prepared page/image into horizontal chunks with configurable overlap, count, and height guards. Results are merged and deduplicated.

### 4.4 Metadata gate tuning

`parse_document_metadata_with_llm_vision()` uses dedicated preprocessing budgets with separate connect/read timeout tuple, smaller image edge/quality, and optional grayscale.

## 5. OCR/Regex Extraction (Server-Side)

### 5.1 Module: `backend/api/utils/ocr.py`

Existing OCR module with two extractor classes:

- `StudentCORExtractor` — WMSU student COR format with formal parser + handwritten fallback
- `FacultyCORExtractor` — Faculty IDP format with day-label based parsing

Both support:
- PDF text extraction via `pdfplumber`
- Image OCR via `pytesseract`
- Day code expansion (multi-day splits)
- Student number extraction from document headers

### 5.2 Current status

- **Server-side:** Disabled in production by `EXTRACTION_VISION_ONLY_MODE=True`
- **On-device (planned):** The regex patterns from `ocr.py` will be ported to TypeScript for offline extraction on mobile

## 6. Async Worker Safety

Upload worker scheduling lives in:
- `backend/api/views/upload_views.py`

Current protections:
- bounded semaphore limits in-process extraction threads
- worker wrapper always releases slot on completion
- stale slot reconciliation helper repairs leaked permits

With cloud inference at 1-3s (vs 30-120s on Ollama), concurrency has been increased:
- `EXTRACTION_ASYNC_MAX_RUNNING_THREADS`: 1 → **3**
- `EXTRACTION_ASYNC_MAX_INFLIGHT_GLOBAL`: 2 → **4**

## 7. ExtractionJob Lifecycle

States: `pending` → `processing` → `done` | `failed`

Terminal payload behavior:
- `done`: includes extracted and persisted courses/schedule metadata
- `failed`: includes failure category (`timeout`, `low_confidence`, `parse_error`, etc.) with retryable messaging

Important behaviors:
- if no courses are extracted, confidence is normalized to `0.0`
- timeout failures are classified explicitly as `timeout`
- cloud provider name is recorded in telemetry

## 8. Configuration Reference (Current Controls)

### 8.1 Cloud provider settings (Session 13)

| Key | Purpose |
|---|---|
| `EXTRACTION_LLM_PROVIDER` | Provider routing (`auto` = cloud first, Ollama fallback) |
| `EXTRACTION_GEMINI_API_KEY` | Google Gemini API key (free tier) |
| `EXTRACTION_GEMINI_MODEL` | Gemini model name (default: `gemini-2.5-flash-lite`) |
| `EXTRACTION_GROQ_API_KEY` | Groq API key (free tier, pending) |
| `EXTRACTION_GROQ_MODEL` | Groq model name (default: `meta-llama/llama-4-scout-17b-16e-instruct`) |
| `EXTRACTION_CLOUD_TIMEOUT_SECONDS` | Timeout for cloud API calls (default: 30) |

### 8.2 Core strict-vision flags

| Key | Purpose |
|---|---|
| `EXTRACTION_VISION_ONLY_MODE` | Enforce direct vision path |
| `EXTRACTION_LLM_DIRECT_FILE_PARSE_ENABLED` | Enable direct-file vision parser |
| `EXTRACTION_LLM_DIRECT_FILE_FALLBACK_ON_REJECT` | Fallback toggle (disabled in strict profile) |
| `EXTRACTION_LLM_VISION_PARSE_ENABLED` | Vision parser master toggle |

### 8.3 Adaptive budget knobs (Session 12)

| Key |
|---|
| `EXTRACTION_LLM_VISION_ADAPTIVE_BUDGET_ENABLED` |
| `EXTRACTION_LLM_VISION_ADAPTIVE_GRAYSCALE_ENABLED` |
| `EXTRACTION_LLM_VISION_ADAPTIVE_FIRST_PASS_TIMEOUT_SECONDS` |
| `EXTRACTION_LLM_VISION_ADAPTIVE_FILE_SIZE_MB_LARGE` |
| `EXTRACTION_LLM_VISION_ADAPTIVE_FILE_SIZE_MB_HUGE` |
| `EXTRACTION_LLM_VISION_ADAPTIVE_IMAGE_MP_LARGE` |
| `EXTRACTION_LLM_VISION_ADAPTIVE_IMAGE_MP_HUGE` |

### 8.4 Chunking knobs (Session 12)

| Key |
|---|
| `EXTRACTION_LLM_VISION_CHUNKING_ENABLED` |
| `EXTRACTION_LLM_VISION_CHUNKING_FORCE_ENABLED` |
| `EXTRACTION_LLM_VISION_CHUNK_COUNT` |
| `EXTRACTION_LLM_VISION_CHUNK_OVERLAP_RATIO` |
| `EXTRACTION_LLM_VISION_CHUNKING_MIN_HEIGHT_PX` |
| `EXTRACTION_LLM_VISION_CHUNKING_MAX_CHUNKS` |

### 8.5 Metadata gate knobs (Session 12)

| Key |
|---|
| `EXTRACTION_LLM_VISION_METADATA_IMAGE_MAX_EDGE` |
| `EXTRACTION_LLM_VISION_METADATA_IMAGE_QUALITY` |
| `EXTRACTION_LLM_VISION_METADATA_PDF_DPI` |
| `EXTRACTION_LLM_VISION_METADATA_GRAYSCALE_ENABLED` |

### 8.6 Ollama legacy knobs (retained for backward compatibility)

| Key |
|---|
| `EXTRACTION_LLM_BASE_URL` |
| `EXTRACTION_LLM_API_KEY` |
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

## 9. Operational Profile (DigitalOcean)

### Current infrastructure

- App Platform service: `schedscan-5gljy`
- ~~Ollama droplet: `ollama-schedscan` (`s-2vcpu-8gb`)~~ **DELETED** (Session 13, saved $48/month)
- Cloud vision: Gemini REST API (free tier, no credit card)

### Monthly cost breakdown

| Resource | Before Session 13 | After Session 13 |
|---|---|---|
| App Platform (backend) | ~$5 | ~$5 |
| Managed DB | ~$7 | ~$7 |
| DO Spaces | ~$5 | ~$5 |
| Ollama Droplet | $48 | **$0** |
| Gemini API | N/A | **$0** |
| **Total** | **~$65** | **~$17** |

## 10. API Contract

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

## 11. Validation and Scoring

Post-parse validation always runs:
- required fields
- day/time normalization and constraints
- duplicate collapse
- ownership checks for student uploads

Scoring gates acceptance. In strict mode there is no regex rescue path if vision fails.

## 12. Testing and Verification

### Session 13 verification

All existing tests passed with zero modifications after cloud migration:

```bash
cd backend
python manage.py test api.tests.test_llm_normalizer --keepdb    # 31 passed
python manage.py test api.tests.test_extraction api.tests.test_extraction_health --keepdb  # 101 passed
```

### Session 12 test coverage

- retry timeout profile can be lower than base timeout
- adaptive heavy-tier budget behavior
- chunked request merge + dedupe behavior
- metadata gate connect/read timeout tuple

## 13. Changed Files (Session 13)

Backend code:
- `backend/api/utils/extraction/cloud_llm_client.py` [NEW]
- `backend/api/utils/extraction/llm_normalizer.py`
- `backend/core/settings.py`

Documentation:
- `implementation.md`
- `update.md`

## 14. Planned: Offline OCR Extraction (On-Device)

### Motivation

Students and faculty need to extract schedules even without internet connectivity. The existing server-side regex/OCR code (`ocr.py`) already handles WMSU COR and Faculty IDP formats. Porting this logic to the mobile app enables fully offline extraction.

### Architecture

```text
ONLINE PATH (current):
  Upload → Backend → Gemini Cloud Vision → Courses

OFFLINE PATH (planned):
  Camera/Gallery → On-device ML Kit OCR → TypeScript regex parser → Provisional courses
  (queued for server verification when back online)
```

### Implementation approach

1. **On-device OCR engine:** Use Google ML Kit Text Recognition (runs locally, no network)
2. **TypeScript regex parser:** Port `StudentCORExtractor._parse_line()` and `FacultyCORExtractor._parse_idp_line()` patterns to TypeScript
3. **Provisional result UX:** Show extracted courses with "Unverified" badge, store in AsyncStorage
4. **Background sync:** When connectivity returns, upload file to backend for server-side Gemini extraction
5. **Reconciliation:** Compare offline vs online results, surface discrepancies to user

### Key design considerations

- Offline extraction is intentionally **lower quality** than server-side Gemini — this is acceptable because:
  - It's a usability bridge, not a replacement
  - Server verification happens automatically when back online
  - Users see clear visual indicators that results are provisional
- The regex patterns in `ocr.py` are already battle-tested against WMSU document formats
- No additional backend changes needed — the existing upload endpoint handles the sync

## 15. Known Remaining Work

1. **Groq failover:** Obtain free API key and set `EXTRACTION_GROQ_API_KEY` in DO (zero code changes needed).
2. **Offline OCR:** Implement on-device extraction with TypeScript regex parser and ML Kit OCR.
3. **Gemini prompt tuning:** Optimize prompts for Gemini (current prompts were tuned for granite3.2-vision:2b).
4. **Scoring recalibration:** Analyze first 50-100 Gemini extractions and adjust confidence thresholds.
5. **Provider telemetry:** Add `llm_provider` to ExtractionLog and surface in admin dashboard.
6. **Ollama code cleanup:** After 30 days of stable Gemini operation, consider removing Ollama code paths and dead env vars.
