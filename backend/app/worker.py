"""RunPod entrypoint. Has only a job-scoped API token, never DB/storage admin keys."""
import json
import os
import re
from pathlib import Path
import signal
import subprocess
import sys
import tarfile
import threading
import time

import httpx

from .spec import write_spec


class WorkerClient:
    def __init__(self):
        self.root = os.environ['VA_API_URL'].rstrip('/') + '/internal/jobs/' + os.environ['VA_JOB_ID']
        self.headers = {'Authorization': 'Bearer '+os.environ['VA_WORKER_TOKEN']}

    def get(self):
        response = httpx.get(self.root, headers=self.headers, timeout=30)
        response.raise_for_status()
        return response.json()

    def post(self, endpoint, data):
        response = httpx.post(self.root+'/'+endpoint, headers=self.headers, json=data, timeout=30)
        response.raise_for_status()
        return response.json()

    def put_result(self, part, data):
        response = httpx.put(self.root+'/results/'+part, headers=self.headers, json=data, timeout=60)
        response.raise_for_status()

    def upload(self, path):
        with path.open('rb') as source:
            response = httpx.put(self.root+'/artifacts', headers={**self.headers, 'Content-Type': 'application/gzip'},
                content=source, timeout=180)
        response.raise_for_status()


def redact(value):
    for key, secret in os.environ.items():
        if secret and (key.endswith(('_KEY', '_TOKEN', '_SECRET')) or key == 'DATABASE_URL'):
            value = value.replace(secret, '[REDACTED]')
    value = re.sub(r'Bearer\s+[A-Za-z0-9._-]+', 'Bearer [REDACTED]', value, flags=re.I)
    return value


def log_tail(directory):
    path = directory/'execution.log'
    if not path.exists(): return ''
    with path.open('rb') as source:
        source.seek(max(0, path.stat().st_size-256000))
        value = source.read().decode('utf-8', errors='replace')
    return redact(value)[-64000:]


def read_summary(directory):
    from .results import RatingRow
    root=directory/'analysis'/'direct_rating'
    if not root.is_dir():root=directory/'analysis'  # Older hosted artifacts.
    path=root/'bootstrap'/'summary.json'
    if not path.exists():path=root/'summary.json'
    rows=json.loads(path.read_text())
    return [RatingRow.model_validate({**row,'elo_mean':row.get('elo_mean',row.get('eigenbench_elo'))}).model_dump(exclude_none=True) for row in rows]


def publish_results(client, directory):
    count = 0; batch_count = 0; batch = []
    path = directory/'evaluations.jsonl'
    if path.exists():
        with path.open() as source:
            for line in source:
                if not line.strip(): continue
                row = json.loads(redact(line))
                batch.append({'scenario': row.get('scenario', ''), 'scenario_index': row.get('scenario_index', -1),
                    'model': row.get('evaluee', {}).get('name', ''), 'judge': row.get('judge', {}).get('name', ''),
                    'response': row.get('response', ''), 'reflection': row.get('reflection', ''),
                    'judgment': row.get('judgment_raw', '')})
                count += 1
                if len(batch) == 25:
                    client.put_result(f'records-{batch_count}', {'records': batch})
                    batch = []; batch_count += 1
    if batch:
        client.put_result(f'records-{batch_count}', {'records': batch}); batch_count += 1
    summary = read_summary(directory)
    omitted_path = directory/'omitted_samples.json'
    coverage = json.loads(omitted_path.read_text()) if omitted_path.exists() else {}
    client.put_result('summary', {'summary': summary, 'record_count': count, 'batch_count': batch_count,
        'omitted_count': coverage.get('omitted',0), 'planned_count': coverage.get('planned')})


def bundle(directory, target):
    # Archive only run artifacts, never model caches, parent directories, or symlinks.
    with tarfile.open(target, 'w:gz') as archive:
        for path in sorted(directory.rglob('*')):
            if path.is_file() and not path.is_symlink():
                archive.add(path, arcname=str(path.relative_to(directory)), recursive=False)


def execute_stage(command, directory, abort, deadline):
    env = {k: v for k, v in os.environ.items() if not k.startswith('VA_')}
    env['PYTHONUNBUFFERED'] = '1'
    with (directory/'execution.log').open('ab') as log:
        process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, env=env, start_new_session=True)
        try:
            while process.poll() is None:
                if abort.wait(1) or (deadline is not None and time.time() >= deadline):
                    raise RuntimeError('cancelled_or_timed_out')
                if (directory/'execution.log').stat().st_size > 20_000_000:
                    raise RuntimeError('log_size_limit')
            if process.returncode: raise RuntimeError('evaluation_failed')
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                try: process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL); process.wait()


def run(client, workdir, execute=execute_stage):
    job = client.get(); config = job['config']
    directory = Path(workdir)/job['id']; directory.mkdir(parents=True, exist_ok=True)
    deadline = job['deadline_at']
    abort = threading.Event(); done = threading.Event()
    state = {'stage': 'starting'}

    def pulse():
        last_ok = time.monotonic()
        while not done.is_set():
            try:
                client.post('heartbeat', {'stage': state['stage'], 'log': log_tail(directory)})
                last_ok = time.monotonic()
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code in (401, 403, 404, 409): abort.set(); return
            except Exception:
                pass
            if time.monotonic()-last_ok > 90: abort.set(); return
            done.wait(15)

    pulse_thread = threading.Thread(target=pulse, daemon=True); pulse_thread.start()
    error = None
    try:
        spec = write_spec(config, directory)
        for phase in ('collecting', 'analyzing'):
            state['stage'] = phase
            client.post('heartbeat', {'stage': phase})
            execute([sys.executable, '-m', 'app.stage', config['engine'], phase, str(spec)], directory, abort, deadline)
        if not read_summary(directory):
            raise RuntimeError('missing_analysis')
    except Exception:
        error = 'evaluation_failed'
    try:
        if not abort.is_set():
            state['stage'] = 'uploading'
            # Redact known provider secrets from plain logs before sharing artifacts.
            for path in directory.rglob('*'):
                if path.is_file() and not path.is_symlink() and path.suffix in {'.json','.jsonl','.txt','.csv','.log'}:
                    content=path.read_text(errors='replace')
                    cleaned=redact(content)
                    if cleaned!=content:path.write_text(cleaned)
            client.post('heartbeat', {'stage': 'uploading', 'log': log_tail(directory)})
            if error is None: publish_results(client, directory)
            (directory/'worker-result.json').write_text(json.dumps({'engine': config['engine'], 'error_code': error}))
            archive = directory.parent/(job['id']+'.tar.gz')
            bundle(directory, archive)
            if archive.stat().st_size > job['max_artifact_bytes']: raise RuntimeError('artifact_too_large')
            client.upload(archive)
            client.post('finish', {'success': error is None, 'error_code': error})
    except Exception:
        try: client.post('finish', {'success': False, 'error_code': 'artifact_upload_failed'})
        except Exception: pass  # Scheduler detects timeout and cleans up.
        error = 'artifact_upload_failed'
    finally:
        done.set(); pulse_thread.join(timeout=35)
    return 1 if error or abort.is_set() else 0


def main():
    try: return run(WorkerClient(), os.environ.get('VA_WORKDIR', '/workspace/jobs'))
    except Exception:
        # Startup failures are reconciled by the scheduler; do not print secrets.
        print('Worker startup failed', file=sys.stderr)
        return 1


if __name__ == '__main__': raise SystemExit(main())
