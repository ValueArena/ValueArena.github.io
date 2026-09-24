import json
import tarfile
import time
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api import create_app
from app.auth import worker_token
from app.catalog import load_catalog
from app.config import Settings
from app.db import Store
from app.models import EvaluationRequest
from app.scheduler import tick
from app.spec import write_spec
from app.storage import LocalStorage
from app.worker import run

USER = '11111111-1111-4111-8111-111111111111'
OTHER = '22222222-2222-4222-8222-222222222222'


class Auth:
    def user(self, token):
        if token not in (USER, OTHER): raise HTTPException(401, 'Invalid token')
        return token


@pytest.fixture
def service(tmp_path):
    catalog = tmp_path/'catalog.json'
    catalog.write_text(json.dumps({'a': {'label': 'Model A', 'ref': 'org/model-a'}, 'b': {'label': 'Model B', 'ref': 'org/model-b'}}))
    cfg = Settings(environment='test', worker_secret='x'*40,
        database_url='sqlite:///'+str(tmp_path/'test.db'), model_catalog_path=catalog,
        startup_timeout=60, heartbeat_timeout=60, max_artifact_bytes=1024)
    db = Store(cfg.database_url); db.initialize(); db.grant(USER, 10000); db.grant(OTHER, 10000)
    from app.governance import PolicyUpdate
    policy = db.policy(); policy['policy']['limits']['require_credits'] = True; policy['policy']['limits']['max_outstanding_jobs'] = 2; policy['policy']['max_running_jobs'] = 1
    db.set_policy(USER, PolicyUpdate(**policy))
    client = TestClient(create_app(cfg, db, Auth(), LocalStorage(tmp_path/'objects')))
    return cfg, db, client


def payload(**kwargs):
    return {'name': 'Test', 'models': ['a', 'b'], 'criteria': ['Be kind'],
            'scenarios': ['One scenario'], 'max_runtime_seconds': 600, **kwargs}


def submit(client, body=None, key='one', user=USER):
    return client.post('/evaluations', json=body or payload(), headers={'Authorization': 'Bearer '+user, 'Idempotency-Key': key})


def worker_headers(cfg, job_id):
    return {'Authorization': 'Bearer '+worker_token(cfg.worker_secret, job_id)}


def test_auth_and_private_results(service):
    cfg, db, client = service
    assert client.get('/evaluations').status_code == 401
    result = submit(client); assert result.status_code == 202
    job_id = result.json()['id']
    assert client.get('/evaluations/'+job_id, headers={'Authorization': 'Bearer '+OTHER}).status_code == 404
    assert client.get('/evaluations', headers={'Authorization': 'Bearer '+OTHER}).json() == []
    assert client.get('/internal/jobs/'+job_id, headers={'Authorization': 'Bearer '+USER}).status_code == 401
    assert client.post('/internal/jobs/'+job_id+'/finish', json={'success': True}, headers=worker_headers(cfg, job_id)).status_code == 409


def test_idempotency_and_reservation(service):
    _, db, client = service
    first = submit(client).json()
    assert submit(client).json()['id'] == first['id']
    assert db.balance(USER)['credits'] == 9400
    assert submit(client, payload(name='Changed')).status_code == 409
    assert db.balance(USER)['credits'] == 9400
    assert submit(client, key='two').status_code == 202
    assert submit(client, key='three').status_code == 409


def test_credits_and_unknown_models(service):
    _, db, client = service
    assert submit(client, payload(max_runtime_seconds=14400)).status_code == 403
    assert submit(client, payload(models=['a', 'unlisted'])).status_code == 422
    assert submit(client, payload(engine='shell')).status_code == 422
    assert submit(client, payload(spec='import os')).status_code == 422
    assert submit(client, payload(scenarios=['same', 'same'])).status_code == 422
    assert db.balance(USER)['credits'] == 10000


@pytest.mark.parametrize('engine', ['native', 'inspect'])
def test_engine_snapshot_and_safe_spec(service, tmp_path, engine):
    _, db, client = service
    name = "quote'; __import__('os').system('false') #"
    result = submit(client, payload(engine=engine, name=name)).json()
    config = db.get(result['id'])['config']
    spec_path = write_spec(config, tmp_path/'run')
    scope = {}; exec(spec_path.read_text(), scope)
    spec = scope['RUN_SPEC']
    assert spec['name'] == name
    assert config['engine'] == engine
    assert spec['models'] == {'a': 'org/model-a', 'b': 'org/model-b'}
    assert spec['collection'].get('generation', {}) == {}
    assert spec['collection']['inspect']['cache'] is False
    assert spec['upload']['enabled'] is False
    assert not spec['training'].get('allow_missing', False)


def test_cancellation_is_idempotent(service):
    _, db, client = service
    job_id = submit(client).json()['id']
    for _ in range(2):
        r = client.post('/evaluations/'+job_id+'/cancel', headers={'Authorization': 'Bearer '+USER})
        assert r.json()['state'] == 'cancelled'
    assert db.balance(USER)['credits'] == 10000
    assert db.get(job_id)['charged_credits'] == 0


class Pods:
    def __init__(self): self.items = []; self.created = []; self.deleted = []; self.uncertain = False
    @staticmethod
    def name(job_id): return 'valuearena-'+job_id
    def list(self): return self.items.copy()
    def create(self, job):
        pod = {'id': 'pod-'+job['id'], 'name': self.name(job['id'])}
        self.items.append(pod); self.created.append(job['id'])
        if self.uncertain: raise TimeoutError()
        return pod['id']
    def delete(self, pod_id):
        self.deleted.append(pod_id); self.items = [p for p in self.items if p['id'] != pod_id]


def test_scheduler_recovers_uncertain_create_without_duplicate(service):
    cfg, db, client = service
    job_id = submit(client).json()['id']; pods = Pods(); pods.uncertain = True
    now = int(time.time())
    tick(db, pods, cfg, now); tick(db, pods, cfg, now+10)
    assert len(pods.created) == 1
    assert db.get(job_id)['pod_id'] == 'pod-'+job_id
    db.finish(job_id, 'cancelled')
    tick(db, pods, cfg, now+11); tick(db, pods, cfg, now+12)
    assert not pods.items
    assert db.get(job_id)['cleanup_done']
    assert db.get(job_id)['charged_credits'] is not None


def test_scheduler_capacity_and_timeout(service):
    cfg, db, client = service
    first = submit(client).json()['id']; submit(client, key='two')
    pods = Pods(); now = int(time.time())
    tick(db, pods, cfg, now)
    assert len(pods.created) == 1
    tick(db, pods, cfg, now+61)
    assert db.get(first)['state'] == 'failed'
    assert db.get(first)['error_code'] == 'worker_start_timeout'
    assert len(pods.created) == 1  # Slot is occupied until cleanup succeeds.
    tick(db, pods, cfg, now+62)
    assert len(pods.created) == 2


def test_scheduler_cleanup_failure_does_not_release_slot(service):
    cfg, db, client = service
    job_id = submit(client).json()['id']; submit(client, key='two')
    pods = Pods(); tick(db, pods, cfg)
    db.finish(job_id, 'failed')
    def fail(_): raise OSError('provider unavailable')
    pods.delete = fail
    with pytest.raises(OSError): tick(db, pods, cfg)
    assert len(pods.created) == 1
    assert db.get(job_id)['charged_credits'] is None


def test_upload_owner_and_finish_order(service):
    cfg, db, client = service
    job_id = submit(client).json()['id']; other_job = submit(client, user=OTHER).json()['id']
    tick(db, Pods(), cfg)
    headers = worker_headers(cfg, job_id); root = '/internal/jobs/'+job_id
    assert client.post(root+'/heartbeat', json={'stage': 'collecting'}, headers=headers).status_code == 200
    assert client.put('/internal/jobs/'+other_job+'/artifacts', content=b'bytes', headers=headers).status_code == 401
    assert client.post(root+'/finish', json={'success': True}, headers=headers).status_code == 409
    assert client.put(root+'/artifacts', content=b'x'*1025, headers=headers).status_code == 413
    assert client.put(root+'/artifacts', content=b'archive', headers=headers).status_code == 200
    assert client.post(root+'/finish', json={'success': True}, headers=headers).json()['state'] == 'succeeded'
    assert client.post(root+'/heartbeat', json={'stage': 'collecting'}, headers=headers).status_code == 409
    assert client.get('/evaluations/'+job_id+'/artifacts', headers={'Authorization': 'Bearer '+OTHER}).status_code == 404
    assert client.get('/evaluations/'+job_id+'/artifacts', headers={'Authorization': 'Bearer '+USER}).content == b'archive'


@pytest.mark.parametrize('engine', ['native', 'inspect'])
@pytest.mark.parametrize('fail', [False, True])
def test_worker_lifecycle(service, tmp_path, engine, fail):
    cfg, db, api = service
    job_id = submit(api, payload(engine=engine)).json()['id']; tick(db, Pods(), cfg)
    cfg.max_artifact_bytes = 10_000_000
    class Client:
        def get(self):
            job = db.get(job_id)
            return {'id': job_id, 'config': job['config'], 'deadline_at': time.time()+600, 'max_artifact_bytes': 10_000_000}
        def post(self, endpoint, data):
            response = api.post(f'/internal/jobs/{job_id}/{endpoint}', json=data, headers=worker_headers(cfg, job_id))
            response.raise_for_status(); return response.json()
        def put_result(self, part, data):
            response = api.put(f'/internal/jobs/{job_id}/results/{part}', json=data, headers=worker_headers(cfg, job_id))
            response.raise_for_status()
        def upload(self, path):
            # Real private storage semantics, no external services or GPU charges.
            with tarfile.open(path) as archive:
                assert 'spec.py' in archive.getnames()
                assert 'request.json' in archive.getnames()
            db.patch(job_id, ('running',), artifact='test/result.tar.gz')
    phases = []
    def execute(command, directory, abort, deadline):
        assert command[3] == engine
        phase = command[4]; phases.append(phase)
        if fail: raise RuntimeError('invalid ratings')
        if phase == 'analyzing':
            (directory/'analysis/direct_rating').mkdir(parents=True); (directory/'analysis/direct_rating/summary.json').write_text(json.dumps([{'model_index': 0, 'model_name': 'a', 'eigenbench_elo': 1500}]))
    code = run(Client(), tmp_path/'work', execute)
    assert code == (1 if fail else 0)
    assert db.get(job_id)['state'] == ('failed' if fail else 'succeeded')
    assert phases == (['collecting'] if fail else ['collecting', 'analyzing'])


def test_catalog_rejects_unpinned_local_models(tmp_path):
    path = tmp_path/'catalog.json'
    path.write_text(json.dumps({'a': {'label': 'local', 'ref': {'provider': 'hf_local', 'kind': 'base', 'repo_id': 'owner/model', 'revision': 'main'}}}))
    with pytest.raises(ValueError, match='Pin local'): load_catalog(path)


def test_production_never_uses_local_test_database():
    with pytest.raises(ValidationError): Settings(environment='production', worker_secret='x'*40, database_url='sqlite://')


def test_storage_uses_new_secret_key_as_apikey_only(service):
    from app.storage import SupabaseStorage
    cfg, _, _ = service
    cfg.supabase_url = 'https://example.supabase.co'
    cfg.supabase_secret_key = 'sb_secret_test'
    storage = SupabaseStorage(cfg)
    assert storage.headers == {'apikey': 'sb_secret_test'}
    cfg.supabase_secret_key = 'legacy.jwt.value'
    assert SupabaseStorage(cfg).headers['Authorization'] == 'Bearer legacy.jwt.value'


def test_capacity_retry_backoff_and_separate_startup_window(service):
    from app.runpod import GPUUnavailable
    cfg, db, client = service
    job_id = submit(client).json()['id']; now = int(time.time())
    class CapacityPods(Pods):
        attempts = 0
        def create(self, job):
            self.attempts += 1
            if self.attempts < 4: raise GPUUnavailable()
            return super().create(job)
    pods = CapacityPods()
    for offset, expected in [(0,1),(10,1),(15,2),(44,2),(45,3),(104,3),(105,4)]:
        tick(db,pods,cfg,now+offset)
        assert pods.attempts == expected
        assert db.get(job_id)['state'] == 'provisioning'
    tick(db,pods,cfg,now+164)
    assert db.get(job_id)['state'] == 'provisioning'
    tick(db,pods,cfg,now+165)
    assert db.get(job_id)['error_code'] == 'worker_start_timeout'


def test_capacity_deadline_and_cancel_stop_retries(service):
    from app.runpod import GPUUnavailable
    cfg, db, client = service
    job_id = submit(client).json()['id']; now = int(time.time())
    class CapacityPods(Pods):
        attempts = 0
        def create(self, job):
            self.attempts += 1
            raise GPUUnavailable()
    pods = CapacityPods()
    tick(db,pods,cfg,now); tick(db,pods,cfg,now+299)
    assert pods.attempts == 2
    tick(db,pods,cfg,now+300)
    assert db.get(job_id)['error_code'] == 'gpu_unavailable'
    assert db.get(job_id)['state'] == 'failed'
    tick(db,pods,cfg,now+310)
    assert pods.attempts == 2
    second = submit(client,key='retry').json()['id']
    tick(db,pods,cfg,now+320)
    db.finish(second,'cancelled','user_cancelled')
    tick(db,pods,cfg,now+400)
    assert pods.attempts == 3


def test_settings_are_owned_and_secret_free(service):
    _,db,client=service
    job=submit(client).json()['id']
    result=client.get(f'/evaluations/{job}/settings',headers={'Authorization':'Bearer '+USER})
    assert result.status_code == 200
    assert result.json()['models'] == ['a','b']
    assert not {'hf_token','runpod_key','openrouter_key','model_refs'} & result.json().keys()
    assert client.get(f'/evaluations/{job}/settings',headers={'Authorization':'Bearer '+OTHER}).status_code == 404


def test_uncertain_allocation_never_retries_and_late_pod_gets_full_startup(service):
    cfg, db, client = service
    job_id = submit(client).json()['id']; now = int(time.time())
    class LostResponse(Pods):
        attempts = 0
        def create(self, job):
            self.attempts += 1
            raise TimeoutError()
    pods = LostResponse()
    tick(db,pods,cfg,now); tick(db,pods,cfg,now+120)
    assert pods.attempts == 1
    pods.items.append({'id':'late-pod','name':pods.name(job_id)})
    tick(db,pods,cfg,now+290)
    assert db.get(job_id)['pod_id'] == 'late-pod'
    tick(db,pods,cfg,now+320)
    assert db.get(job_id)['state'] == 'provisioning'
    assert pods.attempts == 1
    tick(db,pods,cfg,now+350)
    assert db.get(job_id)['error_code'] == 'worker_start_timeout'


def test_unavailable_progress_shows_attempt_and_next_retry(service, monkeypatch):
    monkeypatch.setattr('app.api.resolve_models',lambda *args:{'a':{'provider':'hf_local'},'b':'org/b'})
    from app.runpod import GPUUnavailable
    cfg,db,client=service
    job_id=submit(client).json()['id']
    pods=Pods()
    def unavailable(job): raise GPUUnavailable()
    pods.create=unavailable
    tick(db,pods,cfg)
    view=client.get(f'/evaluations/{job_id}',headers={'Authorization':'Bearer '+USER}).json()
    assert view['progress']['title'] == 'Waiting for GPU availability'
    assert 'Attempt 1' in view['progress']['detail']
    assert 'Next retry' in view['progress']['detail']
    assert 'NVIDIA A40' in view['progress']['detail']
    assert 'model evaluation has not started' in view['progress']['detail']


def test_compute_limits_and_cpu_local_models(service, monkeypatch):
    from app.governance import enforce
    from app.db import Forbidden
    cfg,db,client=service
    config=EvaluationRequest(**payload(gpu_count=4,volume_gb=200)).model_dump()
    limits=db.effective_limits(USER)
    with pytest.raises(Forbidden,match='max_gpu_count'):enforce(config,{**limits,'max_gpu_count':2})
    with pytest.raises(Forbidden,match='max_disk_gb'):enforce(config,{**limits,'max_disk_gb':250})
    with pytest.raises(ValidationError):EvaluationRequest(**payload(engine='inspect',gpu_count=2))
    monkeypatch.setattr('app.api.resolve_models', lambda *args: {'a':{'provider':'hf_local'},'b':'org/b'})
    result=client.post('/spec-preview',json=payload(compute_type='cpu'),headers={'Authorization':'Bearer '+USER})
    assert result.status_code==422 and 'API models only' in result.json()['detail']


@pytest.mark.parametrize('requested_compute',['gpu','cpu'])
def test_api_only_panels_automatically_use_cpu_for_members(service,requested_compute,monkeypatch):
    cfg,db,client=service
    config=payload(compute_type=requested_compute)
    response=submit(client,config)
    assert response.status_code==202,response.text
    job=db.get(response.json()['id'])
    assert job['config']['compute_type']=='cpu'
    assert job['config']['gpu_count']==1
    assert response.json()['compute_type']=='cpu'
    # Preview applies the same choice before compiling the spec.
    from app.spec import build_spec as compile_spec
    def capture(config,directory):
        assert config['compute_type']=='cpu'
        return compile_spec(config,directory)
    monkeypatch.setattr('app.api.build_spec',capture)
    assert client.post('/spec-preview',json=config,headers={'Authorization':'Bearer '+USER}).status_code==200


def test_mixed_panel_keeps_gpu(service,monkeypatch):
    _,db,client=service
    monkeypatch.setattr('app.api.resolve_models',lambda *args:{'a':{'provider':'hf_local'},'b':'org/b'})
    response=submit(client)
    assert response.status_code==202
    assert db.get(response.json()['id'])['config']['compute_type']=='gpu'


def test_auto_cpu_respects_cpu_limit(service):
    from app.governance import PolicyUpdate
    _,db,client=service
    policy=db.policy();policy['policy']['limits']['max_cpu_count']=2
    db.set_policy(USER,PolicyUpdate(**policy))
    response=submit(client,payload(compute_type='gpu'))
    assert response.status_code==403
    assert 'max_cpu_count' in response.json()['detail']
