# Hybrid Schedule Extraction Pipeline Implementation Guide

## 1. Purpose and Non-Goals

### Purpose
Implement a robust, dynamic, and low-cost extraction pipeline that can process mixed schedule formats (digital PDFs, scanned PDFs, images) while keeping data quality high and avoiding silent bad saves.

### Non-Goals (for this project phase)
- Training a custom OCR or document model from scratch.
- Building a fully automated reviewer UI before extraction quality gates are in place.
- Handling handwritten schedules as a primary use case.

## 2. Constraints and Design Decisions

### Project Constraints
- Upload volume: ~100 uploads/month.
- No paid OCR/LLM APIs.
- Privacy requirements are moderate (still treat uploaded docs as sensitive data).
- Accuracy, speed, and cost are all important.
- Re-upload flow is acceptable for low-confidence cases.

### Key Design Decisions
- Keep extraction mostly deterministic.
- Use LLM only as a controlled normalization/correction layer.
- Never persist extraction output without deterministic validation.
- Reject uncertain outputs instead of silently creating incorrect courses.

## 3. High-Level Architecture

Pipeline stages:

1. Ingestion and preflight checks
2. Document profiling (file type, scan quality, template hint)
3. Candidate extraction (primary parser and fallback parsers)
4. Optional LLM normalization (schema-constrained)
5. Deterministic validation and scoring
6. Persistence and telemetry
7. Retry/reject response with actionable reason

Decision flow:

- High confidence and valid -> save courses.
- Medium confidence -> run fallback/LLM normalization -> revalidate.
- Low confidence or invalid -> reject with retry guidance.

## 4. Repository Change Map

Current modules to extend:

- `backend/api/utils/extraction_manager.py`
- `backend/api/utils/pdf_extractor.py`
- `backend/api/utils/ocr.py`
- `backend/api/views/upload_views.py`
- `backend/api/models.py`
- `backend/api/tests/test_extraction.py`
- `backend/api/tests/test_extraction_health.py`

New modules to add:

- `backend/api/utils/extraction/` (new package)
- `backend/api/utils/extraction/types.py`
- `backend/api/utils/extraction/profiler.py`
- `backend/api/utils/extraction/validators.py`
- `backend/api/utils/extraction/scoring.py`
- `backend/api/utils/extraction/normalizer.py`
- `backend/api/utils/extraction/fallbacks.py`
- `backend/api/utils/extraction/llm_normalizer.py` (optional local LLM path)
- `backend/api/tests/test_extraction_validators.py`
- `backend/api/tests/test_extraction_scoring.py`

## 5. Data Contracts

## 5.1 Candidate Course Contract

All extractors should emit this normalized shape before persistence:

```json
{
  "subject_code": "CC 102",
  "subject_name": "COMPUTER PROGRAMMING 2",
  "day": "T",
  "start_time": "02:30PM",
  "end_time": "04:00PM",
  "location": "LR3",
  "metadata": {
    "parser": "student_pdf_table",
    "field_confidence": {
      "subject_code": 0.93,
      "day": 0.88,
      "start_time": 0.95,
      "end_time": 0.95,
      "location": 0.74
    },
    "evidence": {
      "line_index": 37,
      "source_text": "..."
    }
  }
}
```

## 5.2 Extraction Result Contract

```json
{
  "courses": [],
  "extraction_method": "pdf_text|ocr|ocr_fallback|hybrid",
  "confidence": 0.0,
  "attempts": ["pdf_text", "ocr_fallback"],
  "processing_time": 0.0,
  "semester": "1ST",
  "school_year": "2025-2026",
  "student_number": "2022-01191",
  "failure_category": "none|no_text|parse_error|low_confidence|metadata_mismatch|system_error",
  "validator_errors": []
}
```

## 5.3 Extraction Run and Idempotency Contract

Every upload request must carry a stable idempotency key to prevent duplicate writes.

Minimum fields:

```json
{
  "request_id": "uuid-v4-from-client-or-server",
  "idempotency_key": "sha256(user_id + file_hash + upload_type + created_minute)",
  "extraction_run_id": "uuid-v4",
  "schema_version": "v1"
}
```

Persistence rules:
- Store one extraction result per `(user_id, idempotency_key)`.
- If the same key is retried, return the existing result instead of re-inserting courses.
- Use one transaction for dedupe + course writes.

## 6. Deterministic Validation Rules (Hard Gate)

Define these in `validators.py` and enforce before DB writes.

Required fields per course:
- `subject_code`
- `day`
- `start_time`
- `end_time`

Validation checks:

1. Day validity
- Allowed days: `M,T,W,TH,F,S` only.
- Multi-day values must be expanded before validation.

2. Time validity
- Parse time with strict parser (`%I:%M%p`-equivalent).
- `start_time < end_time` required.
- Reject duration > 8 hours unless explicit override.

3. Duplicate handling
- Duplicate key: `(subject_code, day, start_time, end_time, location)`.
- Keep highest-confidence duplicate.

4. Basic text sanity
- `subject_code` max length and character whitelist.
- Reject obviously corrupted fields (e.g., >70% symbols).

5. Ownership checks for student uploads
- If student number mismatches registered student number: reject with 403 policy.
- If student number is missing from extraction: run one stronger fallback pass, then reject with 422 if still missing.
- Add optional strict mode flag to convert missing metadata to 403 if policy requires it.
- Do not bypass this check based on parser path.

## 7. Confidence Scoring Policy

Implement in `scoring.py`.

Composite score (example):

- Field completeness: 0.25
- Parse validity: 0.25
- Semantic consistency: 0.20
- Parser reliability prior: 0.15
- Cross-parser agreement: 0.15

Thresholds:

- `>= 0.85`: accept and persist
- `0.60 - 0.84`: run fallback stage (including optional LLM normalization), then re-score
- `< 0.60`: reject with retryable response

Important: threshold values must be configurable in settings.

Calibration policy:
- Do not change thresholds directly in production without shadow evaluation.
- Recalibrate monthly using telemetry from accepted/rejected runs.
- Keep a `score_version` and `rule_version` in telemetry so regressions are attributable.

## 8. Fallback Strategy

Order of execution:

1. PDF text/table extraction (if PDF)
2. OCR extraction (image/scanned fallback)
3. Optional LLM normalization (only if medium confidence)
4. Final validation and score

Fallback stop conditions:

- Stop early if score >= accept threshold.
- Stop and reject if parser/validator reports hard-fail (e.g., malformed ownership metadata).

## 9. Optional Local LLM Normalization

Use only for normalization and correction of extracted text, not first-pass OCR.

Input to LLM:
- Truncated extracted text (bounded size)
- Strict JSON schema
- Explicit field constraints
- Request to return `null` when unknown, never guess

Hard requirements:
- JSON schema validation required before use.
- If schema parse fails: discard LLM output.
- Never persist free-form LLM text.
- Include `llm_used` and `llm_parse_success` in telemetry.
- Pin model name and exact version in config (no floating latest tags).
- Verify model digest/checksum at startup and fail closed on mismatch.
- Run inference in isolated runtime with read-only model path and no shell/tool access.
- Deny outbound network for the inference process unless explicitly needed.

Recommended local deployment options:
- Ollama with a small instruction model for low monthly volume.
- CPU-first inference acceptable at this scale.

## 10. Security Practices (Mandatory)

## 10.1 Upload Security

- Enforce file type and MIME checks.
- Enforce max upload size.
- Reject password-protected PDFs for this phase (or handle separately).
- Use temporary file storage with guaranteed cleanup.
- Disable any direct user path access.

## 10.2 Parsing Safety

- Timeouts on OCR and PDF extraction operations.
- Guard against decompression/image bomb attacks by bounding resolution and page count.
- Limit pages processed (e.g., first N pages configurable).

## 10.3 LLM Safety

- Treat OCR text as untrusted input.
- Prevent prompt injection effects:
  - Never include system behavior in OCR text context.
  - Use a fixed system instruction template.
  - Parse output as data only.
- Deny tool execution from model outputs.
- Strip or redact PII from telemetry where not required.
- Enforce max token/input size and hard timeout per inference call.
- Reject responses with unexpected keys or oversized fields.

## 10.4 Data Security

- Do not store full raw document text in logs.
- Store only redacted and truncated previews.
- Add retention policy for extraction artifacts.
- Avoid logging student_number in plain logs unless necessary.

Redaction standard:
- Student number: keep format but mask middle digits (e.g., `2022-0***1`).
- Email: mask local-part except first/last char.
- File names: remove direct personal identifiers where possible.
- Persist redacted preview max 2000 chars.
- Add unit tests that assert redaction for each sensitive field.

## 11. Database and Model Changes

Extend `ExtractionLog` in `models.py`:

Add fields:
- `failure_category` (CharField, indexed)
- `validator_errors` (JSONField)
- `template_family` (CharField, indexed)
- `review_required` (BooleanField, indexed)
- `llm_used` (BooleanField)
- `llm_parse_success` (BooleanField)
- `score_breakdown` (JSONField)

Keep `raw_text_preview` but ensure:
- max length enforced
- redaction applied before save

Migration guidance:
- Add migration with defaults and indexes.
- Backfill existing rows with neutral defaults.
- Use nullable-first migrations for new non-critical fields.
- Deploy in two steps: schema migration then code path activation via feature flag.
- Define rollback steps and verify rollback on staging before production rollout.

## 12. API Behavior Changes

Endpoint remains:
- `POST /api/upload-cor/student/`
- `POST /api/upload-cor/faculty/`

Enhanced response payload:

```json
{
  "message": "...",
  "courses": [],
  "total_courses": 0,
  "extraction_metadata": {
    "method": "hybrid",
    "confidence": 0.78,
    "attempts": ["pdf_text", "ocr_fallback", "llm_normalize"],
    "failure_category": "low_confidence",
    "validator_errors": ["Invalid day token: TUES"],
    "score_breakdown": {
      "completeness": 0.80,
      "validity": 0.65,
      "consistency": 0.70,
      "agreement": 0.55
    }
  }
}
```

Compatibility policy:
- Keep existing response keys unchanged for current clients.
- Additive keys only unless versioned endpoint is introduced.
- If breaking changes are needed, expose `/api/v2/upload-cor/...` and maintain `/api/upload-cor/...` during transition.
- Add contract tests for both legacy and enhanced response shapes.

Error policy:
- 422 for extraction failures that are retryable.
- 403 for ownership mismatch.
- 500 only for system/internal failures.

## 12.1 Synchronous vs Asynchronous Processing

Given low traffic, keep synchronous path for fast extracts and add async fallback for heavy jobs.

Sync mode:
- Use for digital PDFs and quick OCR passes within timeout budget.

Async mode (recommended for medium/low confidence retries):
- Return `202 Accepted` with `job_id` when processing exceeds sync threshold.
- Add status endpoint: `GET /api/extraction-jobs/{job_id}/`.
- Enforce max wall-clock time and retry budget per job.
- Surface final result in same schema as sync endpoint.

## 13. Implementation Phases

## Phase 1: Quality Gate and Telemetry Hardening (high priority)

Deliverables:
- Add validator module and enforce it before save.
- Add confidence scoring module.
- Add failure categories and validator errors to logs.
- Populate `raw_text_preview` with redacted text.
- Ensure student number verification works for all paths.

Acceptance:
- No invalid day/time rows persisted.
- ExtractionLog includes structured failure reason.

## Phase 2: Pluggable Extractors and Fallback Manager

Deliverables:
- Refactor `ExtractionManager` into staged orchestration.
- Add extractor interface and explicit attempt records.
- Add template profiling hints.

Acceptance:
- Retry path deterministic and test-covered.

## Phase 3: Optional Local LLM Normalization

Deliverables:
- Add `llm_normalizer.py` behind feature flag.
- Enforce schema validation on LLM output.
- Add telemetry fields for LLM usage and parse success.

Acceptance:
- LLM failure never causes bad persistence.

## Phase 4: Operational Hardening

Deliverables:
- Add extraction analytics for failure category and threshold tuning.
- Add retention cleanup job for stale artifacts.
- Add benchmark script updates for new metrics.

Acceptance:
- Team can tune thresholds using observed metrics.

## 14. Testing Strategy

## 14.1 Unit Tests

Add tests for:
- time/day validators
- duplicate collapse
- score calculation and thresholds
- failure category mapping
- redaction logic

## 14.2 Integration Tests

Update and extend:
- `test_extraction.py`
- `test_extraction_health.py`

Scenarios:
- valid PDF -> accepted
- low-quality PDF -> fallback -> accepted
- low confidence after fallback -> rejected 422
- student mismatch -> 403
- LLM malformed JSON -> ignored, no crash

## 14.3 Regression Fixtures

Create anonymized fixture set:
- clean digital student COR
- scanned/noisy student COR
- faculty IDP variants
- malformed/edge examples

## 15. Observability and Metrics

Track per upload:
- extraction method
- attempts
- global confidence
- score breakdown
- validator error counts
- failure category
- processing time
- idempotency hit rate
- async queue latency (if async path enabled)
- score/rule version used per extraction

Dashboard metrics:
- acceptance rate
- fallback rate
- reject rate
- average confidence by upload_type
- top validator failures

## 16. Performance Guidance

Given low volume, prioritize correctness over micro-optimizations.

Still enforce:
- bounded OCR page count
- bounded image dimensions
- bounded text length passed to LLM
- per-stage timeout settings

Suggested defaults for this project:
- OCR stage timeout: 25s
- LLM normalization timeout: 12s
- Sync request budget: 30s, then enqueue async fallback

## 17. Feature Flags and Rollout

Add settings flags:
- `EXTRACTION_V2_ENABLED`
- `EXTRACTION_LLM_NORMALIZATION_ENABLED`
- `EXTRACTION_ACCEPT_THRESHOLD`
- `EXTRACTION_RETRY_THRESHOLD`
- `EXTRACTION_STRICT_OWNERSHIP_MODE`
- `EXTRACTION_ASYNC_FALLBACK_ENABLED`
- `EXTRACTION_SCHEMA_VERSION`
- `EXTRACTION_SCORE_VERSION`

Rollout plan:
1. Deploy v2 with LLM off.
2. Validate telemetry and rejection behavior.
3. Enable LLM for faculty uploads first.
4. Expand to student uploads if stable.

## 18. Failure Mode and Effects Summary

Expected failure modes and handling:

- OCR unreadable: return 422 retryable, include clear reason.
- Parser disagreement: run LLM normalization, then revalidate.
- LLM malformed output: discard and continue fallback path.
- Ownership mismatch: 403 for student uploads.
- Ownership missing after retries: 422 with explicit code and re-upload guidance.
- Unexpected exception: 500 with safe message, log internal details.

## 19. Coding Standards and Practices

- Keep extractor functions pure and side-effect free where possible.
- Separate concerns: extraction, normalization, validation, persistence.
- Keep all thresholds/config in settings, not hardcoded.
- Avoid broad `except Exception` unless re-raising with context.
- Use structured logging with event names and metadata.

## 20. Example Pseudocode for Orchestrator

```python
def extract_schedule(file_path: str, upload_type: str) -> dict:
    profile = profile_document(file_path)
    attempts = []

    candidates = run_primary_extractors(file_path, upload_type, profile, attempts)
    validated, errors = validate_candidates(candidates, upload_type)
    score = score_candidates(validated, errors, attempts)

    if score >= ACCEPT_THRESHOLD and not errors:
        return build_success(validated, score, attempts)

    if RETRY_THRESHOLD <= score < ACCEPT_THRESHOLD:
        fallback_candidates = run_fallback_extractors(file_path, upload_type, profile, attempts)
        merged = merge_candidates(validated, fallback_candidates)
        validated2, errors2 = validate_candidates(merged, upload_type)
        score2 = score_candidates(validated2, errors2, attempts)
        if score2 >= ACCEPT_THRESHOLD and not errors2:
            return build_success(validated2, score2, attempts)

    return build_retryable_failure(score, attempts, errors)
```

## 21. Security Checklist (Release Gate)

- [ ] Upload size limits enforced.
- [ ] MIME and extension checks enforced.
- [ ] Temp files always cleaned in `finally`.
- [ ] OCR/PDF stage timeouts configured.
- [ ] `raw_text_preview` redacted and truncated.
- [ ] No raw full OCR text in logs.
- [ ] Student ownership check enforced for all student uploads.
- [ ] LLM output schema validation mandatory.
- [ ] Feature flags default safe values.
- [ ] Model version pinned and digest-verified.
- [ ] Idempotency key enforced and duplicate write test passing.
- [ ] Staging rollback drill completed for latest migrations.

## 22. Definition of Done

Implementation is complete when:
- All validators and scoring gates are active in upload flow.
- Invalid extractions no longer create course records.
- Extraction logs contain failure categories and score breakdown.
- Core and edge-case tests pass.
- Team can inspect extraction quality through admin analytics.

## 23. Recommended Immediate Next Steps

1. Implement Phase 1 first (validator + scoring + telemetry) before adding LLM.
2. Add fixtures from current failed uploads for regression coverage.
3. Enable LLM normalization only behind feature flag and only for medium-confidence cases.

This sequence gives the highest quality improvement with the lowest risk for your current project scale.
