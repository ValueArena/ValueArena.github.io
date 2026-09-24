import json
from uuid import uuid4
import httpx
from app.config import Settings
from app.runpod import RunPod


def test_gpu_allocation_requires_cuda13_and_keeps_publication_key_off_worker():
    cfg=Settings(environment='test',worker_secret='x'*40,hf_publish_token='publisher-secret')
    pods=RunPod(cfg)
    def handle(request):
        payload=json.loads(request.content)
        assert payload['allowedCudaVersions']==['13.0']
        assert payload['gpuTypeIds']==['NVIDIA A40']
        assert 'publisher-secret' not in request.content.decode()
        return httpx.Response(200,json={'id':'mock-pod'})
    with httpx.Client(transport=httpx.MockTransport(handle),base_url='https://rest.runpod.io/v1') as client:
        pods.client.close();pods.client=client
        assert pods.create({'id':str(uuid4()),'config':{}})=='mock-pod'
