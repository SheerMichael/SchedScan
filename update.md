# SchedScan Extraction Pipeline - Master Update Log

**Last updated:** 2026-04-10 (Session 12)

---

## Executive Summary

The pipeline is now running as:
- vision-first LLM primary
- strict vision-only production policy
- async upload lifecycle (`202` + poll + push)

Session 12 delivered the user-selected Option 1 mitigation:
- adaptive budget profiling for heavy files
- chunked image/page slicing with overlap and merge dedupe
- metadata-gate budget optimization
- worker-slot self-repair guard for bounded thread execution path

Code changes are complete, tests passed, and production environment knobs were updated to enable chunking controls.

---

## Current Production Posture

### Enforced runtime mode

- `EXTRACTION_VISION_ONLY_MODE=True`
- `EXTRACTION_LLM_DIRECT_FILE_PARSE_ENABLED=True`
- `EXTRACTION_LLM_DIRECT_FILE_FALLBACK_ON_REJECT=False`

This means extraction remains strict vision-only in production during this stabilization window.

### Infrastructure baseline

- App Platform app: `schedscan-5gfy`
- Ollama droplet: `ollama-schedscan` on `s-2vcpu-8gb`
- Vision endpoint: `http://209.97.172.45:8080` (nginx key-gated)
- Runtime controls: `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_MAX_LOADED_MODELS=1`, `OLLAMA_KEEP_ALIVE=30m`, swap enabled

### Session 12 chunking controls applied to production

Confirmed persisted values:
- `EXTRACTION_LLM_VISION_CHUNKING_ENABLED=True`
- `EXTRACTION_LLM_VISION_CHUNKING_FORCE_ENABLED=False`
- `EXTRACTION_LLM_VISION_CHUNK_COUNT=3`
- `EXTRACTION_LLM_VISION_CHUNK_OVERLAP_RATIO=0.12`
- `EXTRACTION_LLM_VISION_CHUNKING_MIN_HEIGHT_PX=900`
- `EXTRACTION_LLM_VISION_CHUNKING_MAX_CHUNKS=4`

Adaptive and retry/time budget values from Session 11 profile were retained, then layered with the Session 12 chunking controls.

---

## Session 12 - Adaptive + Chunking Rollout (Option 1) ✅ IMPLEMENTED

### Goal

Reduce strict vision-only timeout risk on dense/tall documents without enabling OCR/regex fallback.

### Backend changes

#### `backend/api/utils/extraction/llm_normalizer.py`

- Added adaptive complexity estimation using file size + megapixels.
- Added adaptive attempt profile builder for first-pass budget reduction on heavy files.
- Added optional grayscale preprocessing on heavy first-pass.
- Refactored image preprocess/encode helpers for shared, tunable behavior.
- Implemented chunked request mode:
  - horizontal slicing with overlap
  - per-chunk request dispatch
  - aggregated metadata merge
  - course deduplication across chunks
  - per-attempt chunk telemetry
- Added shared `_parse_vision_response_payload()` parser helper.
- Updated retry timeout semantics: retry read timeout can be lower than base timeout when configured that way.
- Added metadata-gate connect/read timeout tuple and separate preprocess budgets.

#### `backend/core/settings.py`

Added new env toggles/knobs for:
- adaptive budgeting
- chunking controls
- metadata gate image/pdf budgets

#### `backend/api/views/upload_views.py`

- Added `_repair_extraction_thread_slots_if_needed()` to reconcile leaked thread-slot permits in abnormal/mock thread lifecycles.
- Called reconciliation before bounded slot acquire in `_submit_extraction_job()`.

#### `backend/api/tests/test_llm_normalizer.py`

Added tests for:
- retry timeout profile lower than base timeout
- adaptive heavy-tier behavior
- chunked merge + dedupe behavior
- metadata gate connect/read timeout tuple behavior

### Validation results

Executed after implementation:
- `api.tests.test_llm_normalizer`: 31 passed
- `api.tests.test_extraction` + `api.tests.test_extraction_health`: 101 passed

No failing tests remained after slot-repair and parser adjustments.

---

## Session 11 - Vision-Only Enforcement + Timeout Classification ✅ IMPLEMENTED

Delivered before Session 12 and now part of the active baseline:

- Added strict policy controls:
  - `EXTRACTION_VISION_ONLY_MODE`
  - `EXTRACTION_LLM_DIRECT_FILE_FALLBACK_ON_REJECT`
- Forced confidence to `0.0` when extraction returns no courses.
- Classified timeout outcomes explicitly as `failure_category=timeout`.
- Upsized Ollama droplet from 4GB to 8GB and aligned nginx proxy timeouts for long reads.

Outcome: failure semantics became correct and observable; throughput mitigation then proceeded in Session 12 via chunking/adaptive budgets.

---

## Prior Sessions (Condensed)

- Session 10: retry hardening, async reliability, mobile polling/recovery improvements, llm failure analytics.
- Session 9: async success persistence to Schedule + Course rows and clearer completion UX.
- Session 8: transient vision retry classes + `llm_failure_reason` telemetry.
- Session 7: ownership/validator hardening and runtime memory stabilization steps.
- Sessions 1-6: async extraction architecture, admin job visibility, vision-first cutover foundations.

---

## Current Status Matrix

| Area | Status |
|---|---|
| Vision parser as primary | ✅ Live |
| Strict vision-only policy | ✅ Enabled |
| OCR/regex runtime fallback in production | ❌ Disabled by policy |
| Adaptive budgeting | ✅ Implemented |
| Chunked parsing mode | ✅ Implemented and configured |
| Timeout classification telemetry | ✅ Implemented |
| Async persistence + notifications | ✅ Implemented |
| Thread-slot reconciliation guard | ✅ Implemented |
| Session 12 backend tests | ✅ Passed |

---

## Files Updated in This Delivery

- `backend/api/utils/extraction/llm_normalizer.py`
- `backend/core/settings.py`
- `backend/api/views/upload_views.py`
- `backend/api/tests/test_llm_normalizer.py`
- `implementation.md`
- `update.md`

---

## Next Actions

1. Run targeted production smoke uploads (including prior timeout sample set) and compare timeout rate pre/post chunking.
2. Monitor `llm_failure_reason` distribution and p95 duration for 24-48h under normal traffic.
3. If strict vision-only timeout rate remains unacceptable, proceed to Option 2 policy (temporary fallback re-enable or queue-worker architecture move).
