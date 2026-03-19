# SchedScan Hybrid Extraction Pipeline Update

Date: 2026-03-19

## Current State

### Phase 1 (Quality Gates + Telemetry) - Implemented
- Deterministic validation added for required fields, day/time rules, duration cap, and duplicate collapse.
- Composite confidence scoring added with configurable thresholds.
- Upload flow now hard-gates persistence on validation and confidence outcomes.
- Structured extraction failure metadata now returned in API responses.
- Extraction telemetry extended with failure category, validator errors, score breakdown, review flags, and LLM telemetry fields.

### Reliability Enhancements - Implemented
- Idempotency request tracking model added.
- Upload endpoints now support idempotency key replay semantics.
- Dedupe + course writes protected by transaction with lock-safe race handling.
- Retry requests with same key return the finalized response and avoid duplicate inserts.

### Phase 2 (Staged Orchestration) - Structure Implemented
- New extraction package scaffolding added:
  - profiler
  - orchestrator
  - fallbacks
  - normalizer
- Extraction manager now runs through staged orchestration and deterministic normalize -> validate -> score path.

### Contract and Regression Coverage - Added
- Tests for validators and scoring behavior.
- Contract tests for enhanced extraction metadata while preserving legacy response keys.
- Idempotency replay tests to verify no duplicate writes and replay behavior.
- Extraction-focused suite validated via local SQLite test settings.

## Files Added/Updated (High-Level)

### New
- backend/api/utils/extraction/__init__.py
- backend/api/utils/extraction/types.py
- backend/api/utils/extraction/validators.py
- backend/api/utils/extraction/scoring.py
- backend/api/utils/extraction/profiler.py
- backend/api/utils/extraction/fallbacks.py
- backend/api/utils/extraction/normalizer.py
- backend/api/utils/extraction/orchestrator.py
- backend/api/utils/extraction/llm_normalizer.py
- backend/api/migrations/0030_extractionlog_phase1_fields.py
- backend/api/migrations/0031_extractionrequest.py
- backend/api/tests/test_extraction_validators.py
- backend/api/tests/test_extraction_scoring.py
- backend/core/test_settings.py
- update.md

### Updated
- backend/api/models.py
- backend/api/views/upload_views.py
- backend/api/views/admin_views.py
- backend/api/utils/extraction_manager.py
- backend/api/utils/pdf_extractor.py
- backend/api/utils/ocr.py
- backend/api/tests/test_extraction.py
- backend/api/tests/test_extraction_health.py
- backend/core/settings.py

## LLM Normalization Status
- Safe Phase 3 hook is in place and feature-flagged.
- Current behavior is fail-closed by default.
- Medium-confidence band integration is wired; actual Ollama inference call is still pending final implementation and rollout config.

## Next Steps

### 1) Complete Ollama Runtime Integration (Phase 3)
- Implement actual Ollama HTTP inference in llm_normalizer.
- Enforce strict JSON schema and key whitelist.
- Keep fail-closed behavior when response is malformed or timeout occurs.
- Add bounded input size and timeout controls.

### 2) Production Rollout Plan (DigitalOcean)
- Keep EXTRACTION_LLM_NORMALIZATION_ENABLED off in production initially.
- Deploy Ollama as a separate internal service (not in the web app process).
- Restrict network access to backend-only path.
- Enable feature flag gradually (faculty first), monitor telemetry, then expand.

### 3) Testing and Hardening
- Add unit tests for LLM timeout, malformed output, unknown keys, and successful normalization path.
- Add concurrency tests for idempotency key race conditions under parallel requests.
- Validate staging rollback procedure for latest migrations.

### 4) Observability
- Add dashboards for:
  - idempotency hit rate
  - llm_used / llm_parse_success
  - top validator failures
  - confidence distribution by upload type and method

## Operational Notes
- If PostgreSQL is unavailable locally, use:
  - python manage.py test ... --settings=core.test_settings
- For production validation, run against PostgreSQL-backed staging before enabling LLM normalization.
