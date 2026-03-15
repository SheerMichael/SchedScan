from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0028_calendarevent_add_end_date'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='class_reminder_minutes_before',
            field=models.PositiveSmallIntegerField(
                choices=[(5, '5 minutes'), (10, '10 minutes'), (15, '15 minutes')],
                default=15,
                help_text='Preferred reminder lead time before class starts',
            ),
        ),
    ]
