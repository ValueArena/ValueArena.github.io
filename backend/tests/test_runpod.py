import json
from uuid import uuid4
import httpx
from app.config import Settings
from app.runpod import RunPod


def test_gpu_allocation_requires_cuda13_and_keeps_publication_key_off_worker():
    cfg=Settings(environment='test',worker_secret='x'*40,hf_publish_token='publisher-secret')
    pods=RunPod(cfg)
    def handle(request):
        assert request.url == 'https://api.runpod.io/graphql'
        payload=json.loads(request.content)['variables']['input']
        assert payload['minCudaVersion']=='13.0'
        assert 'allowedCudaVersions' not in payload
        assert payload['gpuTypeId']=='NVIDIA A40'
        assert 'publisher-secret' not in request.content.decode()
        return httpx.Response(200,json={'data':{'podFindAndDeployOnDemand':{'id':'mock-pod'}}})
    with httpx.Client(transport=httpx.MockTransport(handle),base_url='https://rest.runpod.io/v1') as client:
        pods.client.close();pods.client=client
        assert pods.create({'id':str(uuid4()),'config':{}})=='mock-pod'


def test_stock_check_preserves_unknown_and_filters_cuda_disk(monkeypatch):
    from app.runpod import gpu_availability
    def post(url, json, timeout):
        assert json['variables']['input'] == {'gpuCount': 1, 'secureCloud': True, 'minCudaVersion': '13.0', 'minDisk': 200}
        return httpx.Response(200, request=httpx.Request('POST',url), json={'data':{'gpuTypes':[
            {'id':'A40','lowestPrice':{'stockStatus':'Low','uninterruptablePrice':0.49}},
            {'id':'A100','lowestPrice':None},
            {'id':'H100','lowestPrice':{'stockStatus':'None','uninterruptablePrice':None}}
        ]}})
    monkeypatch.setattr('app.runpod.httpx.post',post)
    result=gpu_availability(200)
    assert [g['stock'] for g in result['gpus']] == ['Low','Unknown','None']
    assert result['disk_gb']==200


def test_graphql_errors_never_echo_credentials_or_confirm_allocation():
    import pytest
    pods=RunPod(Settings(environment='test',worker_secret='x'*40))
    with httpx.Client(transport=httpx.MockTransport(lambda r:httpx.Response(200,json={
        'errors':[{'message':'secret echoed by provider'}], 'data':None}))) as client:
        pods.client.close();pods.client=client
        with pytest.raises(RuntimeError,match='did not confirm') as exc:
            pods.create({'id':str(uuid4()),'config':{}})
        assert 'secret' not in str(exc.value)
