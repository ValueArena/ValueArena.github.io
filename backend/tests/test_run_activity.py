import asyncio
import json
import httpx
import pytest
from app.run_activity import collect_activity, system_logs
from app.auth import worker_token
from app.scheduler import tick
from test_backend import service,submit,USER,OTHER,Pods
from test_governance import setup_admin


def test_admin_can_read_other_users_logs_but_members_cannot(service):
    cfg,db,api,headers=setup_admin(service)
    job=submit(api,user=OTHER).json();job_id=job['id']
    db.put_presentation(job_id,'log','private worker output')
    db.put_presentation(job_id,'provider_activity',{'events':[{'text':'Extracting image','time':'now'}],'available':True})
    result=api.get(f'/admin/evaluations/{job_id}/logs',headers=headers)
    assert result.status_code==200 and result.json()['text']=='private worker output'
    assert result.json()['provider']['events'][0]['text']=='Extracting image'
    assert api.get(f'/admin/evaluations/{job_id}/logs',headers={'Authorization':'Bearer '+OTHER}).status_code==403
    assert api.get(f'/admin/evaluations/{job_id}/logs').status_code==401
    assert api.get(f'/evaluations/{job_id}/logs',headers=headers).status_code==404
    assert 'private worker output' not in api.get('/experiments').text


def test_provider_logs_redacted_and_retained_on_failure(service,monkeypatch):
    cfg,db,api=service;cfg.runpod_api_key='secret-runpod';cfg.openrouter_api_key='secret-router'
    job_id=submit(api).json()['id'];tick(db,Pods(),cfg)
    async def success(*args):return [{'text':'secret-runpod secret-router Bearer abc '+worker_token(cfg.worker_secret,job_id),'time':'now'}]
    monkeypatch.setattr('app.run_activity.system_logs',success)
    asyncio.run(collect_activity(db,cfg))
    result=db.get_presentation(job_id,'provider_activity')
    assert result['available']
    assert 'secret-' not in json.dumps(result) and 'abc' not in json.dumps(result)
    async def failure(*args):raise RuntimeError('sensitive error')
    monkeypatch.setattr('app.run_activity.system_logs',failure)
    asyncio.run(collect_activity(db,cfg))
    result=db.get_presentation(job_id,'provider_activity')
    assert not result['available'] and result['events']
    assert 'sensitive' not in json.dumps(result)


def test_sse_system_log_snapshot(monkeypatch):
    real_client=httpx.AsyncClient
    def handle(request):
        assert request.url.host=='api.runpod.io'
        assert request.url.params['source']=='system'
        frames=[{'source':'system','line':'Download completed, extracting...','ts':'2026-09-24'},
                {'source':'container','line':'not requested','ts':'now'}]
        return httpx.Response(200,content=''.join('data: '+json.dumps(f)+'\n\n' for f in frames))
    monkeypatch.setattr('app.run_activity.httpx.AsyncClient',lambda **kwargs:real_client(transport=httpx.MockTransport(handle),**kwargs))
    assert asyncio.run(system_logs('pod','token'))==[{'text':'Download completed, extracting...','time':'2026-09-24'}]


@pytest.mark.parametrize('status,state',[(500,'provisioning'),(400,'failed')])
def test_uncertain_create_does_not_retry_and_rejected_create_fails(service,status,state):
    cfg,db,api=service
    job_id=submit(api).json()['id']
    class FailedPods(Pods):
        calls=0
        def create(self,job):
            self.calls+=1
            response=httpx.Response(status,request=httpx.Request('POST','https://rest.runpod.io/v1/pods'))
            raise httpx.HTTPStatusError('secret provider error',request=response.request,response=response)
    pods=FailedPods();tick(db,pods,cfg)
    assert db.get(job_id)['error_code']==f'provider_create_http_{status}'
    assert db.get(job_id)['state']==state
    tick(db,pods,cfg)
    assert pods.calls==1
