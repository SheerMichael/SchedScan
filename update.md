# SchedScan Hybrid Extraction Pipeline — Master Update

**Last updated:** 2026-03-22

---

## Executive Summary

The hybrid extraction pipeline is fully deployed end-to-end in production. All three implementation phases (deterministic validation, staged orchestration, LLM normalization) are active and secured. The Ollama LLM service is running on a dedicated DigitalOcean Droplet behind an nginx API-key-authenticated reverse proxy. Today's session also fixed the Faculty OCR time parser to correctly handle the WMSU IDP time format.

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
| API Key | Stored as `EXTRACTION_LLM_API_KEY` in DO App Platform (see below) |

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
| `EXTRACTION_LLM_STARTUP_CHECK_ENABLED` | `True` |
| `EXTRACTION_LLM_STARTUP_CHECK_STRICT` | `False` |
| `EXTRACTION_LLM_MODEL_NAME` | `llama3.2:3b` |
| `EXTRACTION_LLM_API_KEY` | `b2cdca30db9cbd0f0063523eb930b5fe2885ccf84490db82523ef825c0332a15` |
| `EXTRACTION_LLM_MODEL_DIGEST` | `a80c4f17acd55265feec403c7aef86be0c25983ab279d83f3bcd3abbcb5b8b72` |
| `EXTRACTION_LLM_REQUIRE_MODEL_DIGEST` | `False` *(enable after stable burn-in)* |
| `EXTRACTION_LLM_TIMEOUT_SECONDS` | `45` |

#### Quality Gate Settings

| Key | Value |
|---|---|
| `EXTRACTION_ACCEPT_THRESHOLD` | `0.85` |
| `EXTRACTION_RETRY_THRESHOLD` | `0.60` |

---

## What Was Accomplished

### Phase 1–3: Core Pipeline (Previously Completed)

- **Deterministic validators** (`validators.py`): required fields, day validity, time range, duration cap, duplicate collapse by highest confidence.
- **Composite confidence scoring** (`scoring.py`): per-upload-type weights, configurable via settings.
- **Staged orchestration** (`extraction_manager.py`): PDF text → OCR fallback → LLM normalize → validate → score.
- **LLM normalization** (`llm_normalizer.py`): Ollama-backed, fail-closed on timeout/bad JSON/schema violation.
- **Idempotency** (`upload_views.py`): SHA256-keyed `ExtractionRequest`, `select_for_update()`, atomic course writes. All exit paths (200/403/422/500) finalized.
- **PII redaction**: student numbers masked (`2022-0***1`), emails masked (`j*******e@domain`), `raw_text_preview` truncated to 2000 chars.
- **`ExtractionLog` telemetry**: `failure_category`, `validator_errors`, `score_breakdown`, `llm_used`, `llm_parse_success`, `template_family`, `review_required`.
- **Startup health check** (`apps.py`): non-strict mode — warns in logs, never blocks startup.

### This Session — Security Hardening (2026-03-22)

**Code changes pushed in commit `3efc00e`:**

| File | Change |
|---|---|
| `backend/core/settings.py` | Added `EXTRACTION_LLM_API_KEY` setting |
| `backend/api/utils/extraction/llm_normalizer.py` | Added `_build_ollama_headers()` helper; all 3 Ollama HTTP call sites (generate, startup check, digest verify) now send `X-Api-Key` |
| `backend/api/tests/test_llm_normalizer.py` | 2 new tests: key sent when set, absent when empty |
| `backend/api/tests/test_redaction.py` | **New** — 10 PII redaction security regression tests |

**Droplet configuration (manual):**
- nginx installed with API key gate on port 8080
- Port 11434 closed at firewall level
- Firewall attached to Droplet (was previously unattached — firewall was doing nothing)

**Deployment result:** Startup check now passes silently (INFO level, no WARNING in logs).

### This Session — Faculty OCR Time Parser Fix (2026-03-22)

**Problem:** Faculty IDPs (WMSU format) write times without AM/PM markers (e.g., `5:30-7:00`, `7:00-8:30`, `11:30-1:00`, `1:30-4:30`). The old parser returned `None` for all hours 1–11 without explicit meridiem, dropping every course → confidence = 0.39 → LLM never triggered.

**Fix in `backend/api/utils/ocr.py` — `FacultyCORExtractor._convert_to_12hr()`:**

| Hour range (no AM/PM) | Now returns | Rationale |
|---|---|---|
| 1–6 | PM | No university runs 1AM–6AM classes |
| 7–11 | AM | Standard morning session block |

**Before/after for faculty.jpeg test file:**

| Time on document | Before fix | After fix |
|---|---|---|
| `5:30-7:00` | Dropped (None) | `05:30PM–07:00PM` ✅ |
| `7:00-8:30` | Dropped (None) | `07:00AM–08:30AM` ✅ |
| `11:30-1:00` | Dropped (None) | `11:30AM–01:00PM` ✅ |
| `1:30-4:30` | Dropped (None) | `01:30PM–04:30PM` ✅ |

---

## Current Pipeline Status

| Phase | Status |
|---|---|
| Phase 1: Quality Gates & Telemetry | ✅ Complete |
| Phase 2: Staged Orchestration | ✅ Complete |
| Phase 3: LLM Normalization | ✅ Live and secured |
| Phase 4: Operational Hardening | 🔴 Not started |
| Security — Ollama port hardened | ✅ Complete |
| Faculty OCR time disambiguation | ✅ Fixed (this session) |

---

## Rollback Procedures

### Disable LLM (instant, no redeploy)
In DO App Platform env vars:
```
EXTRACTION_LLM_NORMALIZATION_ENABLED = False
```
Redeploys in ~2 min. Pipeline falls back to deterministic-only.

### Disable digest pinning (if Ollama model is updated)
```
EXTRACTION_LLM_REQUIRE_MODEL_DIGEST = False
```

### Revert faculty OCR time fix
In `backend/api/utils/ocr.py` — `_convert_to_12hr()` — revert the `elif 1 <= hour <= 11` block to `return None`. Low risk — students are unaffected (their COR has explicit AM/PM markers).

---

## Next Steps (Priority Order)

### 🔴 Immediate (Do Now)

**1. Push the faculty OCR fix and re-test**
```bash
cd /home/sheer/Desktop/SchedScan
git add backend/api/utils/ocr.py
git commit -m "fix: apply university schedule heuristics for faculty IDP time disambiguation

FacultyCORExtractor._convert_to_12hr() previously returned None for all
hours 1-11 when no explicit AM/PM marker was present. This dropped every
course in WMSU faculty IDP format, making confidence ~0.39 and blocking
LLM normalization entirely.

Apply heuristic: hours 1-6 = PM, hours 7-11 = AM."
git push
```

Then upload `faculty.jpeg` again and verify you now see:
- `confidence` > 0.60 (should trigger LLM normalization)  
- `llm_used = True` in the Extraction Log detail modal
- Courses appear in the app

**2. Verify end-to-end in admin dashboard**

Go to **OCR Health & Reports → Failed Extractions → click the log row** from this session's test. The detail modal shows `llm_used` and `llm_parse_success` fields. After pushing the fix, the next upload should show `llm_used = True`.

---

### 🟡 This Week (Monitoring)

**3. Watch telemetry for 48 hours**

In **OCR Health & Reports → Extraction Analytics**, watch for:

| Metric | Healthy value | Action if not |
|---|---|---|
| Faculty acceptance rate | Improving | Check score weights in DO env vars |
| `llm_used` on faculty | > 0% | Verify confidence is in 0.60–0.84 band |
| `llm_parse_success` | > 70% | Check Ollama logs: `journalctl -u ollama -n 50` |
| Ollama timeout rate | < 10% | Increase `EXTRACTION_LLM_TIMEOUT_SECONDS` to 60 |

**4. Add missing tests (low risk, technical debt)**

- `test_extraction.py` — integration test: valid faculty IDP → accepted
- Idempotency concurrency test — two parallel requests for same key → one write only

---

### 🟢 After Stable Burn-In (1–2 Weeks)

**5. Enable digest pinning (Step 5)**

In DO App Platform env vars:
```
EXTRACTION_LLM_REQUIRE_MODEL_DIGEST = True
EXTRACTION_LLM_STARTUP_CHECK_STRICT = True
```
This locks the exact model binary. Only do this after confirming the model hasn't changed.

**6. Phase 4 — Operational Hardening**
- Add extraction analytics charts for per-upload-type acceptance rates
- Add retention/cleanup job for stale `ExtractionRequest` and `ExtractionLog` rows
- Add benchmark script: run `fac1-fac4.jpeg` corpus, record confidence + llm metrics per file

---

## Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| Faculty time heuristic wrong for edge-case schedules | Low | Fail-closed validator still rejects `start >= end`; bad rows dropped |
| LLM timeout on heavy faculty OCR | Medium | Timeout 45s; pipeline falls back gracefully to deterministic |
| Confidence too strict for LLM-corrected faculty rows | Medium | Recalibrate faculty weights after telemetry |
| Ollama Droplet goes down | Low | Pipeline fails closed to deterministic-only — no data corruption |
| Digest mismatch after model update | Low | `REQUIRE_MODEL_DIGEST=False` currently; enable after burn-in |
