from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0027_recover_passwordresetcode_table'),
    ]

    operations = [
        migrations.AddField(
            model_name='calendarevent',
            name='end_date',
            field=models.DateField(
                blank=True,
                null=True,
                help_text='Optional end date for multi-day events (inclusive). Null means the event is a single day.',
            ),
        ),
        migrations.AddIndex(
            model_name='calendarevent',
            index=models.Index(fields=['end_date'], name='api_calenda_end_dat_3f6b9a_idx'),
        ),
    ]
