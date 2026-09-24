import json
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from app.api import create_app
from app.governance import MemberUpdate, PolicyUpdate
from app.scheduler import tick
from test_backend import service, payload, submit, USER, OTHER, Auth, Pods


def setup_admin(service):
    cfg,db,_=service
    cfg=cfg.model_copy(update={'admin_user_ids':USER})
    api=TestClient(create_app(cfg,db,Auth()))
    headers={'Authorization':'Bearer '+USER}
    assert api.get('/account',headers=headers).json()['role']=='admin'
    return cfg,db,api,headers


def test_admin_endpoints_reject_members_and_metadata(service):
    cfg,db,api,headers=setup_admin(service)
    assert api.get('/admin').status_code==401
    member={'Authorization':'Bearer '+OTHER}
    assert api.get('/admin',headers=member).status_code==403
    assert api.put('/admin/policy',headers=member,json={}).status_code==403
    assert api.get('/account',headers=member).json()['role']=='member'
    assert api.get('/admin',headers=headers).status_code==200


def test_new_account_requires_approval_even_with_own_keys(service,monkeypatch):
    cfg,db,api,headers=setup_admin(service)
    from app.db import members,accounts
    with db.engine.begin() as c:
        c.execute(members.delete().where(members.c.user_id==OTHER));c.execute(accounts.delete().where(accounts.c.user_id==OTHER))
    h={'Authorization':'Bearer '+OTHER}
    assert api.get('/account',headers=h).json()['status']=='pending'
    monkeypatch.setattr('app.api.verify_provider_keys',lambda keys:pytest.fail('Pending accounts must be rejected before provider calls'))
    assert submit(api,payload(funding='own_keys',openrouter_key='a',runpod_key='b'),user=OTHER).status_code==403
    row=db.member(OTHER)
    response=api.put('/admin/members/'+OTHER,headers=headers,json={'version':row['version'],'status':'approved','limits':None})
    assert response.status_code==200
    monkeypatch.setattr('app.api.verify_provider_keys',lambda keys:None)
    assert submit(api,payload(funding='own_keys',openrouter_key='a',runpod_key='b'),user=OTHER).status_code==202


def test_auto_approval_toggle_does_not_unsuspend_existing_accounts(service):
    cfg,db,api,headers=setup_admin(service)
    snapshot=api.get('/admin',headers=headers).json()
    snapshot['policy']['approval_required']=False
    snapshot['policy']['default_credits']=600
    assert api.put('/admin/policy',headers=headers,json={'version':snapshot['version'],'policy':snapshot['policy']}).status_code==200
    fresh=str(uuid4());db.ensure_member(fresh)
    assert db.member(fresh)['status']=='approved' and db.balance(fresh)['credits']==600
    db.ensure_member(fresh);assert db.balance(fresh)['credits']==600
    db.set_member(USER,OTHER,MemberUpdate(version=db.member(OTHER)['version'],status='suspended'))
    db.ensure_member(OTHER);assert db.member(OTHER)['status']=='suspended'
    assert submit(api,user=OTHER).status_code==403


def test_credit_grants_retry_and_audit(service):
    _,db,api,h=setup_admin(service)
    body={'amount':600,'reason':'Pilot allocation','request_id':'test-credit-retry'}
    before=db.balance(OTHER)['credits']
    for _ in range(2): assert api.post('/admin/members/'+OTHER+'/credits',headers=h,json=body).status_code==200
    assert db.balance(OTHER)['credits']==before+600
    assert api.post('/admin/members/'+OTHER+'/credits',headers=h,json={**body,'amount':700}).status_code==409
    assert api.post('/admin/members/'+OTHER+'/credits',headers=h,json={**body,'amount':-1}).status_code==422
    assert len([a for a in db.admin_snapshot()['audit'] if a['action']=='credits'])==1


def test_limits_enforced_after_spec_merge_and_user_override(service):
    _,db,api,h=setup_admin(service)
    snapshot=db.policy();snapshot['policy']['limits']['max_scenarios']=1
    snapshot['policy']['limits']['max_tokens']=2048
    assert api.put('/admin/policy',headers=h,json=snapshot).status_code==200
    assert submit(api,payload(scenarios=['one','two'])).status_code==403
    advanced={'collection':{'generation':{'reflection':{'per_model':{'a':{'max_tokens':4096}}}}}}
    assert submit(api,payload(advanced_spec=advanced)).status_code==403
    limits={**snapshot['policy']['limits'],'max_scenarios':20,'max_tokens':8192}
    assert api.put('/admin/members/'+USER,headers=h,json={'version':db.member(USER)['version'],'status':'approved','limits':limits}).status_code==200
    assert submit(api,payload(scenarios=['one','two'],advanced_spec=advanced)).status_code==202


def test_spec_defaults_preview_and_runtime_match(service):
    _,db,api,h=setup_admin(service)
    p=db.policy();p['policy']['spec_defaults']={'collection':{'generation':{'reflection':{'max_tokens':3000}}}}
    assert api.put('/admin/policy',headers=h,json=p).status_code==200
    body=payload()
    preview=api.post('/spec-preview',headers=h,json=body).json()['spec']
    job=submit(api,body).json()
    from app.spec import build_spec
    spec=build_spec(db.get(job['id'])['config'],'.')
    assert spec==preview
    assert spec['collection']['generation']['reflection']['max_tokens']==3000


def test_stale_admin_edit_and_self_suspension_rejected(service):
    _,db,api,h=setup_admin(service)
    p=db.policy()
    assert api.put('/admin/policy',headers=h,json=p).status_code==200
    assert api.put('/admin/policy',headers=h,json=p).status_code==409
    assert api.put('/admin/members/'+USER,headers=h,json={'version':db.member(USER)['version'],'status':'suspended'}).status_code==403


def test_pause_dispatch_suspension_and_cancel_refund(service):
    cfg,db,api,h=setup_admin(service)
    job=submit(api,user=OTHER).json();before=db.balance(OTHER)['credits']
    p=db.policy();p['policy']['dispatch_enabled']=False;db.set_policy(USER,PolicyUpdate(**p))
    pods=Pods();tick(db,pods,cfg)
    assert db.get(job['id'])['state']=='queued'
    row=db.member(OTHER);db.set_member(USER,OTHER,MemberUpdate(version=row['version'],status='suspended'))
    p=db.policy();p['policy']['dispatch_enabled']=True;db.set_policy(USER,PolicyUpdate(**p));tick(db,pods,cfg)
    assert db.get(job['id'])['state']=='cancelled'
    assert db.balance(OTHER)['credits']==before+600
    own=submit(api).json()
    assert api.post('/admin/evaluations/'+own['id']+'/cancel',headers=h).status_code==200
    assert db.get(own['id'])['charged_credits']==0


def test_submission_pause_blocks_requests(service):
    _,db,api,h=setup_admin(service)
    p=db.policy();p['policy']['submissions_enabled']=False;db.set_policy(USER,PolicyUpdate(**p))
    assert submit(api).status_code==403


def test_email_and_metadata_cannot_elevate_role(service):
    cfg,db,_,_=setup_admin(service)
    class SpoofedIdentity:
        def identity(self,token):
            return {'id':OTHER,'email':'invi.bhagyesh@gmail.com','username':'admin','role':'admin'}
    api=TestClient(create_app(cfg,db,SpoofedIdentity()))
    assert api.get('/admin',headers={'Authorization':'Bearer fake'}).status_code==403


def test_claim_rechecks_dispatch_policy(service):
    cfg,db,api,h=setup_admin(service)
    job=submit(api).json()
    p=db.policy();p['policy']['dispatch_enabled']=False;db.set_policy(USER,PolicyUpdate(**p))
    assert not db.claim_job(job['id'],12345)
    assert db.get(job['id'])['state']=='queued'


def test_implicit_phase_budgets_cannot_bypass_token_limit(service):
    _,db,api,h=setup_admin(service)
    p=db.policy();p['policy']['limits']['max_tokens']=1024
    db.set_policy(USER,PolicyUpdate(**p))
    assert submit(api,payload(response_tokens=128)).status_code==403
    body=payload(response_tokens=128,advanced_spec={'collection':{'generation':{'reflection':{'max_tokens':1024}}}})
    assert submit(api,body).status_code==202


def test_unlimited_defaults_and_worker_deadline(service):
    from app.governance import Policy, Limits
    cfg,db,api,h=setup_admin(service)
    p=db.policy(); p['policy']=Policy().model_dump()
    db.set_policy(USER,PolicyUpdate(**p))
    assert all(v is None for k,v in Limits().model_dump().items() if k.startswith('max_'))
    body=payload(); body.pop('max_runtime_seconds')
    result=submit(api,body)
    assert result.status_code==202, result.text
    job=db.get(result.json()['id'])
    assert job['config']['max_runtime_seconds'] is None
    assert job['reserved_credits']==0
    pods=Pods(); tick(db,pods,cfg,now=1000)
    from app.auth import worker_token
    response=api.get('/internal/jobs/'+job['id'],headers={'Authorization':'Bearer '+worker_token(cfg.worker_secret,job['id'])})
    assert response.status_code==200 and response.json()['deadline_at'] is None
    db.patch(job['id'],('provisioning',),heartbeat_at=99999)
    tick(db,pods,cfg,now=100000)
    assert db.get(job['id'])['state']=='provisioning'


def test_admin_runtime_cap_without_participant_duration(service):
    cfg,db,api,h=setup_admin(service)
    p=db.policy();p['policy']['limits'].update(require_credits=False,max_runtime_seconds=900)
    db.set_policy(USER,PolicyUpdate(**p))
    body=payload();body.pop('max_runtime_seconds')
    response=submit(api,body);assert response.status_code==202,response.text
    assert db.get(response.json()['id'])['config']['max_runtime_seconds']==900
    pods=Pods();tick(db,pods,cfg,now=1000);tick(db,pods,cfg,now=1900)
    assert db.get(response.json()['id'])['error_code']=='runtime_limit'


def test_optional_credit_budget_and_large_panel(service):
    from app.models import EvaluationRequest
    from app.governance import enforce, Limits
    models=[f'm{i}' for i in range(100)]
    config=EvaluationRequest(name='Large panel',models=models,criteria=['Humor'],scenarios=['A question']).model_dump()
    enforce(config,Limits().model_dump())
    _,db,api,h=setup_admin(service)
    body=payload();body.pop('max_runtime_seconds')
    result=submit(api,body);assert result.status_code==202,result.text
    job=db.get(result.json()['id'])
    assert job['config']['max_runtime_seconds']==10000
    assert job['reserved_credits']==10000
    assert db.balance(USER)['credits']==0


def test_existing_account_check_is_read_only_and_permissions_stay_fresh(service):
    from sqlalchemy import event
    _,db,api,h=setup_admin(service)
    statements=[]
    def capture(conn,cursor,statement,parameters,context,executemany):
        statements.append(statement)
    event.listen(db.engine,'before_cursor_execute',capture)
    try:
        result=api.get('/account',headers=h)
    finally:
        event.remove(db.engine,'before_cursor_execute',capture)
    assert result.status_code==200
    statements=[s for s in statements if not s.startswith('BEGIN')]
    assert len(statements)==2
    assert all(s.lstrip().upper().startswith('SELECT') for s in statements)
    db.set_member(USER,OTHER,MemberUpdate(version=db.member(OTHER)['version'],status='suspended'))
    result=api.get('/account',headers={'Authorization':'Bearer '+OTHER}).json()
    assert result['status']=='suspended'
    assert result['enabled'] is False


def test_a100_sxm_request_supported():
    from app.models import EvaluationRequest
    request=EvaluationRequest.model_validate(payload(gpu_type='NVIDIA A100-SXM4-80GB'))
    assert request.gpu_type=='NVIDIA A100-SXM4-80GB'
