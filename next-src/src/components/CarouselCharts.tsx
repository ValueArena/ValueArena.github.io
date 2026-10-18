'use client';
import { useEffect, useId, useState } from 'react';
import { fetchIndex, fetchSummary } from '@/lib/hf';
import { experimentGroup, validRows, interval } from '@/lib/chart-data';
import { CONSTITUTIONS_DATA } from '@/lib/constitutions-data';
import { BoardIcon, Delta, LogoTile } from './hub/ui';
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
const title = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** A styled native select, so every card keeps keyboard and screen-reader support. */
function Picker({ label: aria, value, onChange, children }: { label: string; value: string | number; onChange: (v: string) => void; children: React.ReactNode }) {
  return <label className="carousel-picker"><select aria-label={aria} value={value} onChange={e => onChange(e.target.value)}>{children}</select>
    <svg viewBox="0 0 12 12" width={12} height={12} aria-hidden="true"><path d="m3 4.5 3 3 3-3" /></svg></label>;
}

export function RadarChart({ runs }: { runs: Run[] }) {
  const common = runs.length ? runs[0].rows.filter(row => runs.every(r => r.rows.some(x => x.model_name === row.model_name))).map(r => r.model_name) : [];
  const [selected, setSelected] = useState('');
  const [focus, setFocus] = useState<number | null>(null);
  const gradient = `radar-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const model = common.includes(selected) ? selected : common[0];
  if (!model) return <p>No shared model panel is available.</p>;
  const scores = runs.map(r => {
    const value = r.rows.find(row => row.model_name === model)!.elo_mean;
    const below = r.rows.filter(row => row.elo_mean < value).length;
    const tied = r.rows.filter(row => row.elo_mean === value).length;
    return { value, rank: (below + (tied - 1) / 2) / (r.rows.length - 1), place: 1 + r.rows.filter(row => row.elo_mean > value).length, of: r.rows.length };
  });
  const point = (i: number, value: number) => { const a = i * 2 * Math.PI / runs.length - Math.PI / 2; return [220 + Math.cos(a) * 92 * value, 140 + Math.sin(a) * 92 * value]; };
  const shown = focus ?? scores.reduce((best, s, i) => (s.rank > scores[best].rank ? i : best), 0);
  const s = scores[shown];
  return <>
    <Picker label="Model for trait radar" value={model} onChange={v => { setSelected(v); setFocus(null); }}>{common.map(m => <option key={m} value={m}>{shortModel(m)}</option>)}</Picker>
    <svg className="carousel-radar" viewBox="0 0 440 280" aria-label={`Within-run rank profile of ${model}. Focus or tap a point for its score.`} role="group">
      <defs><radialGradient id={gradient}><stop offset="0" stopColor="var(--s1)" stopOpacity=".08" /><stop offset="1" stopColor="var(--s1)" stopOpacity=".26" /></radialGradient></defs>
      {[.25, .5, .75, 1].map(v => <polygon key={v} points={runs.map((_, i) => point(i, v).join(',')).join(' ')} className={v === 1 ? 'radar-ring radar-ring-outer' : 'radar-ring'} />)}
      {runs.map((r, i) => { const p = point(i, 1), t = point(i, 1.2), dx = t[0] - 220; return <g key={r.run.slug}>
        <line x1="220" y1="140" x2={p[0]} y2={p[1]} className="radar-ring" />
        <text className="radar-trait" x={t[0]} y={t[1]} textAnchor={Math.abs(dx) < 1 ? 'middle' : dx > 0 ? 'start' : 'end'} dominantBaseline="middle" data-on={i === shown || undefined}>{title(label(r))}</text>
      </g>; })}
      <polygon points={scores.map((sc, i) => point(i, sc.rank).join(',')).join(' ')} fill={`url(#${gradient})`} className="radar-area" />
      {scores.map((sc, i) => { const p = point(i, sc.rank), text = `${label(runs[i])}: ${sc.value.toFixed(0)}, #${sc.place} of ${sc.of}`; return <g key={i} className="radar-point" data-on={i === shown || undefined} tabIndex={0} role="button" aria-label={text}
        onMouseEnter={() => setFocus(i)} onFocus={() => setFocus(i)} onClick={() => setFocus(i)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFocus(i); } }}>
        <title>{text}</title><circle cx={p[0]} cy={p[1]} r="16" fill="transparent" /><circle cx={p[0]} cy={p[1]} r={i === shown ? 6.5 : 4.5} className="radar-dot" />
      </g>; })}
    </svg>
    <div className="carousel-stat" aria-live="polite">
      <LogoTile name={model} size={30} />
      <span><small>{title(label(runs[shown]))}</small><strong>{shortModel(model)}</strong></span>
      <span className="carousel-stat-value"><strong>#{s.place}</strong><small>of {s.of} · {s.value.toFixed(0)}</small></span>
    </div>
    <p className="carousel-chart-note">Each axis ranks models within its own run; further out is higher. {experimentGroup(runs[0].run)}.</p>
  </>;
}

export function PromptChart() {
  const [mode, setMode] = useState<'character' | 'prompt'>('character');
  const rows = [{ name: 'Loving', character: 95.2, prompt: 4.8 }, { name: 'Sarcasm', character: 71.2, prompt: 28.8 }, { name: 'Misalignment', character: 42.6, prompt: 57.4 }];
  return <>
    <div className="hub-tabs carousel-tabs" role="tablist" aria-label="Source of variance">
      <button role="tab" aria-selected={mode === 'character'} onClick={() => setMode('character')}>Training</button>
      <button role="tab" aria-selected={mode === 'prompt'} onClick={() => setMode('prompt')}>Prompting</button>
    </div>
    <ul className="carousel-bars" aria-label={`Share of score variance attributed to ${mode === 'character' ? 'training' : 'prompting'}`}>
      {rows.map(row => <li key={row.name}>
        <span className="carousel-bars-head"><BoardIcon constitution={row.name.toLowerCase()} /><span>{row.name}</span><strong>{row[mode].toFixed(1)}%</strong></span>
        <span className="carousel-bars-track"><span style={{ width: `${row[mode]}%` }} /></span>
      </li>)}
    </ul>
    <p className="carousel-chart-detail">Share of each trait’s score variance that comes from {mode === 'character' ? 'character training' : 'the system prompt'}.</p>
    <a className="carousel-chart-note" href="/research/character-training/#training-and-prompts">Paper’s ANOVA split · not trait retention ↗</a>
  </>;
}

export function RankingChart({ runs }: { runs: Run[] }) {
  const [selected, setSelected] = useState(0);
  const run = runs[selected] ?? runs[0];
  const rows = [...run.rows].sort((a, b) => b.elo_mean - a.elo_mean).slice(0, 5);
  const ends = rows.flatMap(r => interval(r) ?? [r.elo_mean]);
  const lo = Math.min(...ends), hi = Math.max(...ends), x = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;
  return <>
    <Picker label="Ranking constitution" value={selected} onChange={v => setSelected(Number(v))}>{runs.map((r, i) => <option key={r.run.slug} value={i}>{title(label(r))}</option>)}</Picker>
    <ol className="carousel-ranking">{rows.map((r, i) => { const ci = interval(r); return <li key={r.model_name}>
      <span className="carousel-rank">{i + 1}</span>
      <LogoTile name={r.model_name} size={28} />
      <span className="carousel-model" title={r.model_name}>{shortModel(r.model_name)}
        <span className="carousel-ci" aria-hidden="true">{ci && <span className="carousel-ci-bar" style={{ left: `${x(ci[0])}%`, width: `${x(ci[1]) - x(ci[0])}%` }} />}<span className="carousel-ci-dot" style={{ left: `${x(r.elo_mean)}%` }} /></span>
      </span>
      <strong>{Math.round(r.elo_mean)}{ci && <small>±{Math.round((ci[1] - ci[0]) / 2)}</small>}</strong>
    </li>; })}</ol>
    <a className="carousel-chart-note" href={`/run/?slug=${encodeURIComponent(run.run.slug)}`}>Bars are 95% intervals · full ranking and judgments ↗</a>
  </>;
}

export function RankShiftChart({ runs }: { runs: Run[] }) {
  const [selected, setSelected] = useState(1);
  const a = runs[0], b = runs[selected] ?? runs[1];
  const rank = (r: Run, value: number) => 1 + r.rows.filter(x => x.elo_mean > value).length;
  const points = a.rows.flatMap(row => { const other = b.rows.find(x => x.model_name === row.model_name); return other ? [{ name: row.model_name, a: rank(a, row.elo_mean), b: rank(b, other.elo_mean) }] : []; }).sort((p, q) => Math.abs(q.a - q.b) - Math.abs(p.a - p.b)).slice(0, 5);
  const [selectedModel, setSelectedModel] = useState('');
  const model = points.find(p => p.name === selectedModel) ?? points[0];
  const max = Math.max(a.rows.length, b.rows.length), y = (n: number) => 34 + (n - 1) / (max - 1) * 150;
  const curve = (p: { a: number; b: number }) => `M70 ${y(p.a)} C160 ${y(p.a)},200 ${y(p.b)},290 ${y(p.b)}`;
  return <>
    <Picker label="Compare ranking with constitution" value={selected} onChange={v => setSelected(Number(v))}>{runs.slice(1).map((r, i) => <option key={r.run.slug} value={i + 1}>{title(label(a))} vs. {title(label(r))}</option>)}</Picker>
    <svg className="carousel-bump" viewBox="0 0 360 206" role="img" aria-label="Five models with the largest rank changes between selected runs">
      <text x="70" y="14" textAnchor="middle" className="bump-head">{title(label(a))}</text><text x="290" y="14" textAnchor="middle" className="bump-head">{title(label(b))}</text>
      {[1, max].map(n => <g key={n}><line x1="70" x2="290" y1={y(n)} y2={y(n)} className="bump-grid" /><text x="30" y={y(n) + 4} textAnchor="middle" className="bump-axis">#{n}</text></g>)}
      {points.filter(p => p !== model).map(p => <g key={p.name} tabIndex={0} role="button" aria-label={`${p.name}, rank ${p.a} to ${p.b}`} onMouseEnter={() => setSelectedModel(p.name)} onFocus={() => setSelectedModel(p.name)} onClick={() => setSelectedModel(p.name)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedModel(p.name); } }} style={{ cursor: 'pointer' }}>
        <path d={curve(p)} stroke="transparent" strokeWidth="16" fill="none" />
        <path d={curve(p)} className="bump-line" />
        <circle cx="70" cy={y(p.a)} r="4" className="bump-dot" /><circle cx="290" cy={y(p.b)} r="4" className="bump-dot" />
      </g>)}
      {model && <g className="bump-on">
        <path d={curve(model)} className="bump-line-on" />
        <circle cx="70" cy={y(model.a)} r="6" className="bump-dot-on" /><circle cx="290" cy={y(model.b)} r="6" className="bump-dot-on" />
        <text x="58" y={y(model.a) + 4} textAnchor="end" className="bump-rank">#{model.a}</text><text x="302" y={y(model.b) + 4} className="bump-rank">#{model.b}</text>
      </g>}
    </svg>
    {model && <div className="carousel-stat" aria-live="polite">
      <LogoTile name={model.name} size={30} />
      <span><small>Biggest movers</small><strong>{shortModel(model.name)}</strong></span>
      <span className="carousel-stat-value"><strong>#{model.a} → #{model.b}</strong><Delta value={model.a - model.b} /></span>
    </div>}
    <p className="carousel-chart-note">Five largest rank shifts. Rank 1 is highest; tied scores share a rank.</p>
  </>;
}

export function ConstitutionCard() {
  const choices = ['humor', 'sarcasm', 'goodness', 'loving'].filter(c => CONSTITUTIONS_DATA[c]);
  const [selected, setSelected] = useState(choices[0]);
  const [criterion, setCriterion] = useState(0);
  const criteria = CONSTITUTIONS_DATA[selected] ?? [];
  return <>
    <div className="hub-tabs carousel-tabs" role="tablist" aria-label="Constitution">{choices.map(c => <button key={c} role="tab" aria-selected={c === selected} onClick={() => { setSelected(c); setCriterion(0); }}>{title(c)}</button>)}</div>
    <div className="carousel-constitution">
      <span className="carousel-constitution-n"><BoardIcon constitution={selected} />Criterion {criterion + 1} of {criteria.length}</span>
      <blockquote>{criteria[criterion]}</blockquote>
      <span className="carousel-steps" aria-hidden="true">{criteria.map((_, i) => <i key={i} data-on={i === criterion || undefined} />)}</span>
    </div>
    <div className="criterion-controls"><button aria-label="Previous criterion" onClick={() => setCriterion((criterion + criteria.length - 1) % criteria.length)}>←</button><button aria-label="Next criterion" onClick={() => setCriterion((criterion + 1) % criteria.length)}>→</button><a href={`/constitution/?id=${selected}`}>Read the constitution →</a></div>
    <p className="carousel-chart-note">The written criteria judges score each answer against.</p>
  </>;
}
