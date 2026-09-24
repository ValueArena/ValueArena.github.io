"""Describe observed run state without guessing at provider startup progress."""
import time

ERRORS = {
    'worker_start_timeout': 'The worker did not connect before the startup timeout.',
    'worker_unresponsive': 'The worker stopped sending heartbeats.',
    'runtime_limit': 'The execution-time limit was reached.',
    'evaluation_failed': 'The evaluation process failed. Check worker output for details.',
    'duplicate_pods': 'More than one GPU instance was detected for this job.',
    'account_disabled': 'The account was disabled before the run started.',
    'user_cancelled': 'You cancelled this evaluation.',
    'admin_cancelled': 'An administrator cancelled this evaluation.',
}


def progress(job, now=None):
    now = int(time.time()) if now is None else now
    state = job['state']; stage = job['stage']
    error = job.get('error_code') or ''
    provider_error = error.startswith('provider_create_')
    provider_detail = ('RunPod returned HTTP '+error.removeprefix('provider_create_http_')+'. ' if error.startswith('provider_create_http_') else 'The RunPod allocation request did not return a confirmed result. ')
    provider_detail += 'No GPU allocation has been confirmed. The scheduler checks for a late-created instance instead of sending another request.'
    if state == 'queued':
        title, detail, step = 'Queued', 'Waiting for the scheduler to allocate a GPU. Admin concurrency settings or a dispatch pause can keep a job queued.', 0
    elif state == 'provisioning':
        if provider_error and not job.get('pod_id'):
            title, detail, step = 'GPU allocation not confirmed', provider_detail, 1
        elif job.get('pod_id'):
            title, detail, step = 'GPU allocated · waiting for worker', 'A RunPod instance has been allocated. The container has not reported ready yet; image download and container startup happen before worker output is available.', 1
        else:
            title, detail, step = 'Requesting GPU', 'The scheduler requested an instance and is waiting for confirmation from RunPod. Model evaluation has not started.', 1
    elif state == 'running':
        title, detail, step = {
            'starting': ('Worker connected', 'Preparing the evaluation configuration.', 2),
            'collecting': ('Collecting responses and judgments', 'The worker is preparing models and running the scenario panel. Model downloads, loading and generation details appear in worker output as they are emitted.', 3),
            'analyzing': ('Computing rankings', 'Responses and judgments have been collected. The worker is computing scores and bootstrap intervals.', 4),
            'uploading': ('Saving results', 'Uploading evaluation artifacts and any available rankings and transcripts.', 5),
        }.get(stage, ('Worker running', 'The worker is active. See its output below.', 2))
    elif state == 'succeeded':
        title, detail, step = 'Completed', 'Rankings and transcripts are ready.', 6
    else:
        title, detail, step = ('Cancelled' if state == 'cancelled' else 'Failed'), (provider_detail if provider_error else ERRORS.get(job.get('error_code'), 'The evaluation stopped. See worker output for details.')), -1
    end = job.get('finished_at') or now
    return {'title': title, 'detail': detail, 'step': step, 'checked_at': now,
            'elapsed_seconds': max(0, end-job['created_at']),
            'worker_last_seen_at': job.get('heartbeat_at'),
            'gpu_allocated': bool(job.get('pod_id')),
            'cleanup_pending': state in {'succeeded','failed','cancelled'} and not job.get('cleanup_done',False)}
