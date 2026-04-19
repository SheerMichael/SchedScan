from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0044_user_faculty_verification_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='parentlinkrequest',
            name='parent_hidden_at',
            field=models.DateTimeField(
                blank=True,
                db_index=True,
                help_text="Timestamp when this request was hidden from the parent's request history.",
                null=True,
            ),
        ),
        migrations.AddIndex(
            model_name='parentlinkrequest',
            index=models.Index(fields=['parent', 'parent_hidden_at'], name='api_parentl_parent__1f8b8d_idx'),
        ),
    ]
