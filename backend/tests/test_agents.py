import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api import create_app
from app.catalog import load_catalog
from app.config import Settings
from app.db import Store
from app.publication import export_bundle
from app.runpod import RunPod
from app.spec import build_spec
from app.storage import LocalStorage
from test_backend import Auth, USER, payload, submit
from test_publication import SUMMARY, archive

AGENT = {'provider': 'agent_endpoint', 'service': 'agent-nycc', 'model': 'nycc-agent',
         'base_url': 'https://laisr-nycc.hf.space/v1', 'key_env': 'AGENT_NYCC_KEY'}


@pytest.fixture
def service(tmp_path):
    catalog = tmp_path/'catalog.json'
    catalog.write_text(json.dumps({'a': {'label': 'Model A', 'ref': 'org/model-a'},
                                   'nycc': {'label': 'NYCC agent', 'ref': AGENT}}))
    cfg = Settings(environment='test', worker_secret='x'*40, database_url='sqlite:///'+str(tmp_path/'test.db'),
                   model_catalog_path=catalog, startup_timeout=60, heartbeat_timeout=60)
    db = Store(cfg.database_url); db.initialize(); db.grant(USER, 10000)
    return cfg, db, TestClient(create_app(cfg, db, Auth(), LocalStorage(tmp_path/'objects')))


def write_catalog(tmp_path, ref):
    path = tmp_path/'bad.json'
    path.write_text(json.dumps({'x': {'label': 'X', 'ref': ref}}))
    return path


@pytest.mark.parametrize('change, message', [
    ({'base_url': 'http://laisr-nycc-api.hf.space/v1'}, 'https'),
    ({'base_url': 'https://user:pass@example.com/v1'}, 'https'),
    ({'service': 'openrouter'}, 'agent-name'),
    ({'service': 'agent-NYCC'}, 'agent-name'),
    ({'key_env': 'SUPABASE_SECRET_KEY'}, 'AGENT_'),
    ({'extra': 'field'}, 'need service'),
])
def test_catalog_rejects_unsafe_agent_entries(tmp_path, change, message):
    assert load_catalog(write_catalog(tmp_path, AGENT))['x']['ref'] == AGENT
    with pytest.raises(ValueError, match=message):
        load_catalog(write_catalog(tmp_path, {**AGENT, **change}))


def test_models_list_marks_agents(service):
    _, _, client = service
    providers = {m['id']: m['provider'] for m in client.get('/models').json()['models']}
    assert providers == {'a': 'openrouter', 'nycc': 'agent'}


def test_agents_need_lab_compute(service):
    _, _, client = service
    own = submit(client, payload(models=['a', 'nycc'], funding='own_keys',
                                 openrouter_key='or-key', runpod_key='rp-key'), key='own')
    assert own.status_code == 422 and 'LAISR Lab compute' in own.json()['detail']


def test_agent_job_runs_on_cpu_with_inspect_reference_and_pod_env(service, monkeypatch):
    cfg, db, client = service
    response = submit(client, payload(models=['a', 'nycc']), key='ok')
    assert response.status_code == 202
    job = db.get(response.json()['id'])
    assert job['config']['model_refs']['nycc'] == AGENT
    # API models and agents need no GPU.
    assert job['config']['compute_type'] == 'cpu'
    spec = build_spec(job['config'], '.')
    assert spec['models'] == {'a': 'org/model-a', 'nycc': 'inspect:openai-api/agent-nycc/nycc-agent'}

    monkeypatch.setenv('AGENT_NYCC_KEY', 'space-secret')
    monkeypatch.setenv('SUPABASE_SECRET_KEY', 'never-forwarded')
    sent = {}
    def handle(request):
        env = json.loads(request.content)['env']
        # CPU pods use the REST API (a mapping); GPU pods use GraphQL (key/value pairs).
        sent.update(env if isinstance(env, dict) else {v['key']: v['value'] for v in env})
        return httpx.Response(200, json={'id': 'pod'})
    pods = RunPod(cfg)
    with httpx.Client(transport=httpx.MockTransport(handle), base_url='https://rest.runpod.io/v1') as mock:
        pods.client.close(); pods.client = mock
        assert pods.create(job) == 'pod'
    assert sent['AGENT_NYCC_BASE_URL'] == AGENT['base_url']
    assert sent['AGENT_NYCC_API_KEY'] == 'space-secret'
    assert 'never-forwarded' not in sent.values()


def test_open_agent_gets_placeholder_key_and_publishes_as_agent(service, tmp_path):
    cfg, db, client = service
    response = submit(client, payload(models=['a', 'nycc']), key='pub')
    job = db.get(response.json()['id'])
    open_agent = {k: v for k, v in AGENT.items() if k != 'key_env'}
    job['config']['model_refs']['nycc'] = open_agent
    from app.agents import pod_env
    assert pod_env(job['config']['model_refs'])['AGENT_NYCC_API_KEY'] == 'none'
    files, _ = export_bundle(job, archive([('evaluations.jsonl', b'{}\n')]), SUMMARY, 10000)
    meta = json.loads(files['meta.json'])
    assert meta['models']['nycc'] == {'id': 'agent-nycc/nycc-agent', 'type': 'agent', 'endpoint': AGENT['base_url']}
