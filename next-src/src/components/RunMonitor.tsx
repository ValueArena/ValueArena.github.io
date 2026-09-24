'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { evaluationRequest as request, type EvaluationJob } from '@/lib/evaluation';

type Activity = {text:string;provider?:{events?:{text:string;time:string}[];available:boolean;updated_at?:number;checked_at?:number};pod_name?:string;gpu?:string;progress?:EvaluationJob['progress']};
const defaultSteps=['Queue','GPU startup','Worker ready','Responses & judgments','Rankings','Saving','Complete'];
const descriptions=['Waiting for an available execution slot.','RunPod allocates the GPU, downloads the image, and starts its container.','The worker connects and prepares the evaluation.','Models produce responses and judges evaluate them.','EigenBench computes rankings and uncertainty intervals.','Results and transcripts are saved to your account.','The evaluation is finished.'];
export const isActive=(state:string)=>['queued','provisioning','running'].includes(state);
function duration(seconds:number){return `${Math.floor(seconds/60)}m ${seconds%60}s`;}

export function RunMonitor({job,admin=false,onUpdate}:{job:EvaluationJob;admin?:boolean;onUpdate?:(job:EvaluationJob)=>void}){
 const steps = defaultSteps.map(s => job.compute_type === 'cpu' ? s.replace('GPU', 'CPU') : s);
 const [activity,setActivity]=useState<Activity|null>(null),[open,setOpen]=useState(false),[source,setSource]=useState<'worker'|'provider'>('worker');
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false),[follow,setFollow]=useState(true),[selected,setSelected]=useState<number|null>(null),[now,setNow]=useState(Date.now());
 const dialog=useRef<HTMLDialogElement>(null),output=useRef<HTMLPreElement>(null);const id=useId();
 const active=isActive(job.state),p=job.progress||activity?.progress;
 const endpoint=`${admin?'/admin':''}/evaluations/${job.id}`;
 useEffect(()=>{let alive=true,pending=false;async function refresh(){if(pending)return;pending=true;try{const data=await(await request(endpoint+'/logs')).json();if(alive){setActivity(data);setError('');}}catch(e){if(alive)setError((e as Error).message);}finally{pending=false;}}void refresh();const timer=active||open?setInterval(refresh,5000):null;return()=>{alive=false;if(timer)clearInterval(timer);};},[endpoint,active,open,job.state]);
 useEffect(()=>{if(!active)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[active]);
 useEffect(()=>{if(confirm)dialog.current?.showModal();else dialog.current?.close();},[confirm]);
 const events=activity?.provider?.events||[];
 const clean=(text:string)=>text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'');
 const workerText=clean(activity?.text||'');
 const providerText=events.map(e=>`${e.time?e.time+'  ':''}${e.text}`).join('\n');
 const log=source==='worker'?workerText:providerText;
 useEffect(()=>{if(open&&follow&&output.current)output.current.scrollTop=output.current.scrollHeight;},[log,open,follow,source]);
 const latest=(workerText.trim()?workerText.split(/[\r\n]+/).filter(Boolean).at(-1):events.at(-1)?.text)|| (job.state==='provisioning'?'Waiting for RunPod startup details…':p?.detail||'Waiting for an update…');
 const elapsed=active?Math.max(p?.elapsed_seconds||0,Math.floor(now/1000)-job.created_at):p?.elapsed_seconds||0;
 const heartbeat=p?.worker_last_seen_at;const age=heartbeat?Math.max(0,Math.floor(now/1000)-heartbeat):null;
 async function cancel(){setBusy(true);setError('');try{const updated=await(await request(endpoint+'/cancel',{method:'POST'})).json();onUpdate?.(updated);setConfirm(false);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className="run-monitor" data-active={active} data-state={job.state}>
  <div className="run-status-line"><span className="run-status" role="status"><i aria-hidden="true"/>{p?.title||job.state}</span><span className="run-refresh">{active?'Live · refreshes every 5s':'Run ended'}</span></div>
  <ol className="run-track" aria-label="Evaluation stages">{steps.map((step,index)=><li key={step} data-current={p?.step===index} data-complete={p?index<p.step:false}><button type="button" aria-current={p?.step===index?'step':undefined} aria-pressed={selected===index} onClick={()=>setSelected(selected===index?null:index)}><span className="run-node" aria-hidden="true">{p&&index<p.step?'✓':String(index+1).padStart(2,'0')}</span><span>{step}</span></button></li>)}</ol>
  {selected!==null&&<p className="run-stage-description"><strong>{steps[selected]}:</strong> {descriptions[selected]}</p>}
  <div className="run-metrics"><div><span>Elapsed</span><strong>{duration(elapsed)}</strong></div><div><span>Compute</span><strong>{activity?.gpu||'GPU allocation pending'}</strong></div><div><span>{active?'Worker connection':'Last worker update'}</span><strong>{active?(age===null?'Not connected':age>60?'Heartbeat delayed':`${age}s ago`):heartbeat?new Date(heartbeat*1000).toLocaleTimeString():'Not connected'}</strong></div></div>
  <div className="run-current-event"><svg className="run-chip" viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect x="10" y="10" width="28" height="28" rx="6"/><rect x="17" y="17" width="14" height="14" rx="2"/>{[16,24,32].map(n=><path key={n} d={`M${n} 4v6M${n} 38v6M4 ${n}h6M38 ${n}h6`}/>)}<circle cx="24" cy="24" r="3"/></svg><div><span>{workerText.trim()?'Latest worker output':'RunPod startup'}</span><p key={latest}>{latest}</p>{activity?.provider?.available===false&&active&&!workerText&&<small>Provider logs are temporarily unavailable; status will keep refreshing.</small>}</div></div>
  {!!job.omitted_count&&<p>{job.omitted_count} judgments omitted after validation retries. Rankings use the remaining judgments.</p>}
  {p?.cleanup_pending&&<p className="run-cleanup">GPU cleanup is pending confirmation.</p>}
  {!active&&job.state!=='succeeded'&&<p className="run-stop-reason">{p?.detail}</p>}
  <div className="run-controls"><button type="button" className="run-log-button" aria-expanded={open} aria-controls={id+'-logs'} onClick={()=>{if(!open&&!workerText&&events.length)setSource('provider');setOpen(!open);}}><span aria-hidden="true">≡</span> {open?'Hide logs':'View live logs'}</button>{active&&<button type="button" className="run-cancel-button" onClick={()=>setConfirm(true)}>Cancel evaluation</button>}</div>
  {error&&<p role="alert">{error}</p>}
  {open&&<div className="run-logs" id={id+'-logs'}><div className="run-log-toolbar"><div role="group" aria-label="Log source"><button type="button" aria-pressed={source==='worker'} onClick={()=>setSource('worker')}>Worker output</button><button type="button" aria-pressed={source==='provider'} onClick={()=>setSource('provider')}>RunPod startup</button></div><label><input type="checkbox" checked={follow} onChange={e=>setFollow(e.target.checked)}/>Follow output</label></div><pre ref={output} tabIndex={0} aria-label={source==='worker'?'Worker output':'RunPod system logs'}>{log||(source==='provider'?'No RunPod startup logs recorded yet.':'Waiting for worker output…')}</pre><small>{source==='worker'?'Latest 64 KB of worker output':'Recent RunPod system events'}{activity?.pod_name&&` · ${activity.pod_name}`}</small></div>}
  <dialog ref={dialog} className="run-cancel-dialog" aria-labelledby={id+'-title'} onCancel={e=>{e.preventDefault();if(!busy)setConfirm(false);}}><h3 id={id+'-title'}>Cancel this evaluation?</h3><p>Stop <strong>{job.name}</strong> and release its compute instance. This run cannot resume automatically.</p>{error&&<p role="alert">{error}</p>}<div><button type="button" autoFocus disabled={busy} onClick={()=>setConfirm(false)}>Keep running</button><button type="button" className="run-cancel-button" disabled={busy} onClick={()=>void cancel()}>{busy?'Cancelling…':'Yes, cancel evaluation'}</button></div></dialog>
 </div>;
}
