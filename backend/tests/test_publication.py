import io
import json
import tarfile
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from app.publication import export_bundle, sync_publications, HuggingFacePublisher
from app.worker import read_summary
from app.results import ResultSummary
from test_backend import service, submit, payload, USER

SUMMARY={'summary':[{'model_name':'a','model_index':0,'elo_mean':1500}], 'record_count':1,'batch_count':1}

def archive(entries):
    out=io.BytesIO()
    with tarfile.open(fileobj=out,mode='w:gz') as tar:
        for name,data in entries:
            member=tarfile.TarInfo(name);member.size=len(data);tar.addfile(member,io.BytesIO(data))
    out.seek(0);return out


def test_export_whitelist_and_limits(service):
    _,db,client=service
    job=db.get(submit(client).json()['id'])
    items=[('evaluations.jsonl',b'{}\n'),('request.json',b'private'),('execution.log',b'secret')]
    files,entry=export_bundle(job,archive(items),SUMMARY,10000)
    assert 'request.json' not in files and 'execution.log' not in files
    assert entry['slug']=='community/'+job['id']
    assert json.loads(files['summary.json'])==SUMMARY['summary']
    for bad in [items+[('../escape',b'a')],items+items,items+[('large',b'x'*10001)]]:
        with pytest.raises(ValueError):export_bundle(job,archive(bad),SUMMARY,10000)


def test_publication_lifecycle_and_retry(service):
    cfg,db,client=service;cfg.hf_publish_token='fake';cfg.max_artifact_bytes=10000
    job_id=submit(client).json()['id']
    storage=Mock();publisher=Mock();publisher.commit.return_value='sha'
    def fetch(key,target,limit):target.write(archive([('evaluations.jsonl',b'{}\n')]).getvalue())
    storage.fetch.side_effect=fetch
    sync_publications(db,storage,publisher,cfg,now=1)
    publisher.commit.assert_not_called()
    db.patch(job_id,('queued',),artifact='result.tar.gz');db.finish(job_id,'succeeded')
    db.put_presentation(job_id,'summary',SUMMARY)
    sync_publications(db,storage,publisher,cfg,now=2)
    publisher.commit.assert_not_called() # private
    owner={'Authorization':'Bearer '+USER}
    client.post(f'/evaluations/{job_id}/visibility',json={'visibility':'public'},headers=owner)
    publisher.commit.side_effect=RuntimeError('secret provider error')
    sync_publications(db,storage,publisher,cfg,now=3)
    state=db.get_presentation(job_id,'publication')
    assert state['state']=='failed' and 'secret' not in state['error']
    sync_publications(db,storage,publisher,cfg,now=4)
    assert publisher.commit.call_count==1
    publisher.commit.side_effect=None
    sync_publications(db,storage,publisher,cfg,now=100)
    assert db.get_presentation(job_id,'publication')['state']=='published'
    sync_publications(db,storage,publisher,cfg,now=101)
    assert publisher.commit.call_count==2
    client.post(f'/evaluations/{job_id}/visibility',json={'visibility':'private'},headers=owner)
    sync_publications(db,storage,publisher,cfg,now=102)
    publisher.commit.assert_called_with('community/'+job_id)
    assert db.get_presentation(job_id,'publication')['state']=='unpublished'


def test_upstream_summary_directory_and_large_panel(tmp_path):
    root=tmp_path/'analysis/direct_rating';root.mkdir(parents=True)
    rows=[{'model_index':i,'model_name':str(i),'eigenbench_elo':1500+i} for i in range(21)]
    (root/'summary.json').write_text(json.dumps(rows))
    assert len(read_summary(tmp_path))==21
    (root/'bootstrap').mkdir()
    boot=[{**r,'elo_mean':1600,'elo_std':10} for r in rows]
    (root/'bootstrap/summary.json').write_text(json.dumps(boot))
    result=read_summary(tmp_path)
    assert result[0]['elo_mean']==1600
    ResultSummary(summary=result,record_count=20000,batch_count=800)


def test_hf_commit_preserves_other_runs_and_retries(monkeypatch,tmp_path):
    from huggingface_hub.errors import HfHubHTTPError
    import requests
    cfg=SimpleNamespace(hf_publish_token='fake',hf_results_repo='owner/data')
    publisher=HuggingFacePublisher(cfg)
    api=Mock();publisher.api=api
    api.repo_info.return_value=SimpleNamespace(sha='head',siblings=[])
    path=tmp_path/'index.json';path.write_text(json.dumps({'runs':[{'slug':'existing','timestamp':'2020'}]}))
    monkeypatch.setattr('huggingface_hub.hf_hub_download',lambda *a,**kw:str(path))
    response=requests.Response();response.status_code=409
    api.create_commit.side_effect=[HfHubHTTPError('conflict',response=response),SimpleNamespace(oid='new')]
    assert publisher.commit('community/id',{'summary.json':b'[]'},{'slug':'community/id','timestamp':'2026'})=='new'
    assert api.create_commit.call_count==2
    args=api.create_commit.call_args.kwargs
    index=json.loads(args['operations'][-1].path_or_fileobj)
    assert {r['slug'] for r in index['runs']}=={'existing','community/id'}
    assert args['parent_commit']=='head'


def test_visibility_changed_during_download_is_not_published(service):
    cfg,db,client=service;cfg.hf_publish_token='fake';cfg.max_artifact_bytes=10000
    job_id=submit(client,payload(visibility='public')).json()['id']
    db.patch(job_id,('queued',),artifact='result.tar.gz');db.finish(job_id,'succeeded')
    db.put_presentation(job_id,'summary',SUMMARY)
    publisher=Mock();storage=Mock()
    def fetch(key,target,limit):
        target.write(archive([('evaluations.jsonl',b'{}\n')]).getvalue())
        client.post(f'/evaluations/{job_id}/visibility',json={'visibility':'private'},headers={'Authorization':'Bearer '+USER})
    storage.fetch.side_effect=fetch
    sync_publications(db,storage,publisher,cfg,now=1)
    publisher.commit.assert_not_called()
