"""Server-owned account approval, policies, limits, and audit records."""
import time
from uuid import uuid4
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import Table, Column, String, Integer, BigInteger, JSON, select, update
from .advanced import AdvancedSpec
from .upstream import GENERATION_DEFAULTS

class Limits(BaseModel):
    model_config = ConfigDict(extra='forbid')
    max_models: int | None = Field(None, ge=2)
    max_scenarios: int | None = Field(None, ge=1)
    max_runtime_seconds: int | None = Field(None, ge=300)
    max_tokens: int | None = Field(None, ge=128)
    max_outstanding_jobs: int | None = Field(None, ge=1)
    max_disk_gb: int | None = Field(None, ge=50)
    max_gpu_count: int | None = Field(None, ge=1)
    max_cpu_count: int | None = Field(None, ge=2)
    max_workers: int | None = Field(None, ge=1)
    max_bootstraps: int | None = Field(None, ge=1)
    require_credits: bool = False
    allow_own_keys: bool = True
    allow_public_results: bool = True

class Policy(BaseModel):
    model_config = ConfigDict(extra='forbid')
    approval_required: bool = True
    submissions_enabled: bool = True
    dispatch_enabled: bool = True
    max_running_jobs: int | None = Field(None, ge=1)
    default_credits: int = Field(0, ge=0, le=1_000_000)
    limits: Limits = Field(default_factory=Limits)
    spec_defaults: AdvancedSpec = Field(default_factory=AdvancedSpec)

def policy_data(value):
    data=value.model_dump()
    data['spec_defaults']=value.spec_defaults.model_dump(exclude_unset=True,exclude_none=True)
    return data

class PolicyUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    version: int = Field(ge=1)
    policy: Policy

class MemberUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    version: int = Field(ge=1)
    status: Literal['pending','approved','suspended','rejected']
    limits: Limits | None = None

class CreditGrant(BaseModel):
    model_config = ConfigDict(extra='forbid')
    amount: int = Field(ge=1, le=1_000_000)
    reason: str = Field(min_length=3,max_length=200)
    request_id: str = Field(min_length=8,max_length=100)


def tables(metadata):
    return (
        Table('va_members', metadata, Column('user_id',String(36),primary_key=True),
            Column('email',String(320),nullable=False,default=''), Column('username',String(100),nullable=False,default=''),
            Column('role',String(16),nullable=False,default='member'), Column('status',String(16),nullable=False),
            Column('limits',JSON), Column('version',Integer,nullable=False,default=1), Column('created_at',BigInteger,nullable=False)),
        Table('va_policy',metadata,Column('id',Integer,primary_key=True),Column('version',Integer,nullable=False),Column('data',JSON,nullable=False)),
        Table('va_admin_audit',metadata,Column('id',String(36),primary_key=True),Column('actor',String(36),nullable=False),
            Column('action',String(40),nullable=False),Column('target',String(100),nullable=False),Column('data',JSON,nullable=False),
            Column('request_id',String(150),unique=True),Column('created_at',BigInteger,nullable=False)),
    )


def enforce(config, limits):
    """Check effective settings after defaults and advanced overrides are merged."""
    from .db import Forbidden
    checks = [(len(config['models']), 'max_models'),
        (len(config['scenarios']) or config.get('scenario_count',200), 'max_scenarios'),
        (config['max_runtime_seconds'],'max_runtime_seconds'),
        (config['disk_gb'] + config.get('volume_gb', 0),'max_disk_gb'),
        (config.get('gpu_count', 1) if config.get('compute_type', 'gpu') == 'gpu' else 0, 'max_gpu_count'),
        (config.get('cpu_count', 4) if config.get('compute_type') == 'cpu' else 0, 'max_cpu_count')]
    advanced = AdvancedSpec.model_validate(config.get('advanced_spec',{}))
    if advanced.dataset.count: checks.append((advanced.dataset.count,'max_scenarios'))
    generation = advanced.collection.generation.model_dump()
    fallback={name:values['max_tokens'] for name,values in GENERATION_DEFAULTS.items()}
    if config.get('response_tokens') is not None: fallback['response']=config['response_tokens']
    for name,phase in generation.items():
        checks.append((phase.get('max_tokens') or fallback[name],'max_tokens'))
        for decoding in phase['per_model'].values():
            if decoding.get('max_tokens'): checks.append((decoding['max_tokens'],'max_tokens'))
    checks.extend([(advanced.collection.inspect.max_connections,'max_workers'),
        (advanced.collection.inspect.max_samples or 1,'max_workers'),
        (advanced.collection.openrouter.max_workers,'max_workers'),
        (advanced.training.bootstrap.n_bootstraps,'max_bootstraps')])
    for value, name in checks:
        if value is not None and limits.get(name) is not None and value > limits[name]: raise Forbidden(f'{name}: this account allows at most {limits[name]}')
    if config['funding']=='own_keys' and not limits['allow_own_keys']: raise Forbidden('Personal provider keys are disabled for this account')
    if config['visibility']=='public' and not limits['allow_public_results']: raise Forbidden('Public results are disabled for this account')


class GovernanceStore:
    def policy(self):
        from .db import policy
        with self.engine.connect() as c:
            row=c.execute(select(policy).where(policy.c.id==1)).mappings().one()
            return {'version':row['version'],'policy':policy_data(Policy.model_validate(row['data']))}

    def ensure_member(self,user_id,email='',username='',bootstrap=False):
        from .db import members,accounts,policy,ledger
        # Most authenticated requests only need to read an existing member.
        # Avoid serializing all users behind the global policy row lock.
        with self.engine.connect() as c:
            existing=c.execute(select(members).where(members.c.user_id==user_id)).mappings().first()
            if existing and (not email or existing['email']==email) and (not username or existing['username']==username[:100]) and (not bootstrap or (existing['role']=='admin' and existing['status']=='approved')):
                return dict(existing)
        with self.engine.begin() as c:
            p=c.execute(select(policy).where(policy.c.id==1).with_for_update()).mappings().one()
            row=c.execute(select(members).where(members.c.user_id==user_id).with_for_update()).mappings().first()
            if not row:
                approved=bootstrap or not p['data'].get('approval_required',True)
                c.execute(members.insert().values(user_id=user_id,email=email,username=username,role='admin' if bootstrap else 'member',status='approved' if approved else 'pending',created_at=int(time.time())))
                account=c.execute(select(accounts).where(accounts.c.user_id==user_id)).first()
                if not account:
                    amount=p['data'].get('default_credits',0) if approved else 0
                    c.execute(accounts.insert().values(user_id=user_id,credits=amount,enabled=True))
                    if amount: c.execute(ledger.insert().values(id=str(uuid4()),user_id=user_id,delta=amount,reason='initial',created_at=int(time.time())))
            else:
                values={}
                if email: values['email']=email
                if username: values['username']=username[:100]
                if bootstrap and (row['role']!='admin' or row['status']!='approved'): values.update(role='admin',status='approved',version=row['version']+1)
                if values: c.execute(update(members).where(members.c.user_id==user_id).values(**values))
            if bootstrap: c.execute(update(accounts).where(accounts.c.user_id==user_id).values(enabled=True))
            return dict(c.execute(select(members).where(members.c.user_id==user_id)).mappings().one())

    def account_snapshot(self,user_id):
        from .db import members,accounts,policy
        with self.engine.connect() as c:
            row=c.execute(select(members,accounts.c.credits,accounts.c.enabled,policy.c.data.label('site_policy'))
                .outerjoin(accounts,accounts.c.user_id==members.c.user_id)
                .join(policy,policy.c.id==1).where(members.c.user_id==user_id)).mappings().one()
            result=dict(row)
        site=result.pop('site_policy')
        result['credits']=result['credits'] or 0
        result['enabled']=bool(result['enabled']) and result['status']=='approved'
        result['limits']=Limits.model_validate(result['limits'] or site['limits']).model_dump()
        result['submissions_enabled']=site['submissions_enabled']
        result['credit_unit']='execution seconds; not currency'
        return result

    def member(self,user_id):
        from .db import members
        with self.engine.connect() as c:
            row=c.execute(select(members).where(members.c.user_id==user_id)).mappings().first()
            return dict(row) if row else None

    def effective_limits(self,user_id):
        member=self.member(user_id)
        return Limits.model_validate((member or {}).get('limits') or self.policy()['policy']['limits']).model_dump()

    def admin_snapshot(self):
        from .db import members,accounts,audit
        with self.engine.connect() as c:
            people=[dict(r) for r in c.execute(select(members,accounts.c.credits,accounts.c.enabled).outerjoin(accounts,accounts.c.user_id==members.c.user_id).order_by(members.c.created_at.desc()).limit(1000)).mappings()]
            history=[dict(r) for r in c.execute(select(audit).order_by(audit.c.created_at.desc()).limit(100)).mappings()]
        return {**self.policy(),'members':people,'audit':history}

    def set_policy(self,actor,incoming):
        from .db import policy,audit,Conflict
        with self.engine.begin() as c:
            row=c.execute(select(policy).where(policy.c.id==1).with_for_update()).mappings().one()
            if row['version']!=incoming.version: raise Conflict('Settings changed. Refresh before saving.')
            data=policy_data(incoming.policy)
            c.execute(update(policy).where(policy.c.id==1).values(version=row['version']+1,data=data))
            c.execute(audit.insert().values(id=str(uuid4()),actor=actor,action='policy',target='site',data={'before':row['data'],'after':data},created_at=int(time.time())))
        return self.policy()

    def set_member(self,actor,user_id,incoming):
        from .db import members,accounts,audit,Conflict,Forbidden
        with self.engine.begin() as c:
            row=c.execute(select(members).where(members.c.user_id==user_id).with_for_update()).mappings().first()
            if not row: raise Forbidden('Account not found')
            if row['role']=='admin' and incoming.status!='approved': raise Forbidden('Administrators cannot be suspended through this page')
            if row['version']!=incoming.version: raise Conflict('Account changed. Refresh before saving.')
            values={'status':incoming.status,'limits':incoming.limits.model_dump() if incoming.limits else None,'version':row['version']+1}
            c.execute(update(members).where(members.c.user_id==user_id).values(**values))
            c.execute(update(accounts).where(accounts.c.user_id==user_id).values(enabled=incoming.status=='approved'))
            c.execute(audit.insert().values(id=str(uuid4()),actor=actor,action='member',target=user_id,data={'before':dict(row),'after':values},created_at=int(time.time())))
        return self.member(user_id)

    def admin_grant(self,actor,user_id,request):
        from .db import members,accounts,ledger,audit,Forbidden,Conflict
        request_id=actor+':'+request.request_id
        with self.engine.begin() as c:
            member=c.execute(select(members).where(members.c.user_id==user_id).with_for_update()).first()
            if not member: raise Forbidden('Account not found')
            row=c.execute(select(accounts).where(accounts.c.user_id==user_id).with_for_update()).mappings().one()
            prior=c.execute(select(audit).where(audit.c.request_id==request_id)).mappings().first()
            data={'amount':request.amount,'reason':request.reason}
            if prior:
                if prior['target']!=user_id or prior['data']!=data: raise Conflict('Credit request ID already used')
                return
            if row['credits']+request.amount>2_000_000_000: raise Forbidden('Credit balance exceeds the supported ceiling')
            c.execute(update(accounts).where(accounts.c.user_id==user_id).values(credits=row['credits']+request.amount))
            c.execute(ledger.insert().values(id=str(uuid4()),user_id=user_id,delta=request.amount,reason='admin_grant',created_at=int(time.time())))
            c.execute(audit.insert().values(id=str(uuid4()),actor=actor,action='credits',target=user_id,data=data,request_id=request_id,created_at=int(time.time())))

    def record_admin(self,actor,action,target,data):
        from .db import audit
        with self.engine.begin() as c:
            c.execute(audit.insert().values(id=str(uuid4()),actor=actor,action=action,target=target,data=data,created_at=int(time.time())))

    def claim_job(self,job_id,now):
        from .db import policy,members,jobs
        with self.engine.begin() as c:
            p=c.execute(select(policy).where(policy.c.id==1).with_for_update()).mappings().one()['data']
            job=c.execute(select(jobs).where(jobs.c.id==job_id)).mappings().one()
            m=c.execute(select(members).where(members.c.user_id==job['user_id']).with_for_update()).mappings().first()
            if not p['dispatch_enabled'] or not m or m['status']!='approved': return False
            return c.execute(update(jobs).where(jobs.c.id==job_id,jobs.c.state=='queued').values(state='provisioning',stage='starting',started_at=now)).rowcount>0
