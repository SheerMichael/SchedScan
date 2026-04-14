from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0036_extractionjob_user_hidden_at'),
    ]

    operations = [
        migrations.AlterField(
            model_name='extractionlog',
            name='failure_category',
            field=models.CharField(
                choices=[
                    ('none', 'None'),
                    ('no_text', 'No Text'),
                    ('parse_error', 'Parse Error'),
                    ('low_confidence', 'Low Confidence'),
                    ('missing_day', 'Missing Day'),
                    ('metadata_mismatch', 'Metadata Mismatch'),
                    ('system_error', 'System Error'),
                ],
                default='none',
                help_text='Structured reason why extraction failed or required retry',
                max_length=30,
            ),
        ),
        migrations.AlterField(
            model_name='extractionjob',
            name='failure_category',
            field=models.CharField(
                blank=True,
                choices=[
                    ('low_confidence', 'Low Confidence'),
                    ('parse_error', 'Parse Error'),
                    ('no_text', 'No Text Extracted'),
                    ('missing_day', 'Missing Day'),
                    ('metadata_mismatch', 'Metadata Mismatch'),
                    ('system_error', 'System Error'),
                    ('none', 'None'),
                ],
                default='none',
                help_text="Structured reason the job failed (populated on status='failed')",
                max_length=30,
            ),
        ),
    ]
