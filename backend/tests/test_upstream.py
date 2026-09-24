import importlib.util
import os
from pathlib import Path
import pytest
from fastapi import HTTPException
from app.models import EvaluationRequest
from app.spec import build_spec, write_spec
from app.upstream import GENERATION_DEFAULTS, verify_source
from app.model_resolution import validate_native_adapters


def config(**kwargs):
    return EvaluationRequest(name='Contract test',models=['a','b'],criteria=['Humor'],scenarios=['A question'],**kwargs).model_dump(exclude_unset=True,exclude={'openrouter_key','runpod_key'}) | {'model_refs':{'a':'org/a','b':'org/b'}}


def test_hosted_defaults_do_not_override_upstream():
    assert 'generation' not in build_spec(config(),'.')['collection']
    spec=build_spec(config(response_tokens=8000),'.')
    assert spec['collection']['generation']=={'response':{'max_tokens':8000}}


def test_spec_runs_through_actual_pinned_upstream(tmp_path):
    root=os.environ.get('EIGENBENCH_SOURCE')
    if not root: pytest.skip('Pinned upstream checkout required')
    resolve=verify_source(root)
    path=write_spec(config(),tmp_path)
    module_spec=importlib.util.spec_from_file_location('upstream_run_spec',Path(root)/'pipeline/config/run_spec.py')
    module=importlib.util.module_from_spec(module_spec);module_spec.loader.exec_module(module)
    spec,_=module.load_run_spec(str(path))
    actual=resolve(spec['collection'])
    assert actual['response']['max_tokens']==4096
    assert actual['reflection']['max_tokens']==2048
    assert actual['direct_rating']['max_tokens']==512
    c=config(advanced_spec={'collection':{'generation':{'response':{'per_model':{'a':{'max_tokens':16000}}}}}})
    resolved=resolve(build_spec(c,tmp_path)['collection'])
    assert resolved['response']['per_model']['a']['max_tokens']==16000
    assert resolved['response']['max_tokens']==4096


@pytest.mark.parametrize('rank,pattern,accepted',[(64,{},True),(128,{},True),(512,{},True),(32,{'q_proj':512},True),(1024,{},False),(32,{'q_proj':1024},False)])
def test_native_adapter_rank_checked_before_provisioning(monkeypatch,rank,pattern,accepted):
    class Response:
        def raise_for_status(self): pass
        def json(self): return {'r':rank,'rank_pattern':pattern}
    monkeypatch.setattr('app.model_resolution.httpx.get',lambda *args,**kwargs:Response())
    refs={'adapter':{'provider':'hf_local','kind':'lora','repo_id':'org/adapter','revision':'a'*40}}
    if accepted: validate_native_adapters(refs)
    else:
        with pytest.raises(HTTPException) as exc: validate_native_adapters(refs)
        assert exc.value.status_code==422 and 'rank 1024' in exc.value.detail
