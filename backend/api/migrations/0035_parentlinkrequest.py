from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0034_extractionjob_llm_failure_reason_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='ParentLinkRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('approved', 'Approved'), ('rejected', 'Rejected'), ('cancelled', 'Cancelled')], default='pending', help_text='Current status of the link request', max_length=10)),
                ('requested_at', models.DateTimeField(auto_now_add=True)),
                ('resolved_at', models.DateTimeField(blank=True, null=True)),
                ('child', models.ForeignKey(help_text='The student receiving the request', on_delete=models.deletion.CASCADE, related_name='incoming_parent_link_requests', to='api.user')),
                ('parent', models.ForeignKey(help_text='The parent requesting access', on_delete=models.deletion.CASCADE, related_name='outgoing_parent_link_requests', to='api.user')),
            ],
            options={
                'verbose_name': 'Parent Link Request',
                'verbose_name_plural': 'Parent Link Requests',
                'ordering': ['-requested_at'],
            },
        ),
        migrations.AddIndex(
            model_name='parentlinkrequest',
            index=models.Index(fields=['parent', 'status'], name='api_parentl_parent__1a4b30_idx'),
        ),
        migrations.AddIndex(
            model_name='parentlinkrequest',
            index=models.Index(fields=['child', 'status'], name='api_parentl_child_i_a7f4be_idx'),
        ),
        migrations.AddConstraint(
            model_name='parentlinkrequest',
            constraint=models.UniqueConstraint(condition=models.Q(('status', 'pending')), fields=('parent', 'child'), name='unique_pending_parent_link_request'),
        ),
    ]
