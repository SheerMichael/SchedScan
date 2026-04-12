"""
Cloud Vision LLM client for schedule extraction.

Provider-agnostic client that supports Google Gemini (primary) and Groq
(failover) free-tier APIs.  Returns the same tuple format as the Ollama
``parse_document_with_llm_vision`` function so the rest of the pipeline
is unaware of which backend produced the result.

All providers are accessed through their free tiers — no credit card
required.
"""

import base64
import json
import logging
import os
import time
from json import JSONDecodeError
from typing import Any, Dict, List, Tuple

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Provider registry
# ---------------------------------------------------------------------------
_PROVIDER_ORDER_MAP = {
    'gemini': ['gemini'],
    'groq': ['groq'],
    'cloud': ['gemini', 'groq'],
    'auto': ['gemini', 'groq'],
}


# ---------------------------------------------------------------------------
# Shared helpers (lazy-imported from llm_normalizer to avoid circular deps)
# ---------------------------------------------------------------------------

def _get_llm_normalizer_helpers():
    """Lazy import shared helpers from llm_normalizer."""
    from .llm_normalizer import (
        _build_vision_metadata_prompt,
        _build_vision_parse_prompt,
        _coerce_courses,
        _load_document_images_for_vision,
        _normalize_student_number,
        _parse_llm_json,
        _sanitize_doc_metadata,
        _validate_doc_metadata,
        _validate_normalized_courses,
    )
    return {
        'load_images': _load_document_images_for_vision,
        'build_parse_prompt': _build_vision_parse_prompt,
        'build_metadata_prompt': _build_vision_metadata_prompt,
        'parse_json': _parse_llm_json,
        'coerce_courses': _coerce_courses,
        'validate_courses': _validate_normalized_courses,
        'validate_doc_metadata': _validate_doc_metadata,
        'sanitize_doc_metadata': _sanitize_doc_metadata,
        'normalize_student_number': _normalize_student_number,
    }


def _empty_meta() -> Dict[str, Any]:
    return {'student_number': '', 'semester': '', 'school_year': ''}


# ---------------------------------------------------------------------------
# Gemini provider
# ---------------------------------------------------------------------------

def _call_gemini_vision(
    *,
    images_b64: List[str],
    prompt_text: str,
    model_name: str,
    api_key: str,
    timeout_seconds: int,
) -> str:
    """
    Call the Gemini REST API with vision input and return raw response text.

    Uses the REST API directly instead of the SDK to minimize dependencies.
    The generateContent endpoint supports inline image parts and JSON response
    mode natively.
    """
    url = (
        f'https://generativelanguage.googleapis.com/v1beta/models/'
        f'{model_name}:generateContent?key={api_key}'
    )

    # Build content parts: text prompt + image(s)
    parts: List[Dict[str, Any]] = [
        {'text': prompt_text},
    ]
    for img_b64 in images_b64:
        parts.append({
            'inline_data': {
                'mime_type': 'image/jpeg',
                'data': img_b64,
            },
        })

    payload = {
        'contents': [{'parts': parts}],
        'generationConfig': {
            'responseMimeType': 'application/json',
            'temperature': 0,
        },
    }

    response = requests.post(
        url,
        json=payload,
        timeout=timeout_seconds,
        headers={'Content-Type': 'application/json'},
    )
    response.raise_for_status()
    body = response.json()

    # Extract text from Gemini response envelope
    candidates = body.get('candidates', [])
    if not candidates:
        error_info = body.get('error', {})
        if error_info:
            logger.warning(
                'Gemini API error: code=%s message=%s',
                error_info.get('code'),
                error_info.get('message', ''),
            )
        return ''

    content = candidates[0].get('content', {})
    parts_out = content.get('parts', [])
    text_parts = [p.get('text', '') for p in parts_out if 'text' in p]
    return ''.join(text_parts).strip()


# ---------------------------------------------------------------------------
# Groq provider
# ---------------------------------------------------------------------------

def _call_groq_vision(
    *,
    images_b64: List[str],
    prompt_text: str,
    model_name: str,
    api_key: str,
    timeout_seconds: int,
) -> str:
    """
    Call the Groq OpenAI-compatible API with vision input.

    Groq supports vision via the standard chat completions endpoint with
    image_url content parts using data URIs.
    """
    url = 'https://api.groq.com/openai/v1/chat/completions'

    # Build multimodal content
    content_parts: List[Dict[str, Any]] = [
        {'type': 'text', 'text': prompt_text},
    ]
    for img_b64 in images_b64:
        content_parts.append({
            'type': 'image_url',
            'image_url': {
                'url': f'data:image/jpeg;base64,{img_b64}',
            },
        })

    payload = {
        'model': model_name,
        'messages': [
            {
                'role': 'user',
                'content': content_parts,
            },
        ],
        'response_format': {'type': 'json_object'},
        'temperature': 0,
        'max_tokens': 2048,
    }

    response = requests.post(
        url,
        json=payload,
        timeout=timeout_seconds,
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
        },
    )
    response.raise_for_status()
    body = response.json()

    choices = body.get('choices', [])
    if not choices:
        return ''

    message = choices[0].get('message', {})
    return (message.get('content') or '').strip()


# ---------------------------------------------------------------------------
# Provider dispatch table
# ---------------------------------------------------------------------------

_PROVIDER_CALLERS = {
    'gemini': {
        'caller': _call_gemini_vision,
        'api_key_setting': 'EXTRACTION_GEMINI_API_KEY',
        'model_setting': 'EXTRACTION_GEMINI_MODEL',
        'model_default': 'gemini-2.5-flash-lite',
    },
    'groq': {
        'caller': _call_groq_vision,
        'api_key_setting': 'EXTRACTION_GROQ_API_KEY',
        'model_setting': 'EXTRACTION_GROQ_MODEL',
        'model_default': 'meta-llama/llama-4-scout-17b-16e-instruct',
    },
}


def _call_provider(
    provider_name: str,
    *,
    images_b64: List[str],
    prompt_text: str,
    timeout_seconds: int,
) -> str:
    """Call a specific cloud provider and return raw text response."""
    spec = _PROVIDER_CALLERS.get(provider_name)
    if spec is None:
        raise ValueError(f'Unknown cloud provider: {provider_name!r}')

    api_key = str(getattr(settings, spec['api_key_setting'], '')).strip()
    if not api_key:
        raise ValueError(
            f'Cloud provider {provider_name!r} selected but '
            f'{spec["api_key_setting"]} is empty.'
        )

    model_name = str(
        getattr(settings, spec['model_setting'], spec['model_default'])
    ).strip() or spec['model_default']

    return spec['caller'](
        images_b64=images_b64,
        prompt_text=prompt_text,
        model_name=model_name,
        api_key=api_key,
        timeout_seconds=timeout_seconds,
    )


# ---------------------------------------------------------------------------
# Response parsing (shared between providers)
# ---------------------------------------------------------------------------

def _parse_cloud_vision_response(
    raw_text: str,
    helpers: dict,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any], str]:
    """
    Parse a cloud API JSON response into (courses, doc_metadata, failure_reason).

    Reuses the same validation/sanitization pipeline as the Ollama path.
    """
    if not raw_text:
        logger.warning('Cloud vision parse returned empty response')
        return [], _empty_meta(), 'empty_courses'

    try:
        parsed = helpers['parse_json'](raw_text)
    except (JSONDecodeError, ValueError):
        logger.warning('Cloud vision parse output was not valid JSON')
        return [], _empty_meta(), 'invalid_json'

    unknown_top = set(parsed.keys()) - {'courses', 'doc_metadata'}
    if unknown_top:
        logger.debug(
            'Cloud vision response had unknown top-level keys (ignored): %s',
            sorted(unknown_top),
        )

    courses_raw = parsed.get('courses')
    if not isinstance(courses_raw, list):
        logger.warning('Cloud vision parse: "courses" is not a list')
        return [], _empty_meta(), 'schema_reject'

    courses = helpers['coerce_courses'](courses_raw)
    if not courses and courses_raw:
        logger.warning('Cloud vision parse: unusable courses after sanitization')
        return [], _empty_meta(), 'schema_reject'

    if not helpers['validate_courses'](courses):
        logger.warning('Cloud vision parse: course schema validation failed')
        return [], _empty_meta(), 'schema_reject'

    if not courses:
        logger.warning('Cloud vision parse returned zero courses')
        return [], _empty_meta(), 'empty_courses'

    raw_doc_meta = parsed.get('doc_metadata', {})
    if raw_doc_meta and not helpers['validate_doc_metadata'](raw_doc_meta):
        logger.warning('Cloud vision parse: doc_metadata schema validation failed')

    doc_metadata = helpers['sanitize_doc_metadata'](raw_doc_meta)
    return courses, doc_metadata, ''


def _parse_cloud_metadata_response(
    raw_text: str,
    helpers: dict,
) -> Tuple[Dict[str, Any], str]:
    """Parse a cloud API metadata-only response into (doc_metadata, failure_reason)."""
    if not raw_text:
        return _empty_meta(), 'metadata_missing'

    try:
        parsed = helpers['parse_json'](raw_text)
    except (JSONDecodeError, ValueError):
        return _empty_meta(), 'invalid_json'

    raw_doc_meta = parsed.get('doc_metadata', {})

    # Recovery: {\"student_number\": \"2022-01191\"} without doc_metadata wrapper
    if not raw_doc_meta and isinstance(parsed.get('student_number'), str):
        raw_doc_meta = {'student_number': parsed.get('student_number')}

    doc_metadata = helpers['sanitize_doc_metadata'](raw_doc_meta)
    student_number = str(doc_metadata.get('student_number') or '').strip()

    if student_number:
        return doc_metadata, ''
    return _empty_meta(), 'metadata_missing'


# ---------------------------------------------------------------------------
# Public API — drop-in replacements for Ollama vision functions
# ---------------------------------------------------------------------------

def parse_document_with_cloud_vision(
    *,
    file_path: str,
    upload_type: str,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any], Dict[str, Any]]:
    """
    Parse a document using cloud vision APIs (Gemini / Groq).

    Returns the same (courses, doc_metadata, telemetry) tuple as
    ``parse_document_with_llm_vision`` so the rest of the pipeline is
    unaffected.

    Provider failover order is determined by EXTRACTION_LLM_PROVIDER:
      - 'gemini' → Gemini only
      - 'groq'   → Groq only
      - 'cloud'  → Gemini → Groq
      - 'auto'   → Gemini → Groq (then caller falls back to Ollama)
    """
    helpers = _get_llm_normalizer_helpers()

    provider_setting = str(
        getattr(settings, 'EXTRACTION_LLM_PROVIDER', 'ollama')
    ).strip().lower()
    providers = _PROVIDER_ORDER_MAP.get(provider_setting, ['gemini', 'groq'])
    timeout_seconds = max(
        5,
        int(getattr(settings, 'EXTRACTION_CLOUD_TIMEOUT_SECONDS', 30)),
    )

    telemetry: Dict[str, Any] = {
        'llm_used': True,
        'llm_parse_success': False,
        'llm_failure_reason': '',
        'llm_timeout_type': '',
        'llm_model': '',
        'llm_timeout_seconds': timeout_seconds,
        'llm_retry_count': 0,
        'llm_preprocess_seconds': 0.0,
        'llm_request_seconds': 0.0,
        'llm_total_seconds': 0.0,
        'llm_complexity_tier': 'normal',
        'llm_file_size_mb': 0.0,
        'llm_image_megapixels': 0.0,
        'llm_attempt_metrics': [],
        'llm_provider': '',
        'stage': 'cloud_vision_parse',
    }
    parse_started = time.monotonic()

    # --- Preprocess images ---
    preprocess_started = time.monotonic()
    images_b64 = helpers['load_images'](
        file_path,
        max_pages=3,
        image_max_edge=1600,
        image_quality=80,
        pdf_dpi=200,
        grayscale=False,
        enable_chunking=False,
    )
    preprocess_seconds = round(time.monotonic() - preprocess_started, 3)
    telemetry['llm_preprocess_seconds'] = preprocess_seconds

    if not images_b64:
        telemetry['llm_failure_reason'] = 'empty_courses'
        telemetry['llm_total_seconds'] = round(
            time.monotonic() - parse_started, 3
        )
        return [], _empty_meta(), telemetry

    prompt_text = helpers['build_parse_prompt'](upload_type)

    # --- Try each provider in order ---
    last_failure_reason = ''
    for provider_name in providers:
        attempt_started = time.monotonic()
        attempt_metric: Dict[str, Any] = {
            'provider': provider_name,
            'preprocess_seconds': preprocess_seconds,
            'request_seconds': 0.0,
            'outcome': '',
        }

        try:
            spec = _PROVIDER_CALLERS.get(provider_name, {})
            model_name = str(
                getattr(
                    settings,
                    spec.get('model_setting', ''),
                    spec.get('model_default', ''),
                )
            ).strip() or spec.get('model_default', '')
            telemetry['llm_model'] = model_name
            telemetry['llm_provider'] = provider_name

            request_started = time.monotonic()
            raw_text = _call_provider(
                provider_name,
                images_b64=images_b64,
                prompt_text=prompt_text,
                timeout_seconds=timeout_seconds,
            )
            attempt_metric['request_seconds'] = round(
                time.monotonic() - request_started, 3
            )

            courses, doc_metadata, failure_reason = _parse_cloud_vision_response(
                raw_text, helpers
            )

            if failure_reason:
                last_failure_reason = failure_reason
                attempt_metric['outcome'] = failure_reason
                telemetry['llm_attempt_metrics'].append(attempt_metric)
                logger.warning(
                    'Cloud provider %s parse failed: %s — trying next',
                    provider_name, failure_reason,
                )
                continue

            # Success!
            telemetry['llm_parse_success'] = True
            telemetry['llm_failure_reason'] = ''
            telemetry['llm_request_seconds'] = attempt_metric['request_seconds']
            telemetry['llm_total_seconds'] = round(
                time.monotonic() - parse_started, 3
            )
            attempt_metric['outcome'] = 'success'
            telemetry['llm_attempt_metrics'].append(attempt_metric)
            logger.info(
                'Cloud vision parse success: provider=%s model=%s courses=%d time=%.1fs',
                provider_name, model_name, len(courses),
                telemetry['llm_total_seconds'],
            )
            return courses, doc_metadata, telemetry

        except requests.Timeout:
            attempt_metric['request_seconds'] = round(
                time.monotonic() - attempt_started, 3
            )
            attempt_metric['outcome'] = 'timeout'
            telemetry['llm_attempt_metrics'].append(attempt_metric)
            last_failure_reason = 'timeout'
            logger.warning(
                'Cloud provider %s timed out after %ss — trying next',
                provider_name, timeout_seconds,
            )
            continue

        except requests.HTTPError as exc:
            attempt_metric['request_seconds'] = round(
                time.monotonic() - attempt_started, 3
            )
            status_code = getattr(exc.response, 'status_code', 0)
            if status_code == 429:
                attempt_metric['outcome'] = 'rate_limited'
                last_failure_reason = 'rate_limited'
                logger.warning(
                    'Cloud provider %s rate limited (429) — trying next',
                    provider_name,
                )
            else:
                attempt_metric['outcome'] = f'http_{status_code}'
                last_failure_reason = 'schema_reject'
                logger.warning(
                    'Cloud provider %s HTTP error %s — trying next',
                    provider_name, status_code,
                )
            telemetry['llm_attempt_metrics'].append(attempt_metric)
            continue

        except (ValueError, requests.RequestException) as exc:
            attempt_metric['request_seconds'] = round(
                time.monotonic() - attempt_started, 3
            )
            attempt_metric['outcome'] = 'error'
            telemetry['llm_attempt_metrics'].append(attempt_metric)
            last_failure_reason = 'schema_reject'
            logger.warning(
                'Cloud provider %s error: %s — trying next',
                provider_name, exc,
            )
            continue

    # All providers exhausted
    telemetry['llm_failure_reason'] = last_failure_reason or 'schema_reject'
    telemetry['llm_total_seconds'] = round(
        time.monotonic() - parse_started, 3
    )
    return [], _empty_meta(), telemetry


def parse_document_metadata_with_cloud_vision(
    *,
    file_path: str,
    upload_type: str,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Lightweight cloud vision call for ownership gating.

    Extracts only doc_metadata.student_number.  Returns the same
    (doc_metadata, telemetry) tuple as
    ``parse_document_metadata_with_llm_vision``.
    """
    helpers = _get_llm_normalizer_helpers()

    provider_setting = str(
        getattr(settings, 'EXTRACTION_LLM_PROVIDER', 'ollama')
    ).strip().lower()
    providers = _PROVIDER_ORDER_MAP.get(provider_setting, ['gemini', 'groq'])
    timeout_seconds = max(
        5,
        int(getattr(settings, 'EXTRACTION_CLOUD_TIMEOUT_SECONDS', 30)),
    )

    telemetry: Dict[str, Any] = {
        'llm_used': True,
        'llm_parse_success': False,
        'llm_failure_reason': '',
        'llm_model': '',
        'llm_timeout_seconds': timeout_seconds,
        'llm_retry_count': 0,
        'stage': 'cloud_vision_metadata_gate',
    }

    # --- Preprocess images ---
    images_b64 = helpers['load_images'](
        file_path,
        max_pages=1,
        image_max_edge=1280,
        image_quality=72,
        pdf_dpi=180,
        grayscale=False,
        enable_chunking=False,
    )
    if not images_b64:
        telemetry['llm_failure_reason'] = 'metadata_missing'
        return _empty_meta(), telemetry

    prompt_text = helpers['build_metadata_prompt'](upload_type)

    # --- Try each provider in order ---
    for provider_name in providers:
        try:
            spec = _PROVIDER_CALLERS.get(provider_name, {})
            model_name = str(
                getattr(
                    settings,
                    spec.get('model_setting', ''),
                    spec.get('model_default', ''),
                )
            ).strip() or spec.get('model_default', '')
            telemetry['llm_model'] = model_name

            raw_text = _call_provider(
                provider_name,
                images_b64=images_b64,
                prompt_text=prompt_text,
                timeout_seconds=timeout_seconds,
            )

            doc_metadata, failure_reason = _parse_cloud_metadata_response(
                raw_text, helpers
            )

            if failure_reason:
                telemetry['llm_failure_reason'] = failure_reason
                logger.warning(
                    'Cloud metadata gate %s failed: %s — trying next',
                    provider_name, failure_reason,
                )
                continue

            telemetry['llm_parse_success'] = True
            telemetry['llm_failure_reason'] = ''
            logger.info(
                'Cloud metadata gate success: provider=%s student_number=%s',
                provider_name, doc_metadata.get('student_number'),
            )
            return doc_metadata, telemetry

        except requests.Timeout:
            telemetry['llm_failure_reason'] = 'timeout'
            logger.warning(
                'Cloud metadata gate %s timed out — trying next',
                provider_name,
            )
            continue

        except (ValueError, requests.RequestException) as exc:
            telemetry['llm_failure_reason'] = 'schema_reject'
            logger.warning(
                'Cloud metadata gate %s error: %s — trying next',
                provider_name, exc,
            )
            continue

    return _empty_meta(), telemetry
