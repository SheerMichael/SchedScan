# SchedScan Hybrid Extraction Pipeline Update

Date: 2026-03-20

## Executive Summary

The hybrid extraction pipeline has progressed from structural scaffolding to a working deterministic + optional LLM-assisted flow with fail-closed behavior. Core extraction safety requirements are in place: no persistence on invalid rows, deterministic validation gates, confidence-based decisioning, telemetry enrichment, and idempotent request replay. Local Ollama integration is implemented and reachable, model pinning controls are wired, and startup/runtime safeguards are configurable.

Current blocker for faculty OCR-heavy samples is quality and latency calibration rather than pipeline correctness. With default local timeout (12s), LLM normalization times out. With extended timeout (30-45s), LLM parsing succeeds and validator errors drop to zero on medium-confidence faculty samples, but aggregate confidence remains below accept threshold in tested cases.

## Implementation Status by Phase

### Phase 1: Quality Gates and Telemetry

Status: Implemented

- Deterministic validation implemented for required fields, day/time rules, duration cap, and duplicate collapse.
- Composite confidence scoring implemented with configurable thresholds.
- Persistence is hard-gated by validator/scoring outcomes.
- Extraction responses include structured failure metadata for client guidance.
- Extraction telemetry includes failure category, validator errors, score breakdown, and LLM fields.

### Reliability Enhancements

Status: Implemented

- Idempotency tracking model and replay semantics are in place.
- Upload writes are transaction-protected to avoid duplicate inserts under retries.
- Request replay returns finalized payload/status for same `(user, idempotency_key)`.

### Phase 2: Staged Orchestration

Status: Implemented

- Staged orchestrator is active (profile -> extraction path -> normalize -> validate -> score).
- Fallback decisions are deterministic.
- Template family and attempt chain are persisted in metadata.

### Phase 3: LLM Normalization (Ollama)

Status: Implemented behind feature flags, rollout pending tuning

- Ollama HTTP inference call implemented in `llm_normalizer`.
- Strict schema enforcement implemented:
  - top-level key whitelist (`courses` only)
  - course field whitelist
  - metadata key whitelist
- Fail-closed behavior implemented for timeout, malformed JSON, unknown keys, HTTP errors.
- Input bounding and timeout controls are configurable.
- Model pinning policy implemented (reject non-pinned `latest` style usage when enabled).
- Optional model digest verification against Ollama tags endpoint implemented.
- Optional startup health checks implemented (warning mode and strict fail-fast mode).

## What Was Verified Recently

### Test Coverage

- Extraction + LLM test suite runs are passing locally using SQLite test settings.
- Added LLM normalization tests for:
  - timeout fail-closed
  - malformed JSON fail-closed
  - unknown key fail-closed
  - success path
  - pinning/digest policy failures

### Faculty Sample Benchmark (`backend/img/fac1.jpeg` to `fac4.jpeg`)

Baseline (LLM disabled):

- `fac1.jpeg`: confidence 0.511, low confidence, 0 valid courses.
- `fac2.jpeg`: parse error due to invalid OCR time token, 6 valid courses retained.
- `fac3.jpeg`: parse errors (missing day and invalid ranges), 6 valid courses retained.
- `fac4.jpeg`: parse errors (missing day), 2 valid courses retained.

LLM enabled at default timeout (12s):

- LLM normalization invoked for medium-confidence samples but timed out.
- No parse recovery achieved at this timeout budget.

LLM enabled at extended timeout (30-45s) for calibration:

- LLM parse succeeded for `fac2` to `fac4`.
- Validator errors reduced to zero for those samples.
- Final confidence remained below accept threshold (still low confidence).

Interpretation:

- Pipeline behavior is correct and conservative.
- Remaining work is calibration and OCR quality uplift, not correctness hotfixes.

## Recent Technical Improvements Since Last Update

- Faculty OCR day extraction hardened for noisy OCR text.
- Faculty OCR raw text is now captured and passed forward so LLM stage can operate on non-empty input.
- LLM integration now fully functional in process with strict safety guards and policy controls.

## Configuration Surface (Current)

Available settings include:

- `EXTRACTION_LLM_NORMALIZATION_ENABLED`
- `EXTRACTION_LLM_MODEL_NAME`
- `EXTRACTION_LLM_MODEL_DIGEST`
- `EXTRACTION_LLM_BASE_URL`
- `EXTRACTION_LLM_TIMEOUT_SECONDS`
- `EXTRACTION_LLM_MAX_INPUT_CHARS`
- `EXTRACTION_LLM_REQUIRE_PINNED_MODEL`
- `EXTRACTION_LLM_REQUIRE_MODEL_DIGEST`
- `EXTRACTION_LLM_STARTUP_CHECK_ENABLED`
- `EXTRACTION_LLM_STARTUP_CHECK_STRICT`
- `EXTRACTION_LLM_STARTUP_CHECK_TIMEOUT_SECONDS`

## Recommended DigitalOcean Deployment Pattern

### Topology and Security

1. Deploy Ollama as a separate internal service (not in Django web process).
2. Restrict Ollama endpoint to private network path accessible only by backend service.
3. Do not expose Ollama publicly.
4. Keep backend as policy enforcement point; never trust model output without schema validation.

### Environment Strategy

Staging first:

- Keep `EXTRACTION_LLM_NORMALIZATION_ENABLED=False` on first deploy of new code.
- Set model + digest + startup checks in non-strict mode.
- Verify startup check logs and runtime connectivity.

Then controlled enablement:

- Enable LLM normalization for faculty uploads only (operational policy/gating).
- Use a higher timeout budget in staging for OCR-heavy faculty docs (for example 30s) and measure p95 latency.
- If stable, roll to production with conservative timeout and explicit rollback switch.

Production hardening target:

- `EXTRACTION_LLM_REQUIRE_PINNED_MODEL=True`
- `EXTRACTION_LLM_REQUIRE_MODEL_DIGEST=True`
- `EXTRACTION_LLM_STARTUP_CHECK_ENABLED=True`
- `EXTRACTION_LLM_STARTUP_CHECK_STRICT=True` after a successful burn-in period

## Operational Runbook (Rollout and Rollback)

### Rollout

1. Deploy backend changes with LLM disabled.
2. Validate baseline upload behavior unchanged.
3. Verify Ollama service health and model digest consistency.
4. Enable LLM normalization in staging.
5. Monitor telemetry for:
   - `llm_used`
   - `llm_parse_success`
   - timeout rate
   - top validator errors
   - acceptance/reject split by upload type
6. Enable production gradually (faculty first).

### Rollback

Immediate rollback switch:

- Set `EXTRACTION_LLM_NORMALIZATION_ENABLED=False`

Secondary rollback levers:

- Increase strictness by lowering timeout risk to deterministic-only path.
- Temporarily disable startup strict mode if deployment sequencing causes transient service ordering issues.

## Outstanding Work and Next Steps

### Priority 1: Calibration and Throughput

1. Tune timeout budget for OCR-heavy documents (benchmark p50/p95 per upload type).
2. Recalibrate confidence scoring weights for faculty OCR + LLM corrected candidates.
3. Add upload-type specific threshold policy if justified by telemetry (avoid global threshold drift).

### Priority 2: Deterministic OCR Cleanup

1. Add safe faculty time normalization for OCR artifacts that are unambiguous.
2. Expand day-token normalization map for observed OCR variants.
3. Keep strict fail rules for ambiguous time/day values (no guessing policy).

### Priority 3: Testing and Reliability

1. Add API-level benchmark script for corpus runs (`fac1-fac4` plus new fixtures).
2. Add idempotency concurrency tests under parallel request conditions.
3. Add startup policy tests for digest verification behavior and strict mode.

### Priority 4: Observability and Ops

1. Build dashboards for acceptance/rejection by upload type and method.
2. Alert on:
   - high timeout rates
   - high parse_error rates
   - startup check failures
3. Track score/rule/schema versions in dashboards for change attribution.

## Risk Register (Current)

1. LLM latency variance on local CPU can cause timeout-driven non-determinism in medium-confidence rescue path.
2. OCR quality variance for faculty image captures remains the dominant source of parse/low-confidence outcomes.
3. Confidence policy may be too strict for corrected faculty OCR rows; requires data-backed recalibration.

## Final Note

The system is in a safe and production-conscious state: deterministic gates and fail-closed behavior are working as intended. Remaining effort is now operational excellence and calibration, not foundational architecture changes.
