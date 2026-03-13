"""
Data migration: set is_verified=True for all existing users.
Existing accounts should not be retroactively locked out.
New accounts created *after* this migration will default to is_verified=False.
"""
from django.db import migrations


def verify_existing_users(apps, schema_editor):
    User = apps.get_model("api", "User")
    User.objects.all().update(is_verified=True)


def noop(apps, schema_editor):
    pass  # No reverse needed


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0023_add_user_is_verified_and_audit_actions"),
    ]

    operations = [
        migrations.RunPython(verify_existing_users, noop),
    ]
