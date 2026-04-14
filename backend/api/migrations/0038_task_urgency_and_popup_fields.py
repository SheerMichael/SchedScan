from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0037_add_missing_day_failure_category'),
    ]

    operations = [
        migrations.AddField(
            model_name='task',
            name='due_date',
            field=models.DateTimeField(
                blank=True,
                help_text='Optional due date used to escalate urgency as deadline approaches',
                null=True,
            ),
        ),
        migrations.AddField(
            model_name='task',
            name='last_urgent_popup_at',
            field=models.DateTimeField(
                blank=True,
                help_text='Last time an invasive urgent popup was shown for this task',
                null=True,
            ),
        ),
        migrations.AddField(
            model_name='task',
            name='urgency',
            field=models.CharField(
                choices=[('low', 'Low'), ('medium', 'Medium'), ('high', 'High'), ('critical', 'Critical')],
                default='medium',
                help_text='User-selected urgency level',
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name='task',
            name='urgent_snoozed_until',
            field=models.DateTimeField(
                blank=True,
                help_text='Suppress urgent popup for this task until this time',
                null=True,
            ),
        ),
        migrations.AddIndex(
            model_name='task',
            index=models.Index(fields=['user', 'is_completed', 'urgency'], name='api_task_user_id_129589_idx'),
        ),
        migrations.AddIndex(
            model_name='task',
            index=models.Index(fields=['user', 'is_completed', 'due_date'], name='api_task_user_id_9fa0ca_idx'),
        ),
    ]
