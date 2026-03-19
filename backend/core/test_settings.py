from .settings import *  # noqa: F401,F403

# Use SQLite for local test runs where PostgreSQL is unavailable.
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'test_db.sqlite3',
    }
}

PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.MD5PasswordHasher',
]

EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'

# API migrations include PostgreSQL-specific SQL; for local SQLite test runs,
# build API tables directly from models instead.
MIGRATION_MODULES = {
    'api': None,
}
