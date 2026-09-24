import hashlib
import hmac
import json
import tempfile
import time
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import ValidationError

from .auth import SupabaseAuth, bearer, worker_token
from .catalog import load_catalog
from .config import settings
from .db import ACTIVE, TERMINAL, Conflict, Forbidden, Store
from .models import EvaluationRequest, WorkerFinish, WorkerUpdate, VisibilityUpdate
from .model_resolution import resolve_models, openrouter_models, verify_provider_keys
from .advanced import AdvancedSpec, merge_options
from .governance import PolicyUpdate, MemberUpdate, CreditGrant, Policy, Limits, enforce
from .spec import build_spec
from .secrets import encrypt
from .results import ResultSummary, ResultBatch
from .progress import progress
from .storage import LocalStorage, SupabaseStorage


def public_job(job):
    return {key: job[key] for key in ('id', 'state', 'stage', 'created_at', 'started_at', 'finished_at',
            'reserved_credits', 'charged_credits', 'error_code')} | {
                'compute_type':job['config'].get('compute_type','gpu'), 'progress': progress(job), 'name': job['config']['name'], 'engine': job['config']['engine'],
                'has_artifacts': bool(job['artifact']),
                'funding': job['config'].get('funding', 'service'),
                'visibility': job['config'].get('visibility', 'private'),
                'constitution': job['config'].get('constitution_name', 'Custom'),
                'models_count': len(job['config']['models']),
                'scenario_count': (job['config'].get('advanced_spec', {}).get('dataset', {}).get('count') or len(job['config']['scenarios']) or job['config'].get('scenario_count', 200))}


def create_app(config=None, store=None, auth=None, storage=None):
    cfg = config or settings()
    db = store or Store(cfg.database_url)
    auth = auth or SupabaseAuth(cfg)
    storage = storage or (SupabaseStorage(cfg) if cfg.environment == 'production' else LocalStorage(cfg.local_storage_path))
    catalog = load_catalog(cfg.model_catalog_path)
    app = FastAPI(title='ValueArena evaluation API', version='0.1.0')
    app.state.store = db
    app.add_middleware(CORSMiddleware, allow_origins=cfg.allowed_origins.split(','),
        allow_methods=['GET', 'POST', 'PUT'], allow_headers=['Authorization', 'Content-Type', 'Idempotency-Key'])

    @app.middleware('http')
    async def private_cache_control(request, call_next):
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        return response

    @app.exception_handler(Conflict)
    async def conflict(_, exc): return JSONResponse({'detail': str(exc)}, status_code=409)

    @app.exception_handler(Forbidden)
    async def forbidden(_, exc): return JSONResponse({'detail': str(exc)}, status_code=403)

    def user(authorization: str | None = Header(default=None)):
        token=bearer(authorization)
        identity=auth.identity(token) if hasattr(auth,'identity') else {'id':auth.user(token)}
        user_id=identity['id']
        db.ensure_member(user_id,identity.get('email',''),identity.get('username',''),bootstrap=user_id in cfg.admin_user_ids.split(','))
        return user_id

    def administrator(user_id=Depends(user)):
        member=db.member(user_id)
        if not member or member['role']!='admin' or member['status']!='approved':
            raise HTTPException(403,'Administrator access required')
        return user_id

    def effective_config(incoming,user_id):
        config=incoming.model_dump(exclude={'openrouter_key','runpod_key','hf_token'})
        defaults=db.policy()['policy']['spec_defaults']
        overrides=incoming.advanced_spec.model_dump(exclude_unset=True,exclude_none=True)
        merged=merge_options(defaults,overrides)
        try:
            advanced=AdvancedSpec.model_validate(merged)
            advanced.validate_panel(incoming.models,incoming.scenarios,incoming.scenario_count,incoming.criteria)
        except (ValueError,ValidationError):
            raise HTTPException(422,'Spec overrides conflict with site defaults or model panel') from None
        config['advanced_spec']=advanced.model_dump(exclude_unset=True,exclude_none=True)
        return config

    def select_compute(config,refs,user_id):
        local = any(isinstance(ref,dict) for ref in refs.values())
        if local and config['compute_type']=='cpu':
            raise HTTPException(422,'CPU evaluations support API models only; Hugging Face models require GPU')
        if not local:
            config.update(compute_type='cpu',gpu_count=1)
        enforce(config,db.effective_limits(user_id))

    @app.get('/admin')
    def admin_data(actor=Depends(administrator)):
        return db.admin_snapshot() | {'policy_schema':Policy.model_json_schema(),'limits_schema':Limits.model_json_schema()}

    @app.put('/admin/policy')
    def admin_policy(incoming:PolicyUpdate,actor=Depends(administrator)):
        return db.set_policy(actor,incoming)

    @app.put('/admin/members/{member_id}')
    def admin_member(member_id:UUID,incoming:MemberUpdate,actor=Depends(administrator)):
        return db.set_member(actor,str(member_id),incoming)

    @app.post('/admin/members/{member_id}/credits')
    def admin_credit(member_id:UUID,incoming:CreditGrant,actor=Depends(administrator)):
        db.admin_grant(actor,str(member_id),incoming)
        return db.balance(str(member_id))

    @app.get('/admin/evaluations')
    def admin_jobs(actor=Depends(administrator)):
        rows = db.list()[:200]
        metadata = db.get_presentations([j['id'] for j in rows])
        return [present(j, metadata.get(j['id'], {})) | {'user_id':j['user_id']} for j in rows]

    @app.get('/admin/evaluations/{job_id}/logs')
    def admin_logs(job_id:UUID,actor=Depends(administrator)):
        job=db.get(str(job_id))
        if not job:raise HTTPException(404,'Evaluation not found')
        return activity(job)

    @app.post('/admin/evaluations/{job_id}/cancel')
    def admin_cancel(job_id:UUID,actor=Depends(administrator)):
        job=db.get(str(job_id))
        if not job: raise HTTPException(404,'Evaluation not found')
        db.finish(str(job_id),'cancelled','admin_cancelled')
        if job['state']=='queued':
            db.settle(str(job_id)); db.forget_credentials(str(job_id))
        db.record_admin(actor,'cancel',str(job_id),{})
        return present(db.get(str(job_id)))

    def owned(job_id, user_id):
        job = db.get(str(job_id))
        if not job or job['user_id'] != user_id:
            raise HTTPException(404, 'Evaluation not found')
        return job

    def worker(job_id: UUID, authorization: str | None = Header(default=None)):
        token = bearer(authorization)
        if not hmac.compare_digest(token, worker_token(cfg.worker_secret, job_id)):
            raise HTTPException(401, 'Invalid worker credentials')
        job = db.get(str(job_id))
        if not job: raise HTTPException(404, 'Evaluation not found')
        return job

    def present(job, metadata=None):
        if metadata is None:
            metadata = db.get_presentations([job['id']]).get(job['id'], {})
        job = {**job, 'allocation': metadata.get('allocation')}
        publication=metadata.get('publication')
        if job['state']=='succeeded':
            desired=job['config'].get('visibility')=='public'
            if desired and not publication:publication={'state':'pending'}
            elif publication and publication.get('desired_public')!=desired:
                publication={**publication,'state':'pending' if desired else 'unpublishing'}
        summary=metadata.get('summary') or {}
        return public_job(job) | {'publication':publication, 'omitted_count': summary.get('omitted_count',0)}

    @app.get('/health')
    def health(): return {'status': 'ok'}

    @app.get('/models')
    def models():
        return {'models': [{'id': key, 'label': entry['label'], 'provider': 'huggingface' if isinstance(entry['ref'], dict) else 'openrouter'} for key, entry in catalog.items()],
                'engines': ['native', 'inspect'], 'default_engine': 'native', 'evaluation_mode': 'direct_rating'}

    @app.get('/models/openrouter')
    def available_openrouter(user_id=Depends(user)):
        return {'models': openrouter_models()}

    @app.get('/compute/availability')
    def compute_availability(disk_gb: int = Query(default=100, ge=50, le=2000), gpu_count: int = Query(default=1, ge=1, le=8), user_id=Depends(user)):
        if db.member(user_id)['status'] != 'approved':
            raise HTTPException(403, 'Account approval required')
        from .runpod import gpu_availability
        try:
            return gpu_availability(disk_gb, gpu_count)
        except Exception:
            raise HTTPException(503, 'RunPod availability could not be checked. Try again shortly.') from None

    @app.get('/spec-options')
    def spec_options():
        defaults = AdvancedSpec().model_dump(exclude_none=True)
        from .upstream import REPOSITORY, REVISION, GENERATION_DEFAULTS
        return {'defaults':merge_options(defaults,db.policy()['policy']['spec_defaults']),
                'schema':AdvancedSpec.model_json_schema(),
                'runner':{'repository':REPOSITORY,'revision':REVISION},
                'generation_defaults':GENERATION_DEFAULTS}

    @app.post('/spec-preview')
    def spec_preview(incoming: EvaluationRequest, user_id=Depends(user)):
        if db.member(user_id)['status']!='approved': raise HTTPException(403,'Account approval required')
        import pprint
        config = effective_config(incoming,user_id)
        config['model_refs'] = resolve_models(incoming, catalog, incoming.hf_token.get_secret_value() or (cfg.hf_token if incoming.funding == 'service' else ''))
        select_compute(config,config['model_refs'],user_id)
        spec = build_spec(config, '.')
        return {'spec': spec, 'python': 'RUN_SPEC = ' + pprint.pformat(spec, sort_dicts=False) + '\n'}

    @app.get('/account')
    def account(user_id=Depends(user)):
        return db.account_snapshot(user_id)

    @app.post('/evaluations', status_code=202)
    async def submit(request: Request, user_id=Depends(user), idempotency_key: str = Header(alias='Idempotency-Key')):
        if not 1 <= len(idempotency_key) <= 128: raise HTTPException(400, 'Invalid idempotency key')
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 2_000_000: raise HTTPException(413, 'Configuration too large')
        try:
            incoming = EvaluationRequest.model_validate_json(body)
        except ValidationError as exc:
            issues = exc.errors(include_input=False, include_url=False)
            detail = '; '.join('.'.join(map(str, e['loc'])) + ': ' + e['msg'] for e in issues[:3])
            raise HTTPException(422, detail) from None
        if db.member(user_id)['status']!='approved': raise HTTPException(403,'Your account is awaiting approval or has been suspended')
        if not db.policy()['policy']['submissions_enabled']: raise HTTPException(403,'New evaluations are temporarily paused')
        config=effective_config(incoming,user_id)
        from starlette.concurrency import run_in_threadpool
        refs = await run_in_threadpool(resolve_models, incoming, catalog, incoming.hf_token.get_secret_value() or (cfg.hf_token if incoming.funding == 'service' else ''))
        keys = {name: getattr(incoming, name).get_secret_value() for name in ('openrouter_key', 'runpod_key')}
        if incoming.funding == 'own_keys' and not all(keys.values()):
            raise HTTPException(422, 'Supply both your OpenRouter and RunPod API keys')
        if incoming.funding == 'own_keys':
            await run_in_threadpool(verify_provider_keys, keys)
        if incoming.funding == 'service' and db.member(user_id)['role']!='admin' and (incoming.gpu_type != cfg.runpod_gpu_type or incoming.disk_gb != cfg.runpod_disk_gb or incoming.gpu_count != 1 or incoming.cpu_count != 4 or incoming.cpu_flavor != 'cpu3g' or incoming.volume_gb != 0):
            raise HTTPException(422, 'Custom compute requires your own provider keys')
        select_compute(config,refs,user_id)
        digest = hashlib.sha256(json.dumps(config, sort_keys=True).encode()).hexdigest()
        # Snapshot the catalog: queued jobs do not silently change if administrators update it.
        config['model_refs'] = refs
        if incoming.funding != 'own_keys': keys = {}
        if incoming.hf_token.get_secret_value(): keys['hf_token'] = incoming.hf_token.get_secret_value()
        encrypted = encrypt(cfg.worker_secret, keys) if keys else None
        return present(db.submit(user_id, idempotency_key, digest, config, encrypted))

    @app.get('/evaluation-schema')
    def schema(): return EvaluationRequest.model_json_schema()

    @app.get('/evaluations')
    def evaluations(user_id=Depends(user)):
        rows = db.list(user_id)
        metadata = db.get_presentations([j['id'] for j in rows])
        return [present(job, metadata.get(job['id'], {})) for job in rows]

    @app.get('/experiments')
    def published():
        rows = db.public_jobs()
        metadata = db.get_presentations([j['id'] for j in rows])
        return [present(j, metadata.get(j['id'], {})) for j in rows if metadata.get(j['id'], {}).get('summary')]

    def readable(job_id, authorization):
        job = db.get(str(job_id))
        if job and job['state'] == 'succeeded' and job['config'].get('visibility') == 'public': return job
        if not authorization: raise HTTPException(404, 'Evaluation not found')
        return owned(job_id, auth.user(bearer(authorization)))

    @app.get('/results/{job_id}')
    def results(job_id: UUID, authorization: str | None = Header(default=None)):
        job = readable(job_id, authorization)
        result = db.get_presentation(job['id'], 'summary')
        if not result: raise HTTPException(404, 'Results are not available yet')
        return {'job': present(job), 'criteria': job['config']['criteria'][:job['config'].get('advanced_spec', {}).get('constitution', {}).get('num_criteria')], **result}

    @app.get('/results/{job_id}/viewer')
    def result_viewer(job_id: UUID, authorization: str | None = Header(default=None)):
        job = readable(job_id, authorization)
        if job['state'] != 'succeeded': raise HTTPException(404, 'Results are not available yet')
        from .viewer import viewer_manifest
        if isinstance(storage, LocalStorage):
            raise HTTPException(503, 'The full viewer requires signed result storage')
        try:
            return viewer_manifest(db, storage, job, cfg.max_artifact_bytes)
        except Exception:
            raise HTTPException(503, 'Result files could not be prepared. Please retry shortly.') from None

    @app.get('/results/{job_id}/records/{batch}')
    def records(job_id: UUID, batch: int, authorization: str | None = Header(default=None)):
        job = readable(job_id, authorization)
        result = db.get_presentation(job['id'], f'records-{batch}')
        if result is None: raise HTTPException(404, 'Record batch not found')
        return result

    @app.post('/evaluations/{job_id}/visibility')
    def visibility(job_id: UUID, update: VisibilityUpdate, user_id=Depends(user)):
        job = owned(job_id, user_id)
        if update.visibility == 'public' and (db.member(user_id)['status']!='approved' or not db.effective_limits(user_id)['allow_public_results']):
            raise HTTPException(403,'Public results are disabled for this account')
        if update.visibility == 'public' and (job['state'] != 'succeeded' or not db.get_presentation(job['id'], 'summary')):
            raise HTTPException(409, 'Only completed results can be published')
        db.visibility(job['id'], update.visibility)
        return present(db.get(job['id']))

    def activity(job):
        return {'text':db.get_presentation(job['id'],'log') or '',
                'provider':db.get_presentation(job['id'],'provider_activity'),
                'pod_name':'valuearena-'+job['id'] if job.get('pod_id') else None,
                'gpu':f"{job['config'].get('cpu_count', 4)} vCPUs" if job['config'].get('compute_type') == 'cpu' else f"{job['config'].get('gpu_count', 1)} × {job['config'].get('gpu_type',cfg.runpod_gpu_type)}",
                'state':job['state'],'stage':job['stage'],'progress':progress({**job, 'allocation':db.get_presentation(job['id'],'allocation')})}

    @app.get('/evaluations/{job_id}/logs')
    def logs(job_id: UUID, user_id=Depends(user)):
        job = owned(job_id, user_id)
        return activity(job)

    @app.put('/internal/jobs/{job_id}/results/{part}')
    async def upload_result(part: str, request: Request, job=Depends(worker)):
        if job['state'] not in ACTIVE: raise HTTPException(409, 'Job is no longer active')
        import re
        if part != 'summary' and not re.fullmatch(r'records-\d{1,5}', part): raise HTTPException(422, 'Unknown result part')
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 8_000_000: raise HTTPException(413, 'Result part too large')
        try:
            data = (ResultSummary if part == 'summary' else ResultBatch).model_validate_json(body).model_dump()
        except ValidationError:
            raise HTTPException(422, 'Invalid result data') from None
        db.put_presentation(job['id'], part, data)
        return {'ok': True}

    @app.get('/evaluations/{job_id}')
    def evaluation(job_id: UUID, user_id=Depends(user)):
        return present(owned(job_id, user_id))

    @app.get('/evaluations/{job_id}/settings')
    def evaluation_settings(job_id: UUID, user_id=Depends(user)):
        job = owned(job_id, user_id)
        # Credentials are never returned, even if future config formats add them.
        fields = set(EvaluationRequest.model_fields) - {'hf_token', 'openrouter_key', 'runpod_key'}
        return {key: value for key, value in job['config'].items() if key in fields}

    @app.post('/evaluations/{job_id}/cancel')
    def cancel(job_id: UUID, user_id=Depends(user)):
        job = owned(job_id, user_id)
        db.finish(job['id'], 'cancelled', 'user_cancelled')
        # Queued jobs never launched a pod and can release their reservation immediately.
        if job['state'] == 'queued':
            fresh = db.get(job['id'])
            if fresh['started_at'] is None:
                db.settle(job['id'])
                db.forget_credentials(job['id'])
        return present(db.get(job['id']))

    @app.get('/evaluations/{job_id}/artifacts')
    def artifacts(job_id: UUID, user_id=Depends(user)):
        job = owned(job_id, user_id)
        if not job['artifact']: raise HTTPException(404, 'Artifacts are not available yet')
        if isinstance(storage, LocalStorage):
            return FileResponse(storage.root / job['artifact'], filename='evaluation.tar.gz')
        return {'url': storage.download_url(job['artifact']), 'expires_in': 300}

    @app.get('/internal/jobs/{job_id}')
    def worker_config(job=Depends(worker)):
        if job['state'] not in ACTIVE: raise HTTPException(409, 'Job is no longer active')
        return {'id': job['id'], 'config': job['config'],
                'deadline_at': (job['started_at'] + job['config']['max_runtime_seconds']) if job['config'].get('max_runtime_seconds') is not None else None,
                'max_artifact_bytes': cfg.max_artifact_bytes}

    @app.post('/internal/jobs/{job_id}/heartbeat')
    def heartbeat(update: WorkerUpdate, job=Depends(worker)):
        ok = db.patch(job['id'], ACTIVE, state='running', stage=update.stage, heartbeat_at=int(time.time()))
        if not ok: raise HTTPException(409, 'Job is no longer active')
        if update.log: db.put_presentation(job['id'], 'log', update.log)
        return {'cancelled': False}

    @app.put('/internal/jobs/{job_id}/artifacts')
    async def upload(request: Request, job=Depends(worker)):
        if job['state'] not in ACTIVE: raise HTTPException(409, 'Job is no longer active')
        size = 0
        with tempfile.NamedTemporaryFile() as out:
            async for chunk in request.stream():
                size += len(chunk)
                if size > cfg.max_artifact_bytes: raise HTTPException(413, 'Artifact exceeds configured storage limit')
                out.write(chunk)
            if size == 0: raise HTTPException(400, 'Empty artifact')
            out.flush()
            key = f"{job['user_id']}/{job['id']}/evaluation.tar.gz"
            # No archive extraction or executable user content on the API server.
            from starlette.concurrency import run_in_threadpool
            await run_in_threadpool(storage.put, key, out.name)
        if not db.patch(job['id'], ACTIVE, artifact=key):
            raise HTTPException(409, 'Job ended during upload')
        return {'bytes': size}

    @app.post('/internal/jobs/{job_id}/finish')
    def finish(result: WorkerFinish, job=Depends(worker)):
        if job['state'] in TERMINAL: return {'state': job['state']}
        if result.success and not job['artifact']: raise HTTPException(409, 'Upload results before completing')
        db.finish(job['id'], 'succeeded' if result.success else 'failed', result.error_code)
        return {'state': db.get(job['id'])['state']}

    return app
