from unittest.mock import Mock
from fastapi.testclient import TestClient
from app.api import create_app
from app.viewer import viewer_manifest
from test_backend import service, submit, USER, OTHER, Auth
from test_publication import archive, SUMMARY


def test_private_viewer_uses_same_bundle_and_requires_owner(service):
    cfg, db, old_client = service
    cfg.max_artifact_bytes=10000
    job_id=submit(old_client).json()['id']
    db.patch(job_id,('queued',),artifact='result.tar.gz')
    db.finish(job_id,'succeeded')
    db.put_presentation(job_id,'summary',SUMMARY)
    storage=Mock()
    storage.fetch.side_effect=lambda key,target,limit:target.write(archive([('evaluations.jsonl',b'{"scenario":"hello"}\n')]).getvalue())
    storage.download_url.side_effect=lambda key:'https://storage.example/'+key+'?signed=yes'
    client=TestClient(create_app(cfg,db,Auth(),storage))
    path=f'/results/{job_id}/viewer'
    assert client.get(path).status_code==404
    assert client.get(path,headers={'Authorization':'Bearer '+OTHER}).status_code==404
    storage.fetch.assert_not_called()
    result=client.get(path,headers={'Authorization':'Bearer '+USER})
    assert result.status_code==200
    files=result.json()['files']
    assert {'meta.json','summary.json','constitution.json','evaluations.jsonl'} <= files.keys()
    assert all(f'/viewer/{USER}/{job_id}/' in url for url in files.values())
    assert 'request.json' not in files
    assert client.get(path,headers={'Authorization':'Bearer '+USER}).status_code==200
    assert storage.fetch.call_count==1 # subsequent visits sign files; never re-extract
    assert db.get(job_id)['config']['visibility']=='private'
