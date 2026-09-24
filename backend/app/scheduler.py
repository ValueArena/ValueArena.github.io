import logging
import time
from contextlib import ExitStack

from .config import settings
from .db import ACTIVE, TERMINAL, Store
from .runpod import RunPod
from .secrets import decrypt

log = logging.getLogger(__name__)


def tick(db, pods, cfg, now=None):
    now = int(time.time()) if now is None else now
    with db.scheduler_lock() as locked, ExitStack() as cleanup:
        if not locked: return
        current = db.list()
        clients = {}
        observations = {}
        def provider(job):
            if job['config'].get('funding') != 'own_keys': return pods
            if job['id'] in clients: return clients[job['id']]
            encrypted = db.job_credentials(job['id'])
            if not encrypted: return None
            keys = decrypt(cfg.worker_secret, encrypted)
            client = RunPod(cfg.model_copy(update={'runpod_api_key': keys['runpod_key'],
                'openrouter_api_key': keys['openrouter_key'], 'hf_token': ''}))
            cleanup.callback(client.client.close)
            clients[job['id']] = client
            return client
        reachable = set()
        for job in current:
            client = provider(job)
            if client is None: continue  # Completed own-key jobs have erased their keys.
            try:
                if id(client) not in observations:
                    observations[id(client)] = client.list()
                observed = observations[id(client)]
                reachable.add(job['id'])
            except Exception:
                log.warning('Cannot reach provider for job %s; preserving cleanup credentials', job['id'])
                continue
            matches = [p for p in observed if p['name'] == client.name(job['id'])]
            if job['state'] in TERMINAL:
                # Reconcile by name even after cleanup, catching delayed create responses.
                targets = {p['id'] for p in matches}
                if not job['cleanup_done'] and job['pod_id']: targets.add(job['pod_id'])
                for pod_id in targets: client.delete(pod_id)
                db.settle(job['id'])
                if targets or job['pod_id'] or job['started_at'] is None:
                    db.forget_credentials(job['id'])
                continue
            if job['state'] in ACTIVE:
                if matches and not job['pod_id']:
                    db.patch(job['id'], ACTIVE, pod_id=matches[0]['id'])
                if len(matches) > 1:
                    db.finish(job['id'], 'failed', 'duplicate_pods')
                elif job['config'].get('max_runtime_seconds') is not None and now - job['started_at'] >= job['config']['max_runtime_seconds']:
                    db.finish(job['id'], 'failed', 'runtime_limit')
                elif job['heartbeat_at'] and now-job['heartbeat_at'] > cfg.heartbeat_timeout:
                    db.finish(job['id'], 'failed', 'worker_unresponsive')
                elif not job['heartbeat_at'] and now-job['started_at'] > cfg.startup_timeout:
                    db.finish(job['id'], 'failed', 'worker_start_timeout')
                # Never reissue a create request for provisioning jobs after a crash/timeout.
        p=db.policy()['policy']
        current = db.list()
        occupied = sum(j['state'] in ACTIVE or (j['state'] in TERMINAL and not j['cleanup_done']) for j in current)
        for job in sorted(current, key=lambda j: j['created_at']):
            if not p['dispatch_enabled'] or (p['max_running_jobs'] is not None and occupied >= p['max_running_jobs']): break
            if job['state'] != 'queued' or job['id'] not in reachable: continue
            member=db.member(job['user_id'])
            if not member or member['status']!='approved':
                db.finish(job['id'],'cancelled','account_disabled')
                db.settle(job['id']); db.forget_credentials(job['id']); continue
            if not db.claim_job(job['id'],now): continue
            occupied += 1
            try:
                pod_id = provider(job).create(job)
                db.patch(job['id'], ('provisioning', 'running', *TERMINAL), pod_id=pod_id)
            except Exception:
                # The provider may have accepted the request before the connection failed.
                # Leave provisioning in place and reconcile its deterministic name next tick.
                log.warning('Pod create outcome unknown for job %s; awaiting reconciliation', job['id'])



def main():
    cfg = settings()
    if not cfg.worker_image or not cfg.api_public_url:
        raise SystemExit('Set WORKER_IMAGE and API_PUBLIC_URL')
    db = Store(cfg.database_url); pods = RunPod(cfg)
    logging.basicConfig(level=logging.INFO)
    import threading
    from .publication import publication_loop
    threading.Thread(target=publication_loop,args=(db,cfg),daemon=True).start()
    while True:
        try: tick(db, pods, cfg)
        except Exception:
            # Do not log provider response bodies: they may contain container env secrets.
            log.error('Scheduler tick failed; will retry without resubmitting active jobs')
        time.sleep(cfg.scheduler_interval)


if __name__ == '__main__': main()
