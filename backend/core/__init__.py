try:
    from .celery import app as celery_app

    __all__ = ('celery_app',)
except ModuleNotFoundError:
    # Allow the API to run even before celery dependencies are installed.
    __all__ = ()
