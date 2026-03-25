from django.apps import AppConfig
from django.conf import settings
from django.db.utils import OperationalError, ProgrammingError


class ApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'api'

    def ready(self):
        # Optional runtime readiness validation for Ollama-backed normalization.
        if not bool(getattr(settings, 'EXTRACTION_LLM_STARTUP_CHECK_ENABLED', False)):
            pass
        else:
            from .utils.extraction.llm_normalizer import run_llm_startup_health_check

            run_llm_startup_health_check()

        # Optional stale job recovery at startup.
        if not bool(getattr(settings, 'EXTRACTION_RECOVER_STALE_JOBS_ON_STARTUP', False)):
            return

        from .utils.extraction_manager import recover_stale_processing_jobs

        try:
            recover_stale_processing_jobs(
                max_age_minutes=int(getattr(settings, 'EXTRACTION_STALE_JOB_MAX_AGE_MINUTES', 5)),
                notify_user=True,
                dry_run=False,
            )
        except (OperationalError, ProgrammingError):
            # DB/table may not be available during migrations or early boot.
            return
