"""Durable public export to the existing HF dataset. Private artifacts stay private."""
import json
import logging
import re
import tarfile
import tempfile
import time
from datetime import datetime, timezone
from pathlib import PurePosixPath
from uuid import UUID

from .results import RatingRow
from .spec import build_spec

log = logging.getLogger(__name__)


def slug_for(job):
    return 'community/' + str(UUID(job['id']))


def encode(value):
    return (json.dumps(value,ensure_ascii=False,allow_nan=False,indent=2)+'\n').encode()


def export_bundle(job, archive, summary, max_bytes):
    """Read selected members only; never extract or execute uploaded archive contents."""
    files = {}; total = 0; seen = set()
    root = 'analysis/direct_rating/'
    mappings = {
        'evaluations.jsonl':'evaluations.jsonl',
        'runner.json':'data/runner.json',
        root+'analysis_config.json':'data/analysis_config.json',
        root+'raw_mean_scores.csv':'data/raw_mean_scores.csv',
        root+'normalization_intermediate.csv':'data/normalization_intermediate.csv',
        root+'trust_matrix.csv':'data/trust_matrix.csv',
        root+'observation_counts.csv':'data/observation_counts.csv',
        root+'bootstrap/samples.json':'data/bootstrap_samples.json',
        root+'bootstrap/bootstrap_elo.png':'images/bootstrap_elo.png',
        root+'eigenbench.png':'images/eigenbench.png',
        root+'trust_matrix.png':'images/trust_matrix.png',
    }
    with tarfile.open(fileobj=archive,mode='r|gz') as tar:
        for count,member in enumerate(tar):
            if count>10000: raise ValueError('Too many archive entries')
            path=PurePosixPath(member.name)
            if path.is_absolute() or '..' in path.parts: raise ValueError('Unsafe archive path')
            if member.name in seen: raise ValueError('Repeated archive entry')
            seen.add(member.name)
            # Cap decompressed input, including ignored members, against archive bombs.
            total += member.size
            if total>max_bytes or member.size<0: raise ValueError('Archive exceeds publication size limit')
            destination=mappings.get(member.name)
            if re.fullmatch(re.escape(root)+r'criteria/criterion_\d+_mean_scores\.csv',member.name):
                destination='data/criteria/'+path.name
            if not destination: continue
            if not member.isfile(): raise ValueError('Public files must be regular files')
            files[destination]=tar.extractfile(member).read(member.size)
    if 'evaluations.jsonl' not in files: raise ValueError('Evaluation records missing')
    rows=[RatingRow.model_validate(row).model_dump(exclude_none=True) for row in summary['summary']]
    if not rows: raise ValueError('Rankings missing')
    files['summary.json']=encode(rows)
    config=job['config'];spec=build_spec(config,'.')
    timestamp=datetime.fromtimestamp(job.get('finished_at') or job['created_at'],timezone.utc).isoformat()
    model_meta={}
    for name,ref in config['model_refs'].items():
        model_meta[name]=({'id':ref,'type':'api'} if isinstance(ref,str) else
            {'id':ref['repo_id'],'type':ref.get('kind','base'),'base_model':ref.get('base_model_id'),'adapter':('/'.join(filter(None,[ref['repo_id'],ref.get('subfolder')]))) if ref.get('kind')=='lora' else None, 'revision':ref.get('revision'),'base_revision':ref.get('base_revision')})
    collection=dict(spec['collection']);collection.pop('evaluations_path',None);collection.pop('enabled',None)
    collection['inspect']=dict(collection.get('inspect',{}));collection['inspect'].pop('log_dir',None)
    meta={'schema_version':2,'name':config['name'],'timestamp':timestamp,
        'evaluation_mode':'direct_rating','evaluation':spec['evaluation'],'models':model_meta,
        'dataset':{**spec['dataset'],'path':'scenarios.json'},
        'constitution':{**spec['constitution'],'path':'constitution.json'},
        'collection':collection,'training':{},'bootstrap':{**spec['training']['bootstrap'],'unit':'scenario'},
        'analysis':json.loads(files.get('data/analysis_config.json',b'{}')),
        'artifacts':{'images':[p.removeprefix('images/') for p in files if p.startswith('images/')],
                     'data':[p for p in files if p.startswith('data/')]},'log':{}}
    files['meta.json']=encode(meta)
    files['constitution.json']=encode(config['criteria'])
    top=max(rows,key=lambda row:row['elo_mean'])
    entry={'slug':slug_for(job),'name':config['name'],'group':'Community evaluations',
        'timestamp':timestamp,'models_count':len(config['models']),
        'constitution':config.get('constitution_name','Custom'),
        'scenario':f"{spec['dataset']['count']} scenarios",'evaluation_mode':'direct_rating',
        'sampler_mode':spec['collection']['sampler_mode'],
        'normalization':spec['evaluation']['direct_rating'].get('normalization','zscore_softmax'),
        'bootstrap_unit':'scenario','top_model':top['model_name'],'top_elo':round(top['elo_mean'],1)}
    return files,entry


class HuggingFacePublisher:
    def __init__(self,cfg):
        from huggingface_hub import HfApi
        self.cfg=cfg
        self.api=HfApi(token=cfg.hf_publish_token or False)

    def commit(self,slug,files=None,entry=None):
        from huggingface_hub import CommitOperationAdd,CommitOperationDelete,hf_hub_download
        from huggingface_hub.errors import HfHubHTTPError
        if not self.cfg.hf_publish_token: raise RuntimeError('publication_not_configured')
        repo=self.cfg.hf_results_repo;prefix='runs/'+slug+'/'
        for attempt in range(3):
            info=self.api.repo_info(repo,repo_type='dataset')
            # Do not replace a missing/unreadable index with an empty one.
            path=hf_hub_download(repo,filename='index.json',repo_type='dataset',revision=info.sha,token=self.cfg.hf_publish_token)
            with open(path) as source:index=json.load(source)
            if not isinstance(index.get('runs'),list): raise ValueError('Invalid public index')
            index['runs']=[r for r in index['runs'] if r.get('slug')!=slug]
            existing={s.rfilename for s in info.siblings if s.rfilename.startswith(prefix)}
            operations=[]
            if files is not None:
                index['runs'].append(entry)
                operations.extend(CommitOperationAdd(path_in_repo=prefix+name,path_or_fileobj=data) for name,data in files.items())
            keep={prefix+name for name in (files or {})}
            operations.extend(CommitOperationDelete(path_in_repo=name) for name in existing-keep)
            index['runs'].sort(key=lambda r:r.get('timestamp',''),reverse=True)
            index['last_updated']=datetime.now(timezone.utc).isoformat()
            operations.append(CommitOperationAdd(path_in_repo='index.json',path_or_fileobj=encode(index)))
            try:
                result=self.api.create_commit(repo_id=repo,repo_type='dataset',operations=operations,
                    parent_commit=info.sha,commit_message=('Publish ' if files is not None else 'Unlist ')+slug)
                return result.oid
            except HfHubHTTPError as exc:
                if exc.response is None or exc.response.status_code not in (409,412) or attempt==2: raise


def sync_publications(db,storage,publisher,cfg,now=None):
    now=int(time.time()) if now is None else now
    # Different lock from GPU lifecycle: slow HF uploads must not delay cancellation/cleanup.
    with db.scheduler_lock(82819402) as locked:
        if not locked:return
        for job in db.list():
            if job['state']!='succeeded':continue
            public=job['config'].get('visibility')=='public'
            previous=db.get_presentation(job['id'],'publication') or {}
            if public and previous.get('state')=='published':continue
            if not public and (not previous or previous.get('state')=='unpublished'):continue
            if previous.get('retry_at',0)>now and previous.get('desired_public')==public:continue
            state={'state':'publishing' if public else 'unpublishing','desired_public':public,
                'slug':slug_for(job),'updated_at':now,'attempts':previous.get('attempts',0)+1}
            db.put_presentation(job['id'],'publication',state)
            try:
                if not cfg.hf_publish_token:raise RuntimeError('publication_not_configured')
                if public:
                    if not job['artifact']:raise ValueError('Missing artifacts')
                    summary=db.get_presentation(job['id'],'summary')
                    if not summary:raise ValueError('Missing summary')
                    with tempfile.TemporaryFile() as archive:
                        storage.fetch(job['artifact'],archive,cfg.max_artifact_bytes)
                        archive.seek(0)
                        files,entry=export_bundle(job,archive,summary,cfg.max_artifact_bytes*4)
                    # Visibility can change during a slow download: do not begin a new upload then.
                    if db.get(job['id'])['config'].get('visibility')!='public':continue
                    commit=publisher.commit(state['slug'],files,entry)
                else:commit=publisher.commit(state['slug'])
                state.update(state='published' if public else 'unpublished',commit=commit,
                    url=f'https://huggingface.co/datasets/{cfg.hf_results_repo}/tree/main/runs/{state["slug"]}')
            except Exception as exc:
                # Provider exceptions may embed credentials; persist only controlled messages.
                reason='Publishing is not configured yet.' if str(exc)=='publication_not_configured' else 'Hugging Face publication failed; it will retry automatically.'
                state.update(state='failed',error=reason,retry_at=now+min(300,15*2**min(state['attempts'],5)))
                log.warning('Publication pending retry for job %s',job['id'])
            db.put_presentation(job['id'],'publication',state)


def publication_loop(db,cfg):
    from .storage import SupabaseStorage,LocalStorage
    storage=SupabaseStorage(cfg) if cfg.environment=='production' else LocalStorage(cfg.local_storage_path)
    publisher=HuggingFacePublisher(cfg)
    while True:
        try:sync_publications(db,storage,publisher,cfg)
        except Exception:log.error('Publication reconciliation failed; will retry')
        time.sleep(15)
