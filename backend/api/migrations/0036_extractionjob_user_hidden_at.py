from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0035_parentlinkrequest'),
    ]

    operations = [
        migrations.AddField(
            model_name='extractionjob',
            name='user_hidden_at',
            field=models.DateTimeField(
                blank=True,
                db_index=True,
                help_text='Timestamp when this job was hidden from the end-user recent history. Admin endpoints still retain visibility for operations and analytics.',
                null=True,
            ),
        ),
        migrations.AddIndex(
            model_name='extractionjob',
            index=models.Index(fields=['user', 'user_hidden_at'], name='api_extjob_user_hidden_idx'),
        ),
    ]
