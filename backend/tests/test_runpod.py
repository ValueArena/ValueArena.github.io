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


def test_stock_check_reports_missing_offers_and_filters_cuda_disk(monkeypatch):
    from app.runpod import gpu_availability
    def post(url, json, timeout):
        assert json['variables']['input'] == {'gpuCount': 1, 'secureCloud': True, 'minCudaVersion': '13.0', 'minDisk': 200}
        return httpx.Response(200, request=httpx.Request('POST',url), json={'data':{'gpuTypes':[
            {'id':'A40','lowestPrice':{'stockStatus':'Low','uninterruptablePrice':0.49}},
            {'id':'A100','lowestPrice':None},
            {'id':'H100','lowestPrice':{'stockStatus':'None','uninterruptablePrice':None}},
            {'id':'unknown','lowestPrice':{'stockStatus':'unexpected','uninterruptablePrice':None}}
        ]}})
    monkeypatch.setattr('app.runpod.httpx.post',post)
    result=gpu_availability(200)
    assert [g['stock'] for g in result['gpus']] == ['Low','None','None','Unknown']
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


def test_only_definitive_capacity_errors_are_retryable():
    import pytest
    from app.runpod import GPUUnavailable
    pods=RunPod(Settings(environment='test',worker_secret='x'*40))
    for message, expected in [('There are no available GPUs', GPUUnavailable), ('Unknown internal error', RuntimeError)]:
        with httpx.Client(transport=httpx.MockTransport(lambda r:httpx.Response(200,json={
            'errors':[{'message':message}], 'data':None}))) as client:
            pods.client.close(); pods.client=client
            with pytest.raises(expected) as exc:
                pods.create({'id':str(uuid4()),'config':{}})
            assert type(exc.value) is expected


def test_cpu_allocation_and_storage_payload():
    pods=RunPod(Settings(environment='test',worker_secret='x'*40))
    def handle(request):
        assert request.url.path == '/v1/pods'
        body=json.loads(request.content)
        assert body['computeType']=='CPU' and body['vcpuCount']==8
        assert body['cpuFlavorIds']==['cpu3g']
        assert body['volumeInGb']==120 and body['containerDiskInGb']==60
        assert 'gpuCount' not in body and 'allowedCudaVersions' not in body
        return httpx.Response(200,json={'id':'cpu-pod'})
    with httpx.Client(transport=httpx.MockTransport(handle),base_url='https://rest.runpod.io/v1') as client:
        pods.client.close(); pods.client=client
        assert pods.create({'id':str(uuid4()),'config':{'compute_type':'cpu','cpu_count':8,'volume_gb':120,'disk_gb':60}})=='cpu-pod'


def test_multiple_gpus_reach_provider_and_engine_env():
    pods=RunPod(Settings(environment='test',worker_secret='x'*40))
    def handle(request):
        body=json.loads(request.content)['variables']['input']
        assert body['gpuCount']==4 and body['volumeInGb']==200
        env={v['key']:v['value'] for v in body['env']}
        assert env['EIGENBENCH_TENSOR_PARALLEL_SIZE']=='4'
        return httpx.Response(200,json={'data':{'podFindAndDeployOnDemand':{'id':'multi-pod'}}})
    with httpx.Client(transport=httpx.MockTransport(handle)) as client:
        pods.client.close(); pods.client=client
        assert pods.create({'id':str(uuid4()),'config':{'gpu_count':4,'volume_gb':200}})=='multi-pod'


def test_every_selectable_gpu_is_forwarded_without_substitution():
    from typing import get_args
    from app.models import EvaluationRequest
    for gpu in get_args(EvaluationRequest.model_fields['gpu_type'].annotation):
        pods=RunPod(Settings(environment='test',worker_secret='x'*40))
        def handle(request):
            payload=json.loads(request.content)['variables']['input']
            assert payload['gpuTypeId']==gpu
            assert payload['gpuCount']==1
            return httpx.Response(200,json={'data':{'podFindAndDeployOnDemand':{'id':'test-pod'}}})
        with httpx.Client(transport=httpx.MockTransport(handle)) as client:
            pods.client.close();pods.client=client
            assert pods.create({'id':str(uuid4()),'config':{'gpu_type':gpu,'gpu_count':1}})=='test-pod'
