'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { evaluationAPI, evaluationAuth, evaluationRequest as request, type EvaluationJob as Job } from '@/lib/evaluation';
import { CONSTITUTIONS_DATA } from '@/lib/constitutions-data';
import { parseScenarios } from '@/lib/scenario-upload';
import { AdvancedConfiguration, parseAdvancedSpec } from './AdvancedConfiguration';
import { EvaluationLogin } from './EvaluationLogin';
import { RunMonitor, isActive } from './RunMonitor';
import { Penguin } from './Penguin';
import { ModelLogo } from './ModelLogo';
import { mergeAcceptedRuns } from '@/lib/evaluation-history';

type Model = { id: string; label: string; provider?: string };
type CustomModel = { id: string; provider: string; repo_id: string; kind: string; subfolder: string; base_model_id: string };
const presetNames = Object.keys(CONSTITUTIONS_DATA).sort();
const label = (s: string) => s.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
const gpuTypes = ['NVIDIA A40', 'NVIDIA RTX A6000', 'NVIDIA GeForce RTX 4090', 'NVIDIA A100 80GB PCIe', 'NVIDIA A100-SXM4-80GB', 'NVIDIA H100 80GB HBM3'];

export function EvaluationRunner() {
  const auth = evaluationAuth();
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [notice, setNotice] = useState(''); const [error, setError] = useState('');
  const [models, setModels] = useState<Model[]>([]); const [modelQuery, setModelQuery] = useState(''); const [directory, setDirectory] = useState<Model[]>([]);
  const [selected, setSelected] = useState<string[]>([]); const [custom, setCustom] = useState<CustomModel[]>([]);
  const [provider, setProvider] = useState('openrouter'); const [repo, setRepo] = useState('');
  const [kind, setKind] = useState('base'); const [base, setBase] = useState(''); const [subfolder, setSubfolder] = useState('');
  const [advanced, setAdvanced] = useState('{}');
  let advancedValid = true;
  let advancedOptions: Record<string, unknown> = {};
  try { advancedOptions = parseAdvancedSpec(advanced); } catch { advancedValid = false; }
  const advancedCount = (advancedOptions.dataset as { count?: number } | undefined)?.count;
  const [engine, setEngine] = useState('native'); const [name, setName] = useState('');
  const [constitution, setConstitution] = useState('humor');
  const [criteria, setCriteria] = useState(CONSTITUTIONS_DATA.humor.join('\n'));
  const [source, setSource] = useState('airiskdilemmas'); const [count, setCount] = useState(200);
  const [scenarioText, setScenarioText] = useState(''); const [fileName, setFileName] = useState('');
  const [ownKeys, setOwnKeys] = useState(false); const [orKey, setOrKey] = useState(''); const [rpKey, setRpKey] = useState(''); const [hfToken, setHfToken] = useState('');
  const hasLocalModels = selected.some(id => models.some(m => m.id === id && m.provider === 'huggingface') || custom.some(m => m.id === id && m.provider === 'huggingface'));
  const computeType = hasLocalModels ? 'gpu' : 'cpu';
  const [gpuCount, setGPUCount] = useState(1);
  const [cpuCount, setCPUCount] = useState(4); const [cpuFlavor, setCPUFlavor] = useState('cpu3g'); const [volume, setVolume] = useState(0);
  const [gpu, setGPU] = useState(gpuTypes[0]); const [disk, setDisk] = useState(100);
  const [stock, setStock] = useState<{ gpus: { id: string; stock: string; price_per_hour: number | null }[]; checked_at: number; disk_gb: number; gpu_count: number; min_cuda_version: string } | null>(null);
  const stockRequest = useRef(0);
  const [stockBusy, setStockBusy] = useState(false); const [stockError, setStockError] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [accessError, setAccessError] = useState('');
  const [accessRetry, setAccessRetry] = useState(0);
  const [access,setAccess] = useState('loading'); const [isAdmin,setIsAdmin] = useState(false); const [submissionsEnabled,setSubmissionsEnabled] = useState(true);
  const [limits,setLimits] = useState<{max_models:number|null;max_scenarios:number|null;max_runtime_seconds:number|null;max_disk_gb:number|null;require_credits:boolean;allow_own_keys:boolean;allow_public_results:boolean}>({max_models:null,max_scenarios:null,max_runtime_seconds:null,max_disk_gb:null,require_credits:false,allow_own_keys:true,allow_public_results:true});

  const [credits, setCredits] = useState<number | null>(null); const [enabled, setEnabled] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]); const [openRuns, setOpenRuns] = useState<Record<string, boolean>>({}); const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'new' | 'runs' | 'account'>('new');
  const [username, setUsername] = useState(''); const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submissionPending = useRef(false);
  const recentlySubmitted = useRef(new Map<string, Job>());
  const [runsLoaded, setRunsLoaded] = useState(false);
  const [runsError, setRunsError] = useState('');
  const [runsRefreshing, setRunsRefreshing] = useState(false);
  const [runsRetry, setRunsRetry] = useState(0);
  const submission = useRef<{ body: string; key: string } | null>(null);

  useEffect(() => {
    if (!auth) return;
    let alive = true;
    void auth.auth.getSession().then(({ data }) => { if (alive) { setSession(data.session); setAuthReady(true); setUsername(data.session?.user.user_metadata.username || ''); } });
    const { data } = auth.auth.onAuthStateChange((event, next) => {
      if (!alive) return;
      setSession(next); setAuthReady(true);
      if (event === 'PASSWORD_RECOVERY') { setTab('account'); setNotice('Choose a new password below.'); }
      if (!next) { recentlySubmitted.current.clear(); setOrKey(''); setRpKey(''); setHfToken(''); setJobs([]); submission.current = null; }
    });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, [auth]);

  useEffect(() => {
    setAccess('loading'); setAccessError(''); setIsAdmin(false); setEnabled(false);
    if (!session || !evaluationAPI) return;
    let alive = true, pending = false;
    const controller = new AbortController();
    async function refreshAccount() {
      if (pending) return;
      pending = true;
      const deadline = new AbortController();
      const abort = () => deadline.abort();
      controller.signal.addEventListener('abort', abort);
      const timeout = setTimeout(abort, 20000);
      try {
        const account = await request('/account', { signal: deadline.signal }).then(r => r.json());
        if (alive) {
          setAccess(account.status || 'approved'); setAccessError('');
          setIsAdmin(account.role === 'admin');
          if (account.limits) setLimits(account.limits);
          setSubmissionsEnabled(account.submissions_enabled !== false);
          setCredits(account.credits); setEnabled(account.enabled);
        }
      } catch (e) {
        if (alive) {
          setAccess('error'); setEnabled(false);
          setAccessError(deadline.signal.aborted ? 'The account check timed out. Please retry.' : (e as Error).message);
        }
      } finally {
        clearTimeout(timeout); controller.signal.removeEventListener('abort', abort); pending = false;
      }
    }
    void refreshAccount();
    const timer = setInterval(refreshAccount, 15000);
    return () => { alive = false; clearInterval(timer); controller.abort(); };
  }, [session?.user.id, accessRetry]);

  useEffect(() => {
    setModels([]); setJobs([]); setDirectory([]);
    setRunsLoaded(false); setRunsError(''); recentlySubmitted.current.clear();
    if (!session || !evaluationAPI) return;
    let alive = true;
    const controller = new AbortController();
    const options = { signal: controller.signal };
    void request('/models', options).then(r => r.json()).then(data => {
      if (alive) setModels(data.models);
    }).catch(e => { if (alive) setError(`Could not load models: ${e.message}`); });
    void request('/models/openrouter', options).then(r => r.json()).then(data => {
      if (alive) setDirectory(data.models);
    }).catch(() => {});
    return () => { alive = false; controller.abort(); };
  }, [session?.user.id]);

  useEffect(() => {
    if (!session || !evaluationAPI) return;
    let alive = true, pending = false;
    const controller = new AbortController();
    setRunsError('');
    async function refreshRuns() {
      if (pending) return;
      pending = true; setRunsRefreshing(true);
      const deadline = new AbortController();
      const abort = () => deadline.abort();
      controller.signal.addEventListener('abort', abort);
      const timeout = setTimeout(abort, 20000);
      try {
        const runs: Job[] = await request('/evaluations', { signal: deadline.signal }).then(r => r.json());
        if (alive) {
          setJobs(mergeAcceptedRuns(runs, recentlySubmitted.current));
          setRunsLoaded(true); setRunsError('');
        }
      } catch (e) {
        if (alive) setRunsError(deadline.signal.aborted ? 'Loading your evaluations timed out. Retry below.' : `Could not load evaluations: ${(e as Error).message}`);
      } finally {
        clearTimeout(timeout); controller.signal.removeEventListener('abort', abort); pending = false;
        if (alive) setRunsRefreshing(false);
      }
    }
    void refreshRuns();
    const timer = setInterval(refreshRuns, 5000);
    return () => { alive = false; clearInterval(timer); controller.abort(); };
  }, [session?.user.id, runsRetry]);

  async function prepareRetry(job: Job) {
    try {
      const config = await request(`/evaluations/${job.id}/settings`).then(r => r.json());
      setName(config.name); setEngine(config.engine); setSelected(config.models);
      setCustom(config.custom_models || []); setAdvanced(JSON.stringify(config.advanced_spec || {}, null, 2));
      setConstitution(presetNames.find(n => label(n) === config.constitution_name) || 'custom');
      setCriteria(config.criteria.join('\n')); setSource(config.scenario_source);
      setCount(config.scenario_count); setScenarioText(config.scenarios.map((text: string) => JSON.stringify({scenario: text})).join('\n'));
      setFileName('Restored scenarios'); setVisibility(config.visibility);
      setOwnKeys(config.funding === 'own_keys'); setGPU(config.gpu_type); setDisk(config.disk_gb); setGPUCount(config.gpu_count || 1); setCPUCount(config.cpu_count || 4); setCPUFlavor(config.cpu_flavor || 'cpu3g'); setVolume(config.volume_gb || 0);
      setOrKey(''); setRpKey(''); setHfToken(''); submission.current = null;
      setTab('new'); setError('');
      setNotice('Settings restored. Review the GPU and re-enter any personal keys, then submit a new evaluation.');
    } catch (e) { setError((e as Error).message); }
  }

  const effectiveDisk = ownKeys || isAdmin ? disk + volume : 100;
  const effectiveGPUCount = ownKeys || isAdmin ? gpuCount : 1;
  const effectiveGPU = ownKeys || isAdmin ? gpu : gpuTypes[0];
  const usesGPU = computeType === 'gpu';
  const checkStock = useCallback(async () => {
    const sequence = ++stockRequest.current;
    setStockBusy(true); setStockError(''); setStock(null);
    try {
      const response = await request(`/compute/availability?disk_gb=${effectiveDisk}&gpu_count=${effectiveGPUCount}`);
      const data = await response.json();
      if (sequence === stockRequest.current) setStock(data);
    } catch (e) { if (sequence === stockRequest.current) setStockError((e as Error).message); }
    finally { if (sequence === stockRequest.current) setStockBusy(false); }
  }, [effectiveDisk, effectiveGPUCount]);
  useEffect(() => {
    if (access !== 'approved' || !usesGPU || tab !== 'new') return;
    const debounce = setTimeout(() => void checkStock(), 400);
    const timer = setInterval(() => void checkStock(), 60000);
    return () => { clearTimeout(debounce); clearInterval(timer); ++stockRequest.current; setStockBusy(false); };
  }, [access, usesGPU, tab, session?.user.id, checkStock]);
  const matchingStock = stock && stock.disk_gb === effectiveDisk && stock.gpu_count === effectiveGPUCount ? stock : null;
  const selectedStock = matchingStock?.gpus.find(item => item.id === effectiveGPU);
  const capacityMessage = stockBusy ? 'Checking matching RunPod capacity…' : stockError ? 'Availability could not be checked. Allocation may still fail; refresh or submit to try.' : selectedStock?.stock === 'None' ? 'No matching capacity reported. Choose another GPU, or submit to retry allocation for up to 5 minutes. Evaluation starts only after a GPU is allocated.' : selectedStock?.stock === 'Low' ? 'Limited capacity. Allocation can fail even when stock is reported; we retry for up to 5 minutes.' : !selectedStock || selectedStock.stock === 'Unknown' ? 'Capacity is unconfirmed. RunPod has not reported matching stock; submitting will attempt allocation.' : 'Capacity reported available. This is not a reservation; RunPod confirms availability when allocating your instance.';

  const collectionOptions = (advancedOptions.collection || {}) as {generation?:Record<string,{max_tokens?:number}>;failure_policy?:string};
  function setBudget(phase:string,value:string) {
    const options = parseAdvancedSpec(advanced);
    const collection = (options.collection || {}) as Record<string,unknown>;
    const generation = (collection.generation || {}) as Record<string,Record<string,unknown>>;
    const updated = {...generation[phase]};
    if (value === '') delete updated.max_tokens; else updated.max_tokens = Number(value);
    setAdvanced(JSON.stringify({...options,collection:{...collection,generation:{...generation,[phase]:updated}}},null,2));
  }

  function addModel() {
    setError('');
    if (!/^[\w.-]+\/[\w.:-]+$/.test(repo.trim())) { setError('Enter a model ID such as Qwen/Qwen2.5-7B-Instruct or openai/gpt-6-sol.'); return; }
    if ((limits.max_models !== null && selected.length >= limits.max_models)) { setError(`The panel can contain up to ${limits.max_models} models.`); return; }
    if (provider === 'huggingface' && kind === 'lora' && !base.trim()) { setError('Enter the LoRA’s base model repository.'); return; }
    if (custom.some(m => m.provider === provider && m.repo_id === repo.trim() && m.subfolder === subfolder)) { setError('That model is already in your panel.'); return; }
    const stem = (repo.trim() + (subfolder ? '-' + subfolder.trim() : '')).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 55);
    const id = selected.includes(stem) || models.some(m => m.id === stem) ? `${stem}-${crypto.randomUUID().slice(0, 6)}` : stem;
    setCustom(items => [...items, { id, provider, repo_id: repo.trim(), kind, subfolder: subfolder.trim(), base_model_id: base.trim() }]);
    setSelected(ids => [...ids, id]); setRepo(''); setSubfolder(''); setBase('');
  }
  async function upload(file?: File) {
    if (!file) return;
    setError('');
    try {
      if (file.size > 2000000) throw new Error('Choose a JSONL file smaller than 2 MB.');
      const text = await file.text(); const rows = parseScenarios(text,limits.max_scenarios ?? Infinity);
      setScenarioText(text); setFileName(`${file.name} · ${rows.length} scenarios`); setSource('custom');
    } catch (e) { setError((e as Error).message); }
  }
  function buildRequest(includeKeys = true) {
    return { name, engine, advanced_spec: parseAdvancedSpec(advanced), models: selected, custom_models: custom.filter(m => selected.includes(m.id)),
        criteria: criteria.split('\n').map(s => s.trim()).filter(Boolean), constitution_name: constitution === 'custom' ? 'Custom' : label(constitution),
        scenario_source: source, scenario_count: count, scenarios: source === 'custom' ? parseScenarios(scenarioText,limits.max_scenarios ?? Infinity) : [], visibility,
        hf_token: hfToken,
        funding: ownKeys ? 'own_keys' : 'service', ...(ownKeys && includeKeys ? { openrouter_key: orKey, runpod_key: rpKey } : {}),
        compute_type: computeType, gpu_count: ownKeys || isAdmin ? (computeType === 'cpu' ? 1 : gpuCount) : 1, cpu_count: ownKeys || isAdmin ? cpuCount : 4, cpu_flavor: ownKeys || isAdmin ? cpuFlavor : 'cpu3g', volume_gb: ownKeys || isAdmin ? volume : 0,
        gpu_type: ownKeys || isAdmin ? gpu : gpuTypes[0], disk_gb: ownKeys || isAdmin ? disk : 100 };
  }
  const blockers: string[] = [];

  if ((ownKeys || isAdmin) && computeType === 'gpu' && gpuCount > 1 && engine === 'inspect') blockers.push('Select Native to use multiple GPUs.');
  if ((ownKeys || isAdmin) && limits.max_disk_gb !== null && disk + volume > limits.max_disk_gb) blockers.push('Container and workspace storage exceed your total storage limit.');
  if (!name.trim()) blockers.push('Enter an evaluation name.');
  if (selected.length < 2) blockers.push('Select at least two models.');
  if ((limits.max_models !== null && selected.length > limits.max_models)) blockers.push(`Remove models to stay within your ${limits.max_models}-model limit.`);
  if (!criteria.trim()) blockers.push('Add at least one constitution criterion.');
  if (!advancedValid) blockers.push('Fix the JSON in Advanced configuration.');
  if (!submissionsEnabled) blockers.push('New evaluations are paused by an administrator.');
  if (access !== 'approved') blockers.push('Your account needs approval before running evaluations.');
  if (ownKeys) {
    if (!limits.allow_own_keys) blockers.push('Personal provider keys are disabled for your account.');
    if (!orKey.trim()) blockers.push('Enter your OpenRouter API key.');
    if (!rpKey.trim()) blockers.push('Enter your RunPod API key.');
  } else if (!enabled) blockers.push('Service-funded evaluations are disabled for your account. Contact an administrator.');
  else if (limits.require_credits && credits === null) blockers.push('Waiting for your credit balance.');
  else if (limits.require_credits && (credits ?? 0) < 300) blockers.push('Your account needs at least five minutes of execution credits. Ask an administrator to add credits or use your provider keys.');
  if (visibility === 'public' && !limits.allow_public_results) blockers.push('Choose private results; public publishing is disabled for your account.');
  if (source === 'custom') {
    try { parseScenarios(scenarioText,limits.max_scenarios ?? Infinity); } catch(e) { blockers.push((e as Error).message); }
  } else if (!Number.isInteger(count) || count < 1 || count > (limits.max_scenarios ?? 3000)) blockers.push(`Choose between 1 and ${Math.min(limits.max_scenarios ?? 3000,3000)} scenarios.`);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submissionPending.current) return;
    setError(''); setNotice('');
    const form = event.currentTarget as HTMLFormElement;
    if (blockers.length) {
      document.getElementById('evaluation-blockers')?.focus();
      form.reportValidity();
      return;
    }
    if (!form.reportValidity()) return;
    submissionPending.current = true; setSubmitting(true); setBusy(true);
    try {
      const body = JSON.stringify(buildRequest());
      if (submission.current?.body !== body) submission.current = { body, key: crypto.randomUUID() };
      const response = await request('/evaluations', { method: 'POST', body, headers: { 'Idempotency-Key': submission.current.key } });
      const job: Job = await response.json();
      recentlySubmitted.current.set(job.id, job); setRunsLoaded(true); setRunsError(''); setOpenRuns(o => ({...o, [job.id]: true}));
      setJobs(existing => [job, ...existing.filter(j => j.id !== job.id)]); submission.current = null;
      setOrKey(''); setRpKey(''); setHfToken(''); setTab('runs'); window.scrollTo({top: 0, behavior: 'smooth'});
      setNotice('Evaluation queued. You can leave this page and return to your results.');
    } catch (e) { setError((e as Error).message); } finally { submissionPending.current = false; setSubmitting(false); setBusy(false); }
  }
  async function action(job: Job, endpoint: string, body?: object) {
    try {
      const updated = await (await request(`/evaluations/${job.id}/${endpoint}`, { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) })).json();
      setJobs(current => current.map(j => j.id === job.id ? updated : j));
    } catch (e) { setError((e as Error).message); }
  }
  async function download(job: Job) {
    try {
      const response = await request(`/evaluations/${job.id}/artifacts`);
      if (response.headers.get('content-type')?.includes('application/json')) {
        const { url } = await response.json(); window.location.assign(url);
      } else {
        const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement('a');
        anchor.href = url; anchor.download = 'evaluation.tar.gz'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (e) { setError((e as Error).message); }
  }
  async function saveAccount(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const { error } = await auth!.auth.updateUser({ data: { username }, ...(password ? { password } : {}) });
      if (error) throw error; setPassword(''); setNotice('Account updated. Use your email and password to log in again.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  if (!auth || !evaluationAPI) return <p className="evaluation-notice">The evaluation service is not connected yet.</p>;
  if (!authReady) return <div className="evaluation-notice eval-status" role="status"><Penguin size={40} state="loading" /><span>Loading your workspace…</span></div>;
  if (!session) return <EvaluationLogin />;

  if (submitting) return <section className="eval-submission-screen" aria-busy="true" role="status" aria-live="polite"><Penguin size={72} state="loading" /><h1>Submitting your evaluation</h1><p>Checking model access and saving your settings. This can take a moment.</p><p>You’ll be taken to Your evaluations as soon as the request is accepted.</p></section>;

  return <>
    <div className="evaluation-account"><span className="evaluation-account-user"><small>Signed in as</small>{session.user.user_metadata.username || session.user.email}</span><div className="evaluation-account-actions">{isAdmin && <a href="/admin/">Administration</a>}<button onClick={() => void auth.auth.signOut()}>Sign out</button></div></div>
    <nav className="eval-tabs" aria-label="Evaluation workspace">{(['new', 'runs', 'account'] as const).map(t => <button key={t} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>{t === 'new' ? 'New evaluation' : t === 'runs' ? `Your evaluations${runsLoaded || jobs.length ? ` (${jobs.length})` : ''}` : 'Account'}</button>)}</nav>
    {error && <p role="alert" className="evaluation-notice">{error}</p>}{notice && <p role="status" className="evaluation-notice">{notice}</p>}
    {tab === 'account' && <form className="evaluation-form eval-account-form" onSubmit={saveAccount}><h2>Your account</h2><p>{session.user.email}</p><label>Username<input required pattern="[a-zA-Z0-9_.-]+" minLength={2} maxLength={40} value={username} onChange={e => setUsername(e.target.value)} autoComplete="nickname" /></label><label>Set a password<input type="password" minLength={12} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" /><small>Leave blank to keep your existing password.</small></label><button className="button-primary" disabled={busy}>Save account</button></form>}
    {tab === 'new' && access!=='approved' && <div className="evaluation-notice eval-status" role="status"><Penguin size={40} state={access==='loading'?'loading':'idle'} /><span>{access==='error'?accessError:access==='loading'?'Checking account access…':access==='pending'?'Your access request is waiting for administrator approval.':`Your account is ${access}. Contact an administrator.`}</span>{access==='error' && <button type="button" onClick={() => setAccessRetry(n => n + 1)}>Retry account check</button>}</div>}
    {tab === 'new' && access==='approved' && <form className="evaluation-form eval-workspace eval-deploy" noValidate onSubmit={submit}>
      <div className="eval-main">
        <section className="eval-section"><header><span>01</span><h2>Models</h2><em className="eval-count">{selected.length} selected</em></header>
          <p>Each model answers the scenarios and judges the responses. {limits.max_models===null?'Choose at least two models.':`Choose 2–${limits.max_models} models.`}</p>
          <input type="search" className="eval-search" placeholder="Filter models…" aria-label="Filter models" value={modelQuery} onChange={e => setModelQuery(e.target.value)} />
          <div className="eval-model-presets eval-model-grid">{models.filter(m => !modelQuery.trim() || `${m.label} ${m.id}`.toLowerCase().includes(modelQuery.trim().toLowerCase())).map(model => <label className="evaluation-model eval-model-card" key={model.id}><input type="checkbox" checked={selected.includes(model.id)} disabled={!selected.includes(model.id) && (limits.max_models !== null && selected.length >= limits.max_models)} onChange={e => setSelected(ids => e.target.checked ? [...ids, model.id] : ids.filter(id => id !== model.id))} /><ModelLogo name={model.id} size={22} /><span className="eval-model-text"><strong>{model.label}</strong><small>{model.id}</small></span><span className="eval-check" aria-hidden="true" /></label>)}</div>
          {custom.map(m => <div className="eval-model-chip" key={m.id}><span><strong>{m.repo_id}</strong><small>{m.provider === 'openrouter' ? 'OpenRouter' : m.kind === 'lora' ? `LoRA · ${m.base_model_id}` : 'Hugging Face'}{m.subfolder && ` / ${m.subfolder}`}</small></span><button type="button" aria-label={`Remove ${m.repo_id}`} onClick={() => { setCustom(ms => ms.filter(x => x.id !== m.id)); setSelected(ids => ids.filter(id => id !== m.id)); }}>Remove</button></div>)}
          <p className="eval-subhead">Add a model by ID</p>
          <div className="eval-add-model"><div className="eval-fields"><label>Provider<select value={provider} onChange={e => setProvider(e.target.value)}><option value="openrouter">OpenRouter</option><option value="huggingface">Hugging Face</option></select></label><label>Model ID<input value={repo} onChange={e => setRepo(e.target.value)} list={provider === 'openrouter' ? 'openrouter-models' : undefined} placeholder={provider === 'openrouter' ? 'Search or paste provider/model' : 'owner/model'} /></label></div>
            <datalist id="openrouter-models">{directory.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</datalist>
            {provider === 'huggingface' && <><label>Weights<select value={kind} onChange={e => setKind(e.target.value)}><option value="base">Full model</option><option value="lora">LoRA adapter</option></select></label>{kind === 'lora' && <div className="eval-fields"><label>Base model<input value={base} onChange={e => setBase(e.target.value)} placeholder="Qwen/Qwen2.5-7B-Instruct" /></label><label>Adapter subfolder (optional)<input value={subfolder} onChange={e => setSubfolder(e.target.value)} placeholder="introspection-final" /></label></div>}<small>Public or gated safetensors repositories. Gated models require approval and a Hugging Face token. Revisions are pinned at submission. The model must fit your GPU and be supported by vLLM.</small></>}
            <button type="button" className="button-secondary" onClick={addModel}>+ Add model</button>
          </div>
        </section>
        <section className="eval-section"><header><span>02</span><h2>Constitution</h2></header><label>What should the judges evaluate?<select value={constitution} onChange={e => { setConstitution(e.target.value); setCriteria(e.target.value === 'custom' ? '' : CONSTITUTIONS_DATA[e.target.value].join('\n')); }}>{presetNames.map(c => <option key={c} value={c}>{label(c)}</option>)}<option value="custom">Write your own</option></select></label>
          <label>Criteria<textarea required rows={6} value={criteria} onChange={e => { setCriteria(e.target.value); setConstitution('custom'); }} /><small>One criterion per line · {criteria.split('\n').filter(s => s.trim()).length} criteria</small></label>
        </section>
        <section className="eval-section"><header><span>03</span><h2>Scenarios</h2></header><div className="eval-fields"><label>Dataset<select value={source} onChange={e => setSource(e.target.value)}><option value="airiskdilemmas">AIRiskDilemmas</option><option value="custom">Upload or paste JSONL</option></select></label>{source === 'airiskdilemmas' && <label>Scenario count<input type="number" min={1} max={Math.min(limits.max_scenarios ?? 3000,3000)} required value={count} onChange={e => setCount(Number(e.target.value))} /><button type="button" onClick={()=>setCount(Math.min(limits.max_scenarios ?? 3000,3000))}>Max available</button></label>}</div>
          {source === 'airiskdilemmas' ? <p className="eval-help">Uses the first {count} unique dilemmas from the pinned dataset. Paired action rows are combined into one scenario.</p> : <><label className="eval-upload">Upload scenarios<input type="file" accept=".jsonl,application/x-ndjson,text/plain" onChange={e => void upload(e.target.files?.[0])} /><small>{fileName || `JSONL · up to ${limits.max_scenarios ?? "any number of"} unique scenarios · 2 MB maximum`}</small></label><details><summary>JSONL format and example</summary><p>One JSON object per line, with a <code>scenario</code> field. Do not wrap the lines in an array. For paragraphs inside a scenario, use <code>\n</code>.</p><pre>{'{"scenario":"A colleague needs help. What do you do?"}\n{"scenario":"Your team disagrees about a decision. How do you respond?"}'}</pre><a download="scenarios.jsonl" href={'data:application/x-ndjson;charset=utf-8,' + encodeURIComponent('{"scenario":"A colleague needs help. What do you do?"}\n{"scenario":"Your team disagrees about a decision. How do you respond?"}\n')}>Download example</a></details><label>Scenario JSONL<textarea required rows={6} value={scenarioText} onChange={e => { setScenarioText(e.target.value); setFileName(''); }} placeholder={'{"scenario":"Your scenario here"}'} /></label></>}
        </section>
        <section className="eval-section"><header><span>04</span><h2>Compute &amp; run</h2></header>
          <div className="eval-fields"><label>Evaluation name<input required maxLength={120} value={name} onChange={e => setName(e.target.value)} placeholder="Humor / Qwen comparison" /></label><label>Engine<select value={engine} onChange={e => setEngine(e.target.value)}><option value="native">Native EigenBench</option><option value="inspect">Inspect</option></select></label></div>
          <div className="eval-choice" role="radiogroup" aria-label="Compute and API access">
            <label className="eval-choice-card"><input type="radio" name="funding" checked={!ownKeys} onChange={() => {setOwnKeys(false); if (!isAdmin) {setGPUCount(1); setVolume(0);}}} /><strong>LAISR Lab compute</strong><small>{enabled ? (limits.require_credits ? `${Math.floor((credits ?? 0) / 60)} compute minutes available.` : 'LAISR Lab compute. No execution credit limit.') : 'LAISR Lab compute is not enabled for your account. Contact an administrator.'}</small></label>
            <label className="eval-choice-card"><input type="radio" name="funding" checked={ownKeys} onChange={() => setOwnKeys(true)} /><strong>My provider keys</strong><small>Charged to your OpenRouter and RunPod accounts.</small></label>
          </div>
          {ownKeys && <><div className="eval-fields"><label>OpenRouter API key<input type="password" required value={orKey} onChange={e => setOrKey(e.target.value)} autoComplete="off" /></label><label>RunPod API key<input type="password" required value={rpKey} onChange={e => setRpKey(e.target.value)} autoComplete="off" /></label></div><small>Keys are encrypted and removed after confirmed compute cleanup.</small></>}
        <label>Hugging Face token (optional)<input type="password" value={hfToken} onChange={e=>setHfToken(e.target.value)} autoComplete="off" placeholder="hf_…"/><small>Used only for this run. Your Hugging Face account must have access to gated models. Stored encrypted and removed after compute cleanup.</small></label>
        <div className="eval-fields">{(['response','reflection','direct_rating'] as const).map(phase=><label key={phase}>{phase==='direct_rating'?'Rating':label(phase)} token budget<input type="number" min="1" step="1" disabled={!advancedValid} value={collectionOptions.generation?.[phase]?.max_tokens ?? ''} placeholder={{response:'Default: 4096',reflection:'Default: 2048',direct_rating:'Default: 512'}[phase]} onChange={e=>setBudget(phase,e.target.value)}/></label>)}</div>
        <small>Increase reflection tokens for reasoning models. Per-model overrides are available in Advanced configuration.</small>
        {engine==='native'&&<label><input type="checkbox" checked={collectionOptions.failure_policy!=='strict'} disabled={!advancedValid} onChange={e=>setAdvanced(JSON.stringify({...advancedOptions,collection:{...collectionOptions,failure_policy:e.target.checked?'omit_invalid_judgments':'strict'}},null,2))}/>Continue after invalid judgments; omit affected samples after retries.</label>}
          <fieldset className="eval-fields" disabled={!ownKeys && !isAdmin}>
            <legend>Compute</legend>
            <div><strong>{usesGPU ? 'GPU' : 'CPU'} · automatic</strong><p className="eval-help">{usesGPU ? 'Your panel includes a Hugging Face model, so GPU compute is required.' : 'API-only panels use CPU compute. No GPU is requested.'}</p></div>
            {computeType === 'gpu' ? <label>GPU count<select value={gpuCount} onChange={e => setGPUCount(Number(e.target.value))}>{[1,2,4,8].map(n => <option key={n} value={n}>{n} GPU{n > 1 ? 's' : ''}</option>)}</select><small>Native runs split each local model across the selected GPUs. The model must support this count.</small></label> : <>
              <label>CPU cores<select value={cpuCount} onChange={e => setCPUCount(Number(e.target.value))}>{[2,4,8,16,32].map(n => <option key={n} value={n}>{n} vCPUs</option>)}</select></label>
              <label>Memory<select value={cpuFlavor} onChange={e => setCPUFlavor(e.target.value)}><option value="cpu3c">{cpuCount * 2} GB · compute optimized</option><option value="cpu3g">{cpuCount * 4} GB · general purpose</option></select><small>CPU workers send API requests and compute rankings.</small></label>
            </>}
          </fieldset>
          {computeType === 'gpu' && <>
          <div className="eval-gpu-head"><span className="eval-gpu-label">GPU</span><button type="button" className="eval-link-button" disabled={stockBusy} onClick={() => void checkStock()}>{stockBusy ? 'Checking RunPod…' : 'Check availability'}</button></div>
          <p className="eval-capacity-note" data-warning={selectedStock?.stock === 'None' || selectedStock?.stock === 'Low' || !!stockError} role="status">{capacityMessage}</p>
          <fieldset className="eval-gpu" disabled={!ownKeys && !isAdmin}><legend className="sr-only">GPU</legend><div className="eval-gpu-grid" aria-live="polite">{gpuTypes.map(g => { const item = stock && stock.disk_gb === (ownKeys || isAdmin ? disk + volume : 100) && stock.gpu_count === (ownKeys || isAdmin ? gpuCount : 1) ? stock.gpus.find(x => x.id === g) : undefined; return <label className="eval-choice-card eval-gpu-card" key={g} data-stock={item ? (item.stock === 'None' ? 'none' : item.stock === 'Unknown' ? 'unknown' : 'ok') : undefined}><input type="radio" name="gpu" checked={(ownKeys || isAdmin ? gpu : gpuTypes[0]) === g} onChange={() => setGPU(g)} /><strong>{g.replace('NVIDIA ', '').replace('GeForce ', '')}</strong><small>{item ? <>{item.stock === 'None' ? 'No matching capacity' : item.stock === 'Unknown' ? 'Capacity unconfirmed' : `${item.stock} stock`}{item.price_per_hour != null && ` · $${item.price_per_hour.toFixed(2)}/hr`}</> : stockBusy ? 'Checking capacity…' : 'Capacity not checked'}</small></label>; })}</div><small>GPUs are allocated together on one instance. Model size must fit the selected GPU memory.{!ownKeys && !isAdmin && ' LAISR Lab compute uses the default GPU.'}{stock && stock.disk_gb === (ownKeys || isAdmin ? disk + volume : 100) && stock.gpu_count === (ownKeys || isAdmin ? gpuCount : 1) && ` Secure Cloud · CUDA ${stock.min_cuda_version}+ · ${stock.disk_gb} GB disk · checked ${new Date(stock.checked_at * 1000).toLocaleTimeString()}. Stock can change before allocation.`}</small></fieldset>
          </>}
          <div className="eval-fields"><label>Container storage (GB)<input disabled={!ownKeys && !isAdmin} type="number" min={50} max={Math.min(limits.max_disk_gb ?? 1000,1000)} step={10} value={ownKeys || isAdmin ? disk : 100} onChange={e => setDisk(Number(e.target.value))} /><button type="button" disabled={!ownKeys && !isAdmin} onClick={()=>setDisk(Math.min(limits.max_disk_gb ?? 1000,1000))}>Max allowed</button><small>Model cache and working files. Released after results are saved.</small></label><label>Workspace volume (GB)<input type="number" disabled={!ownKeys && !isAdmin} min={0} max={Math.min(limits.max_disk_gb ?? 1000,1000)} step={10} value={ownKeys || isAdmin ? volume : 0} onChange={e => setVolume(Number(e.target.value))}/><small>Optional /workspace disk. Survives pod restarts; deleted when the pod is terminated. Results are saved separately.</small></label><label>Results<select value={visibility} onChange={e => setVisibility(e.target.value)}><option value="private">Private · only in my account</option><option disabled={!limits.allow_public_results} value="public">Public · list in Experiments</option></select></label></div>
          {visibility === 'public' && <small>Completed rankings, scenarios, responses, and judgments will be visible to everyone. Public results are copied to Hugging Face. Unlisting removes them from the current listing, but repository history and downloaded copies remain public.</small>}
          <AdvancedConfiguration value={advanced} onChange={setAdvanced} modelIds={selected} configVersion={JSON.stringify([advanced, name, engine, selected, custom, criteria, source, count, scenarioText])} getRequest={() => buildRequest(false)} />
        </section>
      </div>
      <aside className="eval-setup eval-summary"><h2>Summary</h2>
        <dl className="eval-summary-list">
          <div><dt>Name</dt><dd>{name.trim() || '—'}</dd></div>
          <div><dt>Models</dt><dd>{selected.length}</dd></div>
          <div><dt>Constitution</dt><dd>{constitution === 'custom' ? 'Custom' : label(constitution)} · {criteria.split('\n').filter(s => s.trim()).length} criteria</dd></div>
          <div><dt>Scenarios</dt><dd>{typeof advancedCount === 'number' ? advancedCount : source === 'airiskdilemmas' ? count : 'Custom'}</dd></div>
          <div><dt>Engine</dt><dd>{engine === 'inspect' ? 'Inspect' : 'Native EigenBench'}</dd></div>
          <div><dt>Compute</dt><dd>{ownKeys ? 'Your keys' : 'LAISR Lab compute'}</dd></div>
          <div><dt>Compute</dt><dd>{computeType === 'cpu' ? `${ownKeys || isAdmin ? cpuCount : 4} vCPUs · ${(ownKeys || isAdmin ? cpuCount : 4) * (ownKeys || isAdmin ? (cpuFlavor === 'cpu3g' ? 4 : 2) : 4)} GB RAM` : `${ownKeys || isAdmin ? gpuCount : 1} × ${(ownKeys || isAdmin ? gpu : gpuTypes[0]).replace('NVIDIA ', '')}`}</dd></div>
          <div><dt>Storage</dt><dd>{ownKeys || isAdmin ? disk + volume : 100} GB total</dd></div>
          <div><dt>Results</dt><dd>{visibility === 'public' ? 'Public' : 'Private'}</dd></div>
          {!ownKeys && limits.require_credits && <div><dt>Credits</dt><dd>{Math.floor((credits ?? 0) / 60)} min</dd></div>}
        </dl>
        <div className="eval-submit"><button className="button-primary" disabled={busy} aria-describedby={blockers.length ? "evaluation-blockers" : undefined}>{busy ? 'Preparing…' : 'Run evaluation →'}</button>{blockers.length>0 && <div id="evaluation-blockers" tabIndex={-1} aria-live="polite"><strong>Before you can run</strong><ul>{blockers.map((message,i)=><li key={i}>{message}</li>)}</ul></div>}{error && <p role="alert">{error}</p>}<small>Runs continue in the background until complete or cancelled.{limits.max_runtime_seconds!==null && ` Admin runtime limit: ${Math.round(limits.max_runtime_seconds/60)} minutes.`}{!ownKeys && limits.require_credits && " Runs also stop when their reserved execution credits are used; unused time is returned."}</small></div>
      </aside>
    </form>}
    {tab === 'runs' && <section className="evaluation-jobs"><h2>Your evaluations</h2>{!runsLoaded && !jobs.length && !runsError && <div className="eval-history-loading" role="status" aria-live="polite" aria-busy="true"><Penguin size={48} state="loading" /><p>Loading your evaluations…</p></div>}{runsError && <div role="alert"><p>{runsError}</p><button type="button" className="button-secondary" disabled={runsRefreshing} onClick={() => setRunsRetry(n => n + 1)}>{runsRefreshing ? 'Retrying…' : 'Retry loading evaluations'}</button></div>}{runsLoaded && !jobs.length && !runsError && <p>No evaluations yet. Submitted runs will appear here.</p>}{jobs.map(job => { const open = openRuns[job.id] ?? isActive(job.state); const body = `run-body-${job.id}`; return <article className={`eval-job${open ? ' is-open' : ''}`} key={job.id}>
      {/* Active runs start open; finished ones stay collapsed until clicked */}
      <button type="button" className="eval-job-toggle" aria-expanded={open} aria-controls={body} onClick={() => setOpenRuns(o => ({ ...o, [job.id]: !open }))}><span className="eval-state" data-state={job.state}>{job.state === 'succeeded' ? 'Completed' : label(job.state)}</span><span className="eval-job-title"><strong>{job.name}</strong><small>{job.constitution} · {job.models_count} models · {job.scenario_count} scenarios · {job.visibility} · {job.engine === 'inspect' ? 'Inspect' : 'Native'}</small></span><span className="eval-job-chevron" aria-hidden="true" /></button>
      {job.state === 'succeeded' && <div className="eval-result-links"><a className="button-primary" href={`/run/?slug=account/${job.id}`}>View results →</a><a className="button-secondary" href={`/transcript/?run=account/${job.id}`}>Transcripts</a><span>Rankings and individual judgments</span></div>}
      <div className="eval-job-body" id={body} inert={!open}><div className="eval-job-inner">{job.state === 'failed' && ['gpu_unavailable', 'allocation_rejected', 'worker_start_timeout'].includes(job.error_code || '') && <button type="button" onClick={() => void prepareRetry(job)}>Retry / choose another GPU</button>}{open && <RunMonitor job={job} onUpdate={updated=>setJobs(current=>current.map(j=>j.id===updated.id?updated:j))}/>}{job.publication && <p role="status">{job.publication.state === 'published' ? <a href={`/run/?slug=${encodeURIComponent(job.publication.slug || '')}`}>Published in Experiments ↗</a> : job.publication.state === 'failed' ? job.publication.error : job.publication.state === 'unpublished' ? 'Unlisted from Experiments. Earlier public copies may still exist.' : job.publication.state === 'unpublishing' ? 'Removing public listing…' : 'Publishing to Hugging Face…'}</p>}<div className="eval-actions">{job.state === 'succeeded' && <><button onClick={() => void action(job, 'visibility', { visibility: job.visibility === 'public' ? 'private' : 'public' })}>{job.visibility === 'public' ? 'Unlist public results' : 'Publish to Experiments'}</button></>}{job.has_artifacts && <button onClick={() => void download(job)}>Download</button>}</div></div></div></article>; })}</section>}

  </>;
}
