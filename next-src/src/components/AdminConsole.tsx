'use client';
import { useEffect, useState, useRef } from 'react';
import { evaluationAuth, evaluationRequest as request } from '@/lib/evaluation';
import { RunMonitor } from './RunMonitor';
import type { EvaluationJob } from '@/lib/evaluation';
import { EvaluationLogin } from './EvaluationLogin';

type Limits = Record<string,number|boolean|null>;
type Member = {user_id:string;email:string;username:string;role:string;status:string;credits:number;version:number;limits:Limits|null};
type Policy = {approval_required:boolean;submissions_enabled:boolean;dispatch_enabled:boolean;max_running_jobs:number|null;default_credits:number;limits:Limits;spec_defaults:Record<string,unknown>};
type Snapshot = {version:number;policy:Policy;members:Member[];audit:{id:string;action:string;target:string;actor:string;created_at:number}[];limits_schema:{properties:Record<string,{minimum?:number;maximum?:number}>}};
const title=(s:string)=>s.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
function LimitsForm({value,onChange,schema}:{value:Limits;onChange:(v:Limits)=>void;schema:Snapshot['limits_schema']}) {
 return <>
  <div className="eval-actions"><button type="button" onClick={()=>onChange(Object.fromEntries(Object.entries(value).map(([key,v])=>[key,typeof v==='boolean' ? v : null])))}>Remove all numeric limits</button></div>
  <p className="eval-help">Blank means no account limit. Provider capacity, model context windows and dataset size still apply. Enable “Require credits” to enforce an execution-time budget.</p>
  <div className="admin-limits">{Object.entries(value).map(([key,v])=>{
   const property=schema.properties[key] as {minimum?:number;anyOf?:{minimum?:number}[]};
   const minimum=property?.minimum ?? property?.anyOf?.find(p=>p.minimum!==undefined)?.minimum;
   return <label key={key}>{title(key)}{typeof v==='boolean'?<input type="checkbox" checked={v} onChange={e=>onChange({...value,[key]:e.target.checked})}/>:<>
    <input type="number" min={minimum} placeholder="No limit" value={v??''} onChange={e=>onChange({...value,[key]:e.target.value===''?null:Number(e.target.value)})}/>
    <button type="button" onClick={()=>onChange({...value,[key]:null})}>No limit</button>
   </>}</label>;
  })}</div>
 </>;
}
export function AdminConsole() {
 const [ready,setReady]=useState(false),[loggedIn,setLoggedIn]=useState(false),[data,setData]=useState<Snapshot|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [policy,setPolicy]=useState<Policy|null>(null),[spec,setSpec]=useState('{}'),[memberId,setMemberId]=useState(''),[status,setStatus]=useState('pending'),[override,setOverride]=useState(false),[limits,setLimits]=useState<Limits>({}),[minutes,setMinutes]=useState(60),[reason,setReason]=useState(''),[search,setSearch]=useState('');
 const grantAttempt=useRef<{signature:string;id:string}|null>(null);
 const [jobs,setJobs]=useState<(EvaluationJob & {user_id:string})[]>([]);
 async function refresh(){const d=await(await request('/admin')).json();setData(d);setPolicy(d.policy);setSpec(JSON.stringify(d.policy.spec_defaults,null,2));setJobs(await(await request('/admin/evaluations')).json());}
 useEffect(()=>{const auth=evaluationAuth();if(!auth){setReady(true);return;}void auth.auth.getSession().then(({data})=>{setLoggedIn(!!data.session);setReady(true);});const {data}=auth.auth.onAuthStateChange((_e,s)=>{setLoggedIn(!!s);if(!s)setData(null);});return()=>data.subscription.unsubscribe();},[]);
 useEffect(()=>{if(loggedIn)void refresh().catch(e=>setError(e.message));},[loggedIn]);
 useEffect(()=>{if(!data)return;let alive=true,pending=false;const timer=setInterval(async()=>{if(pending)return;pending=true;try{const next=await(await request('/admin/evaluations')).json();if(alive)setJobs(next);}catch(e){if(alive)setError((e as Error).message);}finally{pending=false;}},5000);return()=>{alive=false;clearInterval(timer);};},[!!data]);
 const member=data?.members.find(m=>m.user_id===memberId);
 function choose(m:Member){setMemberId(m.user_id);setStatus(m.status);setOverride(!!m.limits);setLimits(m.limits||data!.policy.limits);setReason('');}
 async function perform(fn:()=>Promise<void>,message:string){setBusy(true);setError('');setNotice('');try{await fn();await refresh();setNotice(message);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(!ready)return <p>Loading admin access…</p>;
 if(!loggedIn)return <EvaluationLogin/>;
 if(!data||!policy)return <p role="alert">{error||'Checking administrator access…'}</p>;
 return <div className="admin-console">
  <div className="admin-toolbar"><span>{data.members.filter(m=>m.status==='pending').length} awaiting approval</span><button disabled={busy} onClick={()=>void perform(async()=>{},'Accounts refreshed.')}>Refresh</button><a href="/evaluate/">Evaluation workspace</a></div>
  {error&&<p role="alert" className="evaluation-notice">{error}</p>}{notice&&<p role="status" className="evaluation-notice">{notice}</p>}
  <section className="admin-panel"><h2>Participants</h2><p>New sign-ins request access here. Approval is required before any evaluation, including runs funded with personal keys.</p><label>Find participant<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Email or username"/></label>
   <div className="admin-members">{data.members.filter(m=>`${m.email} ${m.username}`.toLowerCase().includes(search.toLowerCase())).map(m=><button className="admin-member" aria-pressed={m.user_id===memberId} key={m.user_id} onClick={()=>choose(m)}><span><strong>{m.email||m.user_id}</strong><small>{m.username||m.role}</small></span><span>{m.status}<small>{Math.floor((m.credits||0)/60)} minutes</small></span></button>)}</div>
   {member&&<div className="admin-member-editor"><h3>{member.email||member.user_id}</h3><form onSubmit={e=>{e.preventDefault();void perform(async()=>{await request(`/admin/members/${member.user_id}`,{method:'PUT',body:JSON.stringify({version:member.version,status,limits:override?limits:null})});},'Account updated.');}}><label>Access<select value={status} disabled={member.role==='admin'} onChange={e=>setStatus(e.target.value)}>{['pending','approved','suspended','rejected'].map(s=><option key={s}>{s}</option>)}</select></label><label className="admin-toggle"><input type="checkbox" checked={override} onChange={e=>setOverride(e.target.checked)}/>Custom limits for this participant</label>{override&&<LimitsForm value={limits} onChange={setLimits} schema={data.limits_schema}/>}<button className="button-primary" disabled={busy}>Save participant</button></form>
   <form onSubmit={e=>{e.preventDefault();void perform(async()=>{const amount=Math.round(minutes*60);const signature=JSON.stringify([member.user_id,amount,reason]);if(grantAttempt.current?.signature!==signature)grantAttempt.current={signature,id:crypto.randomUUID()};await request(`/admin/members/${member.user_id}/credits`,{method:'POST',body:JSON.stringify({amount,reason,request_id:grantAttempt.current.id})});grantAttempt.current=null;setReason('');},'Execution credits added.');}}><h3>Add execution credits</h3><p>One minute equals 60 execution credits. This is a runtime allowance, not a dollar budget or a provider-spend cap.</p><div className="eval-fields"><label>Minutes<input type="number" required min={1} max={16666} value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/></label><label>Reason<input required minLength={3} maxLength={200} value={reason} onChange={e=>setReason(e.target.value)}/></label></div><button disabled={busy}>Add credits</button></form></div>}
  </section>
  <form className="admin-panel" onSubmit={e=>{e.preventDefault();void perform(async()=>{await request('/admin/policy',{method:'PUT',body:JSON.stringify({version:data.version,policy:{...policy,spec_defaults:JSON.parse(spec)}})});},'Site settings saved. Existing running jobs keep their original spec.');}}><h2>Site settings</h2>
   <label className="admin-toggle"><input type="checkbox" checked={policy.approval_required} onChange={e=>setPolicy({...policy,approval_required:e.target.checked})}/>Require approval for new accounts</label><p>Turning this off approves future access requests automatically. Existing pending or suspended accounts keep their current status.</p>
   <label className="admin-toggle"><input type="checkbox" checked={policy.submissions_enabled} onChange={e=>setPolicy({...policy,submissions_enabled:e.target.checked})}/>Accept new evaluations</label>
   <label className="admin-toggle"><input type="checkbox" checked={policy.dispatch_enabled} onChange={e=>setPolicy({...policy,dispatch_enabled:e.target.checked})}/>Start queued evaluations</label><p>Pausing dispatch leaves running jobs and GPU cleanup active.</p>
   <div className="eval-fields"><label>Concurrent GPU jobs<input type="number" min={1} placeholder="No limit" value={policy.max_running_jobs??''} onChange={e=>setPolicy({...policy,max_running_jobs:e.target.value===''?null:Number(e.target.value)})}/></label><label>Initial credits for auto-approved accounts (seconds)<input required type="number" min={0} max={1000000} value={policy.default_credits} onChange={e=>setPolicy({...policy,default_credits:Number(e.target.value)})}/></label></div>
   <h3>Default participant limits</h3><LimitsForm value={policy.limits} onChange={v=>setPolicy({...policy,limits:v})} schema={data.limits_schema}/>
   <details className="eval-advanced"><summary>Default spec settings</summary><p>Defaults for new evaluations. Participants can override supported fields within their limits. Hosted filesystem paths and executable Python remain managed by the runner.</p><textarea aria-label="Default spec JSON" rows={16} value={spec} onChange={e=>setSpec(e.target.value)} spellCheck={false}/></details><button className="button-primary" disabled={busy}>Save site settings</button>
  </form>
  <section className="admin-panel"><h2>Evaluations</h2><p>Live status and logs for all participants. Updates every 5 seconds.</p>{jobs.length?jobs.map(j=><article className="admin-run" key={j.id}><header><h3>{j.name}</h3><small>{data.members.find(m=>m.user_id===j.user_id)?.email||j.user_id} · {j.constitution} · {j.models_count} models · {j.scenario_count} scenarios</small></header><RunMonitor job={j} admin onUpdate={updated=>setJobs(current=>current.map(item=>item.id===updated.id?{...item,...updated}:item))}/></article>):<p>No evaluations yet.</p>}</section>
  <section className="admin-panel"><h2>Admin activity</h2>{data.audit.map(a=><div className="admin-job" key={a.id}><span>{title(a.action)}<small>{data.members.find(m=>m.user_id===a.target)?.email||a.target}</small></span><time>{new Date(a.created_at*1000).toLocaleString()}</time></div>)}</section>
 </div>;
}
