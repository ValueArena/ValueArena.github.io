import math
import time
from contextlib import contextmanager
from uuid import uuid4

from sqlalchemy import (BigInteger, Boolean, Column, Integer, JSON, MetaData, String,
                        Table, Text, UniqueConstraint, create_engine, event, select, update)

from .governance import GovernanceStore, Policy, tables, enforce, policy_data

metadata = MetaData()
members, policy, audit = tables(metadata)
accounts = Table('va_accounts', metadata,
    Column('user_id', String(36), primary_key=True),
    Column('credits', Integer, nullable=False, default=0),
    Column('enabled', Boolean, nullable=False, default=True))
jobs = Table('va_jobs', metadata,
    Column('id', String(36), primary_key=True), Column('user_id', String(36), nullable=False, index=True),
    Column('idempotency_key', String(128), nullable=False), Column('request_hash', String(64), nullable=False),
    Column('config', JSON, nullable=False), Column('state', String(24), nullable=False),
    Column('stage', String(24), nullable=False, default='queued'),
    Column('created_at', BigInteger, nullable=False), Column('started_at', BigInteger),
    Column('heartbeat_at', BigInteger), Column('finished_at', BigInteger),
    Column('pod_id', String(128)), Column('artifact', Text), Column('error_code', String(64)),
    Column('reserved_credits', Integer, nullable=False), Column('charged_credits', Integer),
    Column('cleanup_done', Boolean, nullable=False, default=False),
    UniqueConstraint('user_id', 'idempotency_key'))
ledger = Table('va_credit_ledger', metadata,
    Column('id', String(36), primary_key=True), Column('user_id', String(36), nullable=False),
    Column('job_id', String(36)), Column('delta', Integer, nullable=False),
    Column('reason', String(32), nullable=False), Column('created_at', BigInteger, nullable=False))
presentation = Table('va_presentation', metadata,
    Column('job_id', String(36), primary_key=True),
    Column('name', String(40), primary_key=True),
    Column('data', JSON, nullable=False))
credentials = Table('va_job_credentials', metadata,
    Column('job_id', String(36), primary_key=True),
    Column('encrypted', Text, nullable=False))
ACTIVE = ('provisioning', 'running')
TERMINAL = ('succeeded', 'failed', 'cancelled')


class Conflict(Exception): pass
class Forbidden(Exception): pass


from .governance import Limits

class Store(GovernanceStore):
    def __init__(self, url):
        self.engine = create_engine(url, pool_pre_ping=True)
        if self.engine.dialect.name == 'sqlite':
            @event.listens_for(self.engine, 'connect')
            def sqlite_connect(dbapi, _):
                dbapi.isolation_level = None
            @event.listens_for(self.engine, 'begin')
            def sqlite_begin(conn):
                conn.exec_driver_sql('BEGIN IMMEDIATE')

    def initialize(self):
        metadata.create_all(self.engine)
        with self.engine.begin() as c:
            if self.engine.dialect.name == 'postgresql':
                from sqlalchemy.dialects.postgresql import insert
            else:
                from sqlalchemy.dialects.sqlite import insert
            c.execute(insert(policy).values(id=1,version=1,data=policy_data(Policy())).on_conflict_do_nothing(index_elements=['id']))
        if self.engine.dialect.name == 'postgresql':
            with self.engine.begin() as c:
                for table in (accounts, jobs, ledger, presentation, credentials, members, policy, audit):
                    c.exec_driver_sql(f'ALTER TABLE {table.name} ENABLE ROW LEVEL SECURITY')
                    c.exec_driver_sql(f'REVOKE ALL ON {table.name} FROM PUBLIC, anon, authenticated')

    @contextmanager
    def scheduler_lock(self, lock_id=82819401):
        # Requires a direct/session-mode Postgres connection, not transaction pooling.
        with self.engine.connect() as c:
            postgres = self.engine.dialect.name == 'postgresql'
            locked = not postgres or c.exec_driver_sql(f'SELECT pg_try_advisory_lock({int(lock_id)})').scalar()
            try:
                yield locked
            finally:
                if postgres and locked:
                    c.exec_driver_sql(f'SELECT pg_advisory_unlock({int(lock_id)})')

    def grant(self, user_id, amount):
        if amount <= 0: raise ValueError('Credits must be positive')
        with self.engine.begin() as c:
            row = c.execute(select(accounts).where(accounts.c.user_id == user_id).with_for_update()).mappings().first()
            if row:
                c.execute(update(accounts).where(accounts.c.user_id == user_id).values(credits=row['credits'] + amount))
            else:
                c.execute(accounts.insert().values(user_id=user_id, credits=amount))
            c.execute(ledger.insert().values(id=str(uuid4()), user_id=user_id, delta=amount, reason='grant', created_at=int(time.time())))

        # The trusted CLI grant command enables a new account; web grants use admin_grant.
        if not self.member(user_id):
            self.ensure_member(user_id)
            with self.engine.begin() as c:
                c.execute(update(members).where(members.c.user_id==user_id).values(status='approved'))

    def balance(self, user_id):
        with self.engine.connect() as c:
            row = c.execute(select(accounts).where(accounts.c.user_id == user_id)).mappings().first()
            return dict(row) if row else {'credits': 0, 'enabled': False}

    def submit(self, user_id, key, digest, config, encrypted_credentials=None):
        with self.engine.begin() as c:
            p=c.execute(select(policy).where(policy.c.id==1).with_for_update()).mappings().one()['data']
            member=c.execute(select(members).where(members.c.user_id==user_id).with_for_update()).mappings().first()
            if not member or member['status']!='approved': raise Forbidden('Account approval is required before running evaluations')
            if not p['submissions_enabled']: raise Forbidden('New evaluations are temporarily paused')
            limits=Limits.model_validate(member['limits'] or p['limits']).model_dump()
            enforce(config,limits)
            account = c.execute(select(accounts).where(accounts.c.user_id == user_id).with_for_update()).mappings().first()
            own_keys = config.get('funding') == 'own_keys'
            if not account or not account['enabled']: raise Forbidden('Account is not enabled for evaluations')
            prior = c.execute(select(jobs).where(jobs.c.user_id == user_id, jobs.c.idempotency_key == key)).mappings().first()
            if prior:
                if prior['request_hash'] != digest: raise Conflict('Idempotency key already used for another request')
                return dict(prior)
            outstanding = c.execute(select(jobs.c.id).where(jobs.c.user_id == user_id, jobs.c.state.in_(('queued', *ACTIVE)))).all()
            if limits['max_outstanding_jobs'] is not None and len(outstanding) >= limits['max_outstanding_jobs']: raise Conflict('Outstanding evaluation limit reached')
            config = dict(config)
            runtime = config.get('max_runtime_seconds')
            cap = limits['max_runtime_seconds']
            if cap is not None: runtime = min(runtime,cap) if runtime is not None else cap
            reserve = 0
            if not own_keys and limits['require_credits']:
                if account['credits'] < 300: raise Forbidden('At least five minutes of execution credits are required')
                runtime = runtime if runtime is not None else account['credits']
                reserve = runtime
            config['max_runtime_seconds'] = runtime
            if account['credits'] < reserve: raise Forbidden('Insufficient execution credits')
            job_id = str(uuid4()); now = int(time.time())
            c.execute(update(accounts).where(accounts.c.user_id == user_id).values(credits=account['credits'] - reserve))
            c.execute(jobs.insert().values(id=job_id, user_id=user_id, idempotency_key=key, request_hash=digest,
                config=config, state='queued', created_at=now, reserved_credits=reserve))
            if encrypted_credentials:
                c.execute(credentials.insert().values(job_id=job_id, encrypted=encrypted_credentials))
            c.execute(ledger.insert().values(id=str(uuid4()), user_id=user_id, job_id=job_id, delta=-reserve, reason='reserve', created_at=now))
            return dict(c.execute(select(jobs).where(jobs.c.id == job_id)).mappings().one())

    def get(self, job_id):
        with self.engine.connect() as c:
            row = c.execute(select(jobs).where(jobs.c.id == job_id)).mappings().first()
            return dict(row) if row else None

    def list(self, user_id=None):
        query = select(jobs).order_by(jobs.c.created_at.desc())
        if user_id is not None: query = query.where(jobs.c.user_id == user_id).limit(100)
        with self.engine.connect() as c:
            return [dict(row) for row in c.execute(query).mappings()]

    def patch(self, job_id, allowed_states, **values):
        with self.engine.begin() as c:
            return c.execute(update(jobs).where(jobs.c.id == job_id, jobs.c.state.in_(allowed_states)).values(**values)).rowcount > 0

    def finish(self, job_id, state, error_code=None):
        if state not in TERMINAL: raise ValueError('Invalid terminal state')
        return self.patch(job_id, ('queued', *ACTIVE), state=state, finished_at=int(time.time()), error_code=error_code)

    def settle(self, job_id):
        # Only after pod deletion is confirmed. Lock account before job (same order as submit).
        initial = self.get(job_id)
        if not initial: return
        with self.engine.begin() as c:
            account = c.execute(select(accounts).where(accounts.c.user_id == initial['user_id']).with_for_update()).mappings().one()
            job = c.execute(select(jobs).where(jobs.c.id == job_id).with_for_update()).mappings().one()
            if job['state'] not in TERMINAL or job['charged_credits'] is not None: return
            used = 0 if job['started_at'] is None else min(job['reserved_credits'], max(0, math.ceil(time.time()-job['started_at'])))
            refund = job['reserved_credits'] - used
            c.execute(update(accounts).where(accounts.c.user_id == job['user_id']).values(credits=account['credits']+refund))
            c.execute(update(jobs).where(jobs.c.id == job_id).values(charged_credits=used, cleanup_done=True))
            c.execute(ledger.insert().values(id=str(uuid4()), user_id=job['user_id'], job_id=job_id, delta=refund, reason='release', created_at=int(time.time())))

    def put_presentation(self, job_id, name, data):
        with self.engine.begin() as c:
            # Lock the job to serialize retries and publication updates.
            c.execute(select(jobs.c.id).where(jobs.c.id == job_id).with_for_update()).first()
            c.execute(presentation.delete().where(presentation.c.job_id == job_id, presentation.c.name == name))
            c.execute(presentation.insert().values(job_id=job_id, name=name, data=data))

    def get_presentation(self, job_id, name):
        with self.engine.connect() as c:
            return c.execute(select(presentation.c.data).where(presentation.c.job_id == job_id, presentation.c.name == name)).scalar()

    def get_presentations(self, job_ids):
        if not job_ids:
            return {}
        with self.engine.connect() as c:
            rows = c.execute(select(presentation).where(
                presentation.c.job_id.in_(job_ids),
                presentation.c.name.in_(('allocation', 'publication', 'summary')))).mappings()
            result = {}
            for row in rows:
                result.setdefault(row['job_id'], {})[row['name']] = row['data']
            return result

    def visibility(self, job_id, value):
        with self.engine.begin() as c:
            row = c.execute(select(jobs).where(jobs.c.id == job_id).with_for_update()).mappings().one()
            config = dict(row['config']); config['visibility'] = value
            c.execute(update(jobs).where(jobs.c.id == job_id).values(config=config))

    def job_credentials(self, job_id):
        with self.engine.connect() as c:
            return c.execute(select(credentials.c.encrypted).where(credentials.c.job_id == job_id)).scalar()

    def forget_credentials(self, job_id):
        with self.engine.begin() as c:
            c.execute(credentials.delete().where(credentials.c.job_id == job_id))

    def public_jobs(self):
        with self.engine.connect() as c:
            query = select(jobs).where(jobs.c.state == 'succeeded',
                jobs.c.config['visibility'].as_string() == 'public').order_by(jobs.c.created_at.desc()).limit(100)
            return [dict(row) for row in c.execute(query).mappings()]
