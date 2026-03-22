from django.apps import AppConfig
from django.conf import settings


class ApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'api'

    def ready(self):
        # Optional runtime readiness validation for Ollama-backed normalization.
        if not bool(getattr(settings, 'EXTRACTION_LLM_STARTUP_CHECK_ENABLED', False)):
            return
        from .utils.extraction.llm_normalizer import run_llm_startup_health_check

        run_llm_startup_health_check()
