'use client';
import { useEffect, useState } from 'react';
import { fetchIndex, fetchSummary } from '@/lib/hf';
import { experimentGroup, validRows, interval } from '@/lib/chart-data';
import { CONSTITUTIONS_DATA } from '@/lib/constitutions-data';
import { ModelLogo } from './ModelLogo';
import { labColor } from '@/lib/labs';
import type { IndexRun, Summary } from '@/lib/types';

type Run = { run: IndexRun; rows: Summary };
export function useCarouselData() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    void fetchIndex().then(async index => {
      const groups = new Map<string, IndexRun[]>();
      for (const run of index.runs) {
        const group = experimentGroup(run);
        if (!group || !run.constitution || /deprecated/i.test(String(run.note ?? ''))) continue;
        const entries = groups.get(group) ?? [];
        if (!entries.some(r => r.constitution === run.constitution)) entries.push(run);
        groups.set(group, entries);
      }
      const panel = [...groups.values()].sort((a, b) => b.length - a.length)[0]?.slice(0, 6);
      if (!panel || panel.length < 3) throw Error('No multi-constitution panel');
      const loaded = await Promise.all(panel.map(async run => ({ run, rows: validRows(await fetchSummary(run.slug)) })));
      if (!loaded.every(r => r.rows.length > 1)) throw Error('Insufficient scores');
      if (live) setRuns(loaded);
    }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, []);
  return { runs, error };
}
const shortModel = (name: string) => name.replace(/^Qwen2.5-7B-Instruct_/, 'Qwen · ');
const label = (r: Run) => r.run.constitution?.replace(/^oct_/, '') ?? r.run.slug;
export function RadarChart({ runs }: { runs: Run[] }) {
  const common = runs.length ? runs[0].rows.filter(row => runs.every(r => r.rows.some(x => x.model_name === row.model_name))).map(r => r.model_name) : [];
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState('');
  const model = common.includes(selected) ? selected : common[0];
  if (!model) return <p>No shared model panel is available.</p>;
  const scores = runs.map(r => {
    const value = r.rows.find(row => row.model_name === model)!.elo_mean;
    const below = r.rows.filter(row => row.elo_mean < value).length;
    const tied = r.rows.filter(row => row.elo_mean === value).length;
    return { value, rank: (below + (tied - 1) / 2) / (r.rows.length - 1) };
  });
  const color = labColor(model);
  const point = (i: number, value: number) => { const a = i * 2 * Math.PI / runs.length - Math.PI / 2; return [220 + Math.cos(a) * 100 * value, 150 + Math.sin(a) * 100 * value]; };
  return <>
    <select aria-label="Model for trait radar" value={model} onChange={e => { setSelected(e.target.value); setDetail(''); }}>{common.map(m => <option key={m} value={m}>{shortModel(m)}</option>)}</select>
    <svg className="carousel-radar" viewBox="0 0 440 300" aria-label={`Within-run rank profile of ${model}. Focus or tap a point for its score.`} role="group">
      {[.25,.5,.75,1].map(v => <g key={v}><polygon points={runs.map((_, i) => point(i, v).join(',')).join(' ')} fill="none" stroke="var(--border-light)" strokeWidth="1" /><text className="radar-scale" x="226" y={150-100*v+4}>{v*100}</text></g>)}
      {runs.map((r, i) => { const p = point(i, 1), t = point(i, 1.16), dx = t[0]-220; return <g key={r.run.slug}><line x1="220" y1="150" x2={p[0]} y2={p[1]} stroke="var(--border-light)" /><text className="radar-trait" x={t[0]} y={t[1]} textAnchor={Math.abs(dx)<1?'middle':dx>0?'start':'end'} dominantBaseline="middle">{label(r).replace(/^./,c=>c.toUpperCase())}</text></g>; })}
      <polygon points={scores.map((s, i) => point(i, s.rank).join(',')).join(' ')} fill={color} fillOpacity=".045" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {scores.map((s,i) => { const p = point(i,s.rank), text = `${label(runs[i])}: ${s.value.toFixed(0)} Elo · ${Math.round(s.rank * 100)}% relative rank`; return <g key={i} className="radar-point" tabIndex={0} role="button" aria-label={text} onMouseEnter={() => setDetail(text)} onFocus={() => setDetail(text)} onClick={() => setDetail(text)} onKeyDown={e => {if(e.key==='Enter'||e.key===' ') { e.preventDefault();setDetail(text); }}}><title>{text}</title><circle cx={p[0]} cy={p[1]} r="22" fill="transparent" /><circle cx={p[0]} cy={p[1]} r="5.5" fill={color} stroke="var(--bg-elevated)" strokeWidth="2" /></g>; })}
    </svg>
    <div className="radar-model-key"><ModelLogo name={model} size={18}/><span style={{background:color}} aria-hidden="true"/>{shortModel(model)}</div>
    <p className="carousel-chart-detail radar-detail" aria-live="polite">{detail || 'Relative rank · 0 lowest / 100 highest'}</p>
    <p className="carousel-chart-note">Each axis ranks models within its own run. {experimentGroup(runs[0].run)}.</p>
  </>;
}

export function PromptChart() {
  const [mode, setMode] = useState<'character'|'prompt'>('character');
  const rows = [{ name:'Loving', character:95.2, prompt:4.8 },{ name:'Sarcasm', character:71.2, prompt:28.8 },{ name:'Misalignment', character:42.6, prompt:57.4 }];
  return <>
    <div className="carousel-chart-switch"><button aria-pressed={mode==='character'} onClick={() => setMode('character')}>Training</button><button aria-pressed={mode==='prompt'} onClick={() => setMode('prompt')}>Prompting</button></div>
    <svg viewBox="0 0 360 238" role="img" aria-label={`Share of reported score variance attributed to ${mode === 'character' ? 'training' : 'prompting'}`}>
      {rows.map((row,i) => <g key={row.name}><text x="12" y={32+i*64}>{row.name}</text><rect x="12" y={43+i*64} width="286" height="17" rx="3" fill="var(--border)" /><rect x="12" y={43+i*64} width={row[mode]*2.86} height="17" rx="3" fill="var(--accent)" /><text x="345" y={56+i*64} textAnchor="end">{row[mode]}%</text></g>)}
    </svg>
    <p className="carousel-chart-detail">Share of score variance attributed to {mode === 'character' ? 'training' : 'prompting'}.</p>
    <a className="carousel-chart-note" href="/research/character-training/#training-and-prompts">Paper’s ANOVA split · not trait retention ↗</a>
  </>;
}

export function RankingChart({ runs }: { runs: Run[] }) {
  const [selected, setSelected] = useState(0);
  const run = runs[selected] ?? runs[0];
  const rows = [...run.rows].sort((a,b) => b.elo_mean-a.elo_mean).slice(0,5);
  return <>
    <select aria-label="Ranking constitution" value={selected} onChange={e => setSelected(Number(e.target.value))}>{runs.map((r,i) => <option key={r.run.slug} value={i}>{label(r)}</option>)}</select>
    <ol className="carousel-ranking">{rows.map((r,i) => <li key={r.model_name}><span className="carousel-rank">{i+1}</span><ModelLogo name={r.model_name} size={20}/><span className="carousel-model" title={r.model_name}>{shortModel(r.model_name)}{interval(r) && <small>95% interval {Math.round(interval(r)![0])}–{Math.round(interval(r)![1])}</small>}</span><strong>{Math.round(r.elo_mean)}<small>Elo</small></strong></li>)}</ol>
    <a className="carousel-chart-note" href={`/run/?slug=${encodeURIComponent(run.run.slug)}`}>Full ranking and judgments ↗</a>
  </>;
}

export function RankShiftChart({ runs }: { runs: Run[] }) {
  const [selected, setSelected] = useState(1);
  const a = runs[0], b = runs[selected] ?? runs[1];
  const rank = (r: Run, value: number) => 1+r.rows.filter(x => x.elo_mean>value).length;
  const points = a.rows.flatMap(row => { const other = b.rows.find(x => x.model_name===row.model_name);return other ? [{name:row.model_name,a:rank(a,row.elo_mean),b:rank(b,other.elo_mean)}] : []; }).sort((a,b) => Math.abs(b.a-b.b)-Math.abs(a.a-a.b)).slice(0,5);
  const [selectedModel, setSelectedModel] = useState('');
  const model = points.find(p => p.name===selectedModel) ?? points[0];
  const max = Math.max(a.rows.length,b.rows.length), y = (n:number) => 45+(n-1)/(max-1)*155;
  return <>
    <select aria-label="Compare ranking with constitution" value={selected} onChange={e => setSelected(Number(e.target.value))}>{runs.slice(1).map((r,i) => <option key={r.run.slug} value={i+1}>{label(a)} vs. {label(r)}</option>)}</select>
    <svg viewBox="0 0 360 238" role="img" aria-label="Five models with the largest rank changes between selected runs">
      <text x="55" y="21" textAnchor="middle">{label(a)}</text><text x="305" y="21" textAnchor="middle">{label(b)}</text>
      {[1,max].map(n => <g key={n}><line x1="55" x2="305" y1={y(n)} y2={y(n)} stroke="var(--border)" strokeDasharray="3 5" /><text x="15" y={y(n)+4}>#{n}</text></g>)}
      {points.map(p => <g key={p.name} tabIndex={0} role="button" aria-label={`${p.name}, rank ${p.a} to ${p.b}`} onMouseEnter={() => setSelectedModel(p.name)} onFocus={() => setSelectedModel(p.name)} onClick={() => setSelectedModel(p.name)} onKeyDown={e => { if(e.key==='Enter'||e.key===' ') {e.preventDefault();setSelectedModel(p.name);} }} style={{cursor:'pointer'}}>
        <path d={`M55 ${y(p.a)} C145 ${y(p.a)},215 ${y(p.b)},305 ${y(p.b)}`} stroke="transparent" strokeWidth="14" fill="none" />
        <path d={`M55 ${y(p.a)} C145 ${y(p.a)},215 ${y(p.b)},305 ${y(p.b)}`} stroke={p===model?'var(--chart-blue)':'var(--border)'} strokeWidth={p===model?3:2} fill="none" />
        <circle cx="55" cy={y(p.a)} r="5" fill={p===model?'var(--chart-blue)':'var(--text-muted)'}/><circle cx="305" cy={y(p.b)} r="5" fill={p===model?'var(--chart-blue)':'var(--text-muted)'}/>
      </g>)}
    </svg>
    <p className="carousel-chart-detail">{model && <><strong>{shortModel(model.name)}</strong><br/>#{model.a} → #{model.b}</>}</p>
    <p className="carousel-chart-note">Five largest shifts. Rank 1 is highest; tied scores share a rank.</p>
  </>;
}

export function ConstitutionCard() {
  const choices = ['humor','sarcasm','goodness','loving'].filter(c => CONSTITUTIONS_DATA[c]);
  const [selected,setSelected] = useState(choices[0]);
  const [criterion,setCriterion] = useState(0);
  const criteria = CONSTITUTIONS_DATA[selected] ?? [];
  return <>
    <div className="constitution-chips" role="group" aria-label="Constitution">{choices.map(c => <button key={c} aria-pressed={c===selected} onClick={() => {setSelected(c);setCriterion(0);}}>{c}</button>)}</div>
    <div className="carousel-constitution"><span>Criterion {criterion+1} of {criteria.length}</span><blockquote>{criteria[criterion]}</blockquote></div>
    <div className="criterion-controls"><button aria-label="Previous criterion" onClick={() => setCriterion((criterion+criteria.length-1)%criteria.length)}>←</button><button aria-label="Next criterion" onClick={() => setCriterion((criterion+1)%criteria.length)}>→</button><a href={`/constitution/?id=${selected}`}>Read constitution</a></div>
    <p className="carousel-chart-note">The written criteria used to judge responses.</p>
  </>;
}
