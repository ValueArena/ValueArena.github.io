"""Collect bounded RunPod system-log snapshots without delaying GPU cleanup."""
import asyncio
import json
import re
import time
from urllib.parse import quote
import httpx
from .auth import worker_token
from .db import ACTIVE
from .secrets import decrypt


def redact(text, secrets):
    for secret in secrets:
        if secret: text = text.replace(secret, '[redacted]')
    text = re.sub(r'Bearer\s+\S+', 'Bearer [redacted]', text, flags=re.I)
    return re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', text)


async def system_logs(pod_id, key):
    events=[]; buffer=''; size=0; connected=False
    try:
        async with asyncio.timeout(5):
            async with httpx.AsyncClient(timeout=httpx.Timeout(4, read=1)) as client:
                async with client.stream('GET',f'https://api.runpod.io/v2/pods/{quote(pod_id,safe="")}/logs',
                    params={'tail':80,'source':'system'},headers={'Authorization':'Bearer '+key,'Accept':'text/event-stream'}) as response:
                    response.raise_for_status()
                    connected=True
                    async for chunk in response.aiter_text():
                        size+=len(chunk)
                        if size>128000:break
                        buffer=(buffer+chunk).replace('\r\n','\n')
                        while '\n\n' in buffer:
                            frame,buffer=buffer.split('\n\n',1)
                            raw='\n'.join(line[5:].lstrip() for line in frame.splitlines() if line.startswith('data:'))
                            if not raw:continue
                            try:entry=json.loads(raw)
                            except ValueError:continue
                            if isinstance(entry,dict) and entry.get('source')=='system' and isinstance(entry.get('line'),str):
                                events.append({'text':entry['line'][-2000:],'time':str(entry.get('ts',''))[:80]})
                        if len(events)>=80:break
    except (TimeoutError,httpx.ReadTimeout):
        if not connected:raise
    return events[-80:]


async def collect_activity(db,cfg):
    semaphore=asyncio.Semaphore(4)
    async def collect(job):
        async with semaphore:
            key=cfg.runpod_api_key
            secrets=[cfg.runpod_api_key,cfg.openrouter_api_key,cfg.hf_token,worker_token(cfg.worker_secret,job['id'])]
            if db.job_credentials(job['id']):
                encrypted=db.job_credentials(job['id'])
                if not encrypted:return
                keys=decrypt(cfg.worker_secret,encrypted);key=keys.get('runpod_key',key);secrets+=list(keys.values())
            previous=db.get_presentation(job['id'],'provider_activity') or {}
            now=int(time.time())
            try:
                events=await system_logs(job['pod_id'],key)
                for event in events:event['text']=redact(event['text'],secrets)
                snapshot={'events':events or previous.get('events',[]),'checked_at':now,'available':True,
                          'updated_at':now if events else previous.get('updated_at')}
            except Exception:
                # Provider errors can include auth details. Never store their raw bodies.
                snapshot={**previous,'checked_at':now,'available':False}
            db.put_presentation(job['id'],'provider_activity',snapshot)
    await asyncio.gather(*(collect(j) for j in db.list() if j['state'] in ACTIVE and j.get('pod_id')))


def activity_loop(db,cfg):
    import logging
    while True:
        try:asyncio.run(collect_activity(db,cfg))
        except Exception:logging.getLogger(__name__).warning('Run activity refresh unavailable; will retry')
        time.sleep(10)
