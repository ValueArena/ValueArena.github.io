import logging
import httpx
import time
from contextlib import ExitStack

from .config import settings
from .db import ACTIVE, TERMINAL, Store
from .runpod import RunPod, GPUUnavailable, AllocationRejected
from .secrets import decrypt

log = logging.getLogger(__name__)


ALLOCATION_TIMEOUT = 300


def allocate(db, client, job, now):
    allocation = db.get_presentation(job['id'], 'allocation') or {'first_attempt_at': now, 'attempts': 0}
    allocation.update(attempts=allocation['attempts'] + 1, next_retry_at=None, outcome='uncertain')
    # Persist uncertainty BEFORE sending: a scheduler crash must never duplicate a pod.
    db.put_presentation(job['id'], 'allocation', allocation)
    try:
        pod_id = client.create(job)
        allocation.update(outcome='allocated', allocated_at=now)
        db.patch(job['id'], ('provisioning', 'running', *TERMINAL), pod_id=pod_id, error_code=None)
    except GPUUnavailable:
        delay = (15, 30, 60)[min(allocation['attempts'] - 1, 2)]
        allocation.update(outcome='unavailable', next_retry_at=now + delay)
        db.patch(job['id'], ('provisioning',), error_code='gpu_unavailable')
    except Exception as exc:
        code = f'provider_create_http_{exc.response.status_code}' if isinstance(exc, httpx.HTTPStatusError) else 'provider_create_uncertain'
        if isinstance(exc, AllocationRejected): code = 'allocation_rejected'
        if isinstance(exc, AllocationRejected) or (isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code in (400,401,403,404,422)):
            db.finish(job['id'], 'failed', code)
        else:
            db.patch(job['id'], ('provisioning',), error_code=code)
        log.warning('Pod allocation failed for job %s (%s)', job['id'], code)
    db.put_presentation(job['id'], 'allocation', allocation)


def tick(db, pods, cfg, now=None):
    now = int(time.time()) if now is None else now
    with db.scheduler_lock() as locked, ExitStack() as cleanup:
        if not locked: return
        current = db.list()
        clients = {}
        observations = {}
        def provider(job):
            if job['config'].get('funding') != 'own_keys' and not db.job_credentials(job['id']): return pods
            if job['id'] in clients: return clients[job['id']]
            encrypted = db.job_credentials(job['id'])
            if not encrypted: return None
            keys = decrypt(cfg.worker_secret, encrypted)
            client = RunPod(cfg.model_copy(update={'runpod_api_key': keys.get('runpod_key', cfg.runpod_api_key),
                'openrouter_api_key': keys.get('openrouter_key', cfg.openrouter_api_key),
                'hf_token': keys.get('hf_token', '' if job['config'].get('funding') == 'own_keys' else cfg.hf_token)}))
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
                allocation = db.get_presentation(job['id'], 'allocation') or {}
                if matches and not job['pod_id']:
                    db.patch(job['id'], ACTIVE, pod_id=matches[0]['id'], error_code=None)
                    job = {**job, 'pod_id': matches[0]['id']}
                    allocation.update(outcome='allocated', allocated_at=now, next_retry_at=None)
                    db.put_presentation(job['id'], 'allocation', allocation)
                if len(matches) > 1:
                    db.finish(job['id'], 'failed', 'duplicate_pods')
                elif job['config'].get('max_runtime_seconds') is not None and now - job['started_at'] >= job['config']['max_runtime_seconds']:
                    db.finish(job['id'], 'failed', 'runtime_limit')
                elif job['heartbeat_at'] and now-job['heartbeat_at'] > cfg.heartbeat_timeout:
                    db.finish(job['id'], 'failed', 'worker_unresponsive')
                elif not job['pod_id'] and allocation and now - allocation['first_attempt_at'] >= ALLOCATION_TIMEOUT:
                    db.finish(job['id'], 'failed', 'gpu_unavailable' if allocation.get('outcome') == 'unavailable' else 'allocation_unconfirmed')
                elif job['pod_id'] and not job['heartbeat_at'] and now - allocation.get('allocated_at', job['started_at']) >= cfg.startup_timeout:
                    db.finish(job['id'], 'failed', 'worker_start_timeout')
                elif not allocation and not job['heartbeat_at'] and now - job['started_at'] > cfg.startup_timeout:
                    db.finish(job['id'], 'failed', job.get('error_code') or 'worker_start_timeout')
                elif (job['state'] == 'provisioning' and not job['pod_id'] and not job['heartbeat_at']
                      and allocation.get('outcome') == 'unavailable' and now >= allocation['next_retry_at']):
                    member = db.member(job['user_id'])
                    if not member or member['status'] != 'approved':
                        db.finish(job['id'], 'cancelled', 'account_disabled')
                    elif db.policy()['policy']['dispatch_enabled']:
                        allocate(db, client, job, now)
                # Uncertain creates are reconciled by name, never resubmitted.
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
            allocate(db, provider(job), job, now)




def main():
    cfg = settings()
    if not cfg.worker_image or not cfg.api_public_url:
        raise SystemExit('Set WORKER_IMAGE and API_PUBLIC_URL')
    db = Store(cfg.database_url); pods = RunPod(cfg)
    logging.basicConfig(level=logging.INFO)
    import threading
    from .publication import publication_loop
    threading.Thread(target=publication_loop,args=(db,cfg),daemon=True).start()
    from .run_activity import activity_loop
    threading.Thread(target=activity_loop,args=(db,cfg),daemon=True).start()
    while True:
        try: tick(db, pods, cfg)
        except Exception:
            # Do not log provider response bodies: they may contain container env secrets.
            log.error('Scheduler tick failed; will retry without resubmitting active jobs')
        time.sleep(cfg.scheduler_interval)


if __name__ == '__main__': main()
