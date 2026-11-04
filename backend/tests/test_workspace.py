import json
import time
from pathlib import Path

import pytest
from fastapi import HTTPException
from app import model_resolution
from app.db import credentials
from app.models import EvaluationRequest
from app.secrets import decrypt
from app.spec import write_spec
from app.worker import log_tail, publish_results
from app.scheduler import tick
from test_backend import service, submit, payload, USER, OTHER, worker_headers, Pods


def own_payload(**kwargs):
    return payload(funding='own_keys', openrouter_key='test-or-secret', runpod_key='test-rp-secret', **kwargs)


def test_keys_encrypted_never_in_config_or_artifacts(service, monkeypatch, tmp_path):
    cfg, db, client = service
    monkeypatch.setattr('app.api.verify_provider_keys', lambda keys: None)
    job = submit(client, own_payload()).json()
    saved = db.get(job['id'])
    assert 'test-or-secret' not in json.dumps(saved)
    assert 'test-rp-secret' not in json.dumps(saved)
    encrypted = db.job_credentials(job['id'])
    assert 'test-or-secret' not in encrypted
    assert decrypt(cfg.worker_secret, encrypted)['runpod_key'] == 'test-rp-secret'
    assert saved['reserved_credits'] == 0
    path = write_spec(saved['config'], tmp_path/'spec')
    for file in path.parent.iterdir():
        assert 'test-or-secret' not in file.read_text()
        assert 'test-rp-secret' not in file.read_text()


def test_own_keys_require_both_and_are_verified(service, monkeypatch):
    cfg, db, client = service
    assert submit(client, payload(funding='own_keys')).status_code == 422
    def rejected(_): raise HTTPException(422, 'RunPod rejected that API key')
    monkeypatch.setattr('app.api.verify_provider_keys', rejected)
    assert submit(client, own_payload()).status_code == 422
    assert db.list() == []
    assert submit(client, payload(gpu_type='NVIDIA H100 80GB HBM3')).status_code == 422


def test_custom_models_are_pinned_and_safe(service, monkeypatch):
    _, db, client = service
    monkeypatch.setattr(model_resolution, 'hf_snapshot', lambda *args, **kwargs: 'a'*40)
    monkeypatch.setattr(model_resolution, 'validate_adapters', lambda refs, token='': None)
    model = {'id': 'my-qwen', 'provider': 'huggingface', 'repo_id': 'me/adapter', 'kind': 'lora',
             'subfolder': 'introspection-final', 'base_model_id': 'Qwen/Qwen2.5-7B-Instruct'}
    result = submit(client, payload(models=['a', 'my-qwen'], custom_models=[model]))
    assert result.status_code == 202, result.text
    ref = db.get(result.json()['id'])['config']['model_refs']['my-qwen']
    assert ref['revision'] == ref['base_revision'] == 'a'*40
    assert ref['subfolder'] == 'introspection-final'
    for change in ({'subfolder': '../bad'}, {'repo_id': 'http://localhost/private'}, {'id': 'a'}):
        assert submit(client, payload(models=['a', 'my-qwen'], custom_models=[model | change]), key=str(change)).status_code == 422


def test_live_logs_private_and_public_results_reversible(service):
    cfg, db, client = service
    job_id = submit(client).json()['id']
    tick(db, Pods(), cfg)
    headers = worker_headers(cfg, job_id)
    client.post(f'/internal/jobs/{job_id}/heartbeat', json={'stage': 'collecting', 'log': 'hello'}, headers=headers)
    owner = {'Authorization': 'Bearer '+USER}; stranger = {'Authorization': 'Bearer '+OTHER}
    assert client.get(f'/evaluations/{job_id}/logs', headers=owner).json()['text'] == 'hello'
    assert client.get(f'/evaluations/{job_id}/logs', headers=stranger).status_code == 404
    data = {'summary': [{'model_index': 0, 'model_name': 'a', 'elo_mean': 1500}], 'record_count': 0, 'batch_count': 0}
    assert client.put(f'/internal/jobs/{job_id}/results/summary', json=data, headers=headers).status_code == 200
    assert client.get(f'/results/{job_id}').status_code == 404
    assert client.get(f'/results/{job_id}', headers=stranger).status_code == 404
    assert client.get(f'/results/{job_id}', headers=owner).status_code == 200
    assert client.post(f'/evaluations/{job_id}/visibility', json={'visibility': 'public'}, headers=owner).status_code == 409
    db.finish(job_id, 'succeeded')
    assert client.post(f'/evaluations/{job_id}/visibility', json={'visibility': 'public'}, headers=stranger).status_code == 404
    assert client.post(f'/evaluations/{job_id}/visibility', json={'visibility': 'public'}, headers=owner).status_code == 200
    assert client.get('/experiments').json()[0]['id'] == job_id
    assert client.get(f'/results/{job_id}').status_code == 200
    assert client.get(f'/evaluations/{job_id}/logs').status_code == 401
    client.post(f'/evaluations/{job_id}/visibility', json={'visibility': 'private'}, headers=owner)
    assert client.get('/experiments').json() == []
    assert client.get(f'/results/{job_id}').status_code == 404


def test_redaction_happens_before_live_log_tail(tmp_path, monkeypatch):
    monkeypatch.setenv('OPENROUTER_API_KEY', 'private-provider-value')
    monkeypatch.setenv('VA_WORKER_TOKEN', 'private-worker-value')
    (tmp_path/'execution.log').write_text('x'*250000+'\nprivate-provider-value\nBearer other-token\nprivate-worker-value')
    tail = log_tail(tmp_path)
    assert len(tail) <= 64000
    assert 'private-provider-value' not in tail and 'private-worker-value' not in tail and 'other-token' not in tail


def test_default_airisk_is_loaded_at_worker_once(service, monkeypatch, tmp_path):
    import sys, types
    _, db, client = service
    fake = types.ModuleType('pipeline.config.airisk')
    fake.load_airisk_scenarios = lambda: ['question one', 'question two', 'question three']
    monkeypatch.setitem(sys.modules, 'pipeline.config.airisk', fake)
    body = payload(); del body['scenarios']; body['scenario_count'] = 2
    response = submit(client, body)
    assert response.status_code == 202
    config = db.get(response.json()['id'])['config']
    write_spec(config, tmp_path)
    assert json.loads((tmp_path/'scenarios.json').read_text()) == ['question one', 'question two', 'question three']
    scope = {}; exec((tmp_path/'spec.py').read_text(), scope)
    assert scope['RUN_SPEC']['dataset']['count'] == 2


def test_own_provider_cleanup_uses_own_key_and_erases_only_after_deletion(service, monkeypatch):
    cfg, db, api = service
    monkeypatch.setattr('app.api.verify_provider_keys', lambda keys: None)
    job_id = submit(api, own_payload(gpu_type='NVIDIA H100 80GB HBM3', disk_gb=200)).json()['id']
    seen = []; cloud = []
    class OwnPods:
        name = staticmethod(Pods.name)
        def __init__(self, settings):
            assert settings.runpod_api_key == 'test-rp-secret'
            assert settings.openrouter_api_key == 'test-or-secret'
            assert settings.hf_token == ''
            self.client = self
        def close(self): pass
        def list(self): return cloud.copy()
        def create(self, job):
            seen.append(job['config']['gpu_type']); cloud.append({'name': self.name(job['id']), 'id': 'own-pod'}); return 'own-pod'
        def delete(self, pod_id):
            assert db.job_credentials(job_id)
            assert pod_id == 'own-pod'; cloud.clear()
    monkeypatch.setattr('app.scheduler.RunPod', OwnPods)
    tick(db, Pods(), cfg)
    assert seen == ['NVIDIA H100 80GB HBM3']
    db.finish(job_id, 'succeeded')
    tick(db, Pods(), cfg)
    assert cloud == [] and db.get(job_id)['cleanup_done']
    assert db.job_credentials(job_id) is None


def test_presentation_batches_include_every_judgment(tmp_path):
    (tmp_path/'analysis').mkdir(); (tmp_path/'analysis/summary.json').write_text('[]')
    row = {'scenario': 'Q', 'scenario_index': 0, 'evaluee': {'name': 'A'}, 'judge': {'name': 'B'}, 'response': 'answer'}
    (tmp_path/'evaluations.jsonl').write_text((json.dumps(row)+'\n')*51)
    class Client:
        values = {}
        def put_result(self, part, data): self.values[part] = data
    client = Client(); publish_results(client, tmp_path)
    assert client.values['summary']['record_count'] == 51
    assert client.values['summary']['batch_count'] == 3
    assert sum(len(data['records']) for key, data in client.values.items() if key.startswith('records-')) == 51


def test_cancel_before_launch_erases_keys_without_provider_access(service, monkeypatch):
    cfg, db, client = service
    monkeypatch.setattr('app.api.verify_provider_keys', lambda keys: None)
    job_id = submit(client, own_payload()).json()['id']
    assert db.job_credentials(job_id)
    result = client.post(f'/evaluations/{job_id}/cancel', headers={'Authorization': 'Bearer '+USER})
    assert result.status_code == 200
    assert db.job_credentials(job_id) is None
    assert db.get(job_id)['cleanup_done']


def test_hf_resolver_rejects_gated_or_missing_weights(monkeypatch):
    class Response:
        status_code = 200
        data = {'sha': 'a'*40, 'gated': 'auto', 'siblings': []}
        def raise_for_status(self): pass
        def json(self): return self.data
    response = Response()
    monkeypatch.setattr(model_resolution.httpx, 'get', lambda *args, **kwargs: response)
    with pytest.raises(HTTPException, match='requires access approval'):
        model_resolution.hf_snapshot('owner/model', 'main')
    response.data['gated'] = False
    with pytest.raises(HTTPException, match='safetensors'):
        model_resolution.hf_snapshot('owner/model', 'main')
    response.data['siblings'] = [{'rfilename': 'config.json'}, {'rfilename': 'model.safetensors'}]
    assert model_resolution.hf_snapshot('owner/model', 'main') == 'a'*40


def test_user_hf_token_encrypted_and_forwarded_on_service_run(service,monkeypatch):
    cfg,db,api=service
    observed=[]
    monkeypatch.setattr('app.api.resolve_models',lambda req,catalog,token: observed.append(token) or {'a':'org/a','b':'org/b'})
    response=submit(api,payload(hf_token='hf_personal_secret'))
    assert response.status_code==202
    job_id=response.json()['id']
    assert observed==['hf_personal_secret']
    assert 'hf_personal_secret' not in json.dumps(db.get(job_id))
    assert decrypt(cfg.worker_secret,db.job_credentials(job_id))=={'hf_token':'hf_personal_secret'}
    class TokenPods(Pods):
        def __init__(self,settings):
            assert settings.hf_token=='hf_personal_secret'
            super().__init__()
            self.client=self
        def close(self):pass
    monkeypatch.setattr('app.scheduler.RunPod',TokenPods)
    tick(db,Pods(),cfg)
    assert db.get(job_id)['pod_id']


def test_gated_weight_access_is_checked_without_downloading(monkeypatch):
    data={'sha':'a'*40,'gated':'auto','siblings':[{'rfilename':'config.json'},{'rfilename':'model.safetensors'}]}
    import httpx
    def get(url,**kwargs):
        assert kwargs['headers']['Authorization']=='Bearer hf_test'
        return httpx.Response(200,json=data,request=httpx.Request('GET',url))
    def head(url,**kwargs):
        assert '/resolve/'+('a'*40)+'/model.safetensors' in url
        assert kwargs['headers']['Authorization']=='Bearer hf_test'
        return httpx.Response(200,request=httpx.Request('HEAD',url))
    monkeypatch.setattr(model_resolution.httpx,'get',get)
    monkeypatch.setattr(model_resolution.httpx,'head',head)
    assert model_resolution.hf_snapshot('owner/model','main',token='hf_test')=='a'*40
    monkeypatch.setattr(model_resolution.httpx,'head',lambda url,**kw:httpx.Response(403,request=httpx.Request('HEAD',url)))
    with pytest.raises(HTTPException,match='denied weight access'):
        model_resolution.hf_snapshot('owner/model','main',token='hf_test')


def test_reflection_budget_and_omission_policy_reach_spec():
    from app.spec import build_spec
    config=payload(advanced_spec={'collection':{'generation':{'reflection':{'max_tokens':8192}}}})
    config['model_refs']={'a':'org/a','b':'org/b'}
    spec=build_spec(config,'.')
    assert spec['collection']['generation']['reflection']['max_tokens']==8192
    assert spec['collection']['failure_policy']=='omit_invalid_judgments'
    config['advanced_spec']['collection']['failure_policy']='strict'
    assert build_spec(config,'.')['collection']['failure_policy']=='strict'


def test_models_too_large_for_the_gpu_are_refused_before_launch(service, monkeypatch):
    _, db, client = service
    monkeypatch.setattr(model_resolution, 'hf_snapshot', lambda *args, **kwargs: 'b'*40)
    # Qwen/Qwen3.8-27B: 55.6 GB of bf16 safetensors.
    monkeypatch.setitem(model_resolution.weight_bytes, ('Qwen/Qwen3.8-27B', 'b'*40, ''), 55_563_006_776)
    model = {'id': 'big-qwen', 'provider': 'huggingface', 'repo_id': 'Qwen/Qwen3.8-27B', 'kind': 'base'}
    result = submit(client, payload(models=['a', 'big-qwen'], custom_models=[model]))
    assert result.status_code == 422
    assert 'big-qwen needs about 56 GB' in result.json()['detail'] and 'own provider keys' in result.json()['detail']
    assert db.list() == []

    refs = {'big-qwen': {'provider': 'hf_local', 'kind': 'base', 'repo_id': 'Qwen/Qwen3.8-27B', 'revision': 'b'*40}}
    check = model_resolution.check_gpu_fit
    check(refs, {'gpu_type': 'NVIDIA H100 80GB HBM3'}, True)
    # The model is split across the pod's GPUs (tensor parallel).
    check(refs, {'gpu_type': 'NVIDIA A40', 'gpu_count': 2}, True)
    with pytest.raises(HTTPException, match='Choose an 80 GB GPU'):
        check(refs, {'gpu_type': 'NVIDIA A40'}, True)
    # A LoRA is sized by its base model; unknown sizes are not guessed.
    lora = {'x': {'provider': 'hf_local', 'kind': 'lora', 'repo_id': 'me/adapter', 'revision': 'c'*40,
                  'base_model_id': 'Qwen/Qwen3.8-27B', 'base_revision': 'b'*40}}
    with pytest.raises(HTTPException, match='x needs about 56 GB'):
        check(lora, {'gpu_type': 'NVIDIA A40'}, True)
    check({'y': refs['big-qwen'] | {'revision': 'd'*40}}, {'gpu_type': 'NVIDIA A40'}, True)


def test_hf_resolver_records_weight_size(monkeypatch):
    import httpx
    data = {'sha': 'e'*40, 'siblings': [{'rfilename': 'config.json', 'size': 900},
                                        {'rfilename': 'model-1.safetensors', 'size': 3_000_000_000},
                                        {'rfilename': 'model-2.safetensors', 'size': 2_000_000_000}]}
    seen = {}
    def get(url, **kwargs):
        seen.update(kwargs.get('params') or {})
        return httpx.Response(200, json=data, request=httpx.Request('GET', url))
    monkeypatch.setattr(model_resolution.httpx, 'get', get)
    monkeypatch.setattr(model_resolution, 'weight_bytes', {})
    assert model_resolution.hf_snapshot('owner/model', 'main') == 'e'*40
    assert seen['blobs'] == 'true'
    assert model_resolution.weight_bytes == {('owner/model', 'e'*40, ''): 5_000_000_000}
