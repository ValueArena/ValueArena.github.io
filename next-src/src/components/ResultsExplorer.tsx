'use client';

import { useEffect, useMemo, useState } from 'react';
import { Penguin } from './Penguin';
import { ModelLogo } from './ModelLogo';
import { fetchIndex, fetchMeta, fetchSummary } from '@/lib/hf';
import { constLabel, normConst } from '@/lib/nicks';
import { detectLab, LAB_COLORS } from '@/lib/labs';
import { comparisonIssues, experimentGroup, extent, interval, sharedRows, validRows } from '@/lib/chart-data';
import type { IndexRun, MetaJson, SummaryRow } from '@/lib/types';

interface Loaded { slug: string; rows: SummaryRow[]; meta: MetaJson }
const fmt = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 1 });
const label = (run?: IndexRun) => run ? constLabel(normConst(run.constitution)) : '';
const ticks = (domain: [number, number]) => Array.from({ length: 5 }, (_, i) => domain[0] + (domain[1] - domain[0]) * i / 4);
const position = (v: number, domain: [number, number], start: number, size: number) => start + (v - domain[0]) / (domain[1] - domain[0]) * size;
const runURL = (slug: string) => `/run/?slug=${encodeURIComponent(slug)}`;
const transcriptURL = (slug: string, model: string) => `/transcript/?run=${encodeURIComponent(slug)}&model=${encodeURIComponent(model)}`;

function useRun(slug: string) {
  const [value, setValue] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setValue(null); setError('');
    if (slug) Promise.all([fetchSummary(slug), fetchMeta(slug)]).then(([rows, meta]) => {
      if (!cancelled) setValue({ slug, rows: validRows(rows), meta });
    }).catch(() => { if (!cancelled) setError('Could not load this run. Choose another run or reload the page.'); });
    return () => { cancelled = true; };
  }, [slug]);
  return { value: value?.slug === slug ? value : null, error };
}

export function ResultsExplorer({ embedded = false }: { embedded?: boolean }) {
  const [runs, setRuns] = useState<IndexRun[]>([]);
  const [ready, setReady] = useState(false);
  const [indexError, setIndexError] = useState('');
  const [view, setView] = useState<'ranking' | 'tradeoff'>(embedded ? 'tradeoff' : 'ranking');
  const [xSlug, setXSlug] = useState('');
  const [ySlug, setYSlug] = useState('');
  const [selected, setSelected] = useState('');
  const [hovered, setHovered] = useState('');
  const [family, setFamily] = useState('');
  const [query, setQuery] = useState('');
  const [showCI, setShowCI] = useState(true);
  const [shareStatus, setShareStatus] = useState('');
  useEffect(() => {
    let cancelled = false;
    fetchIndex().then(index => {
      if (cancelled) return;
      const list = [...(index.runs || [])].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
      const params = new URLSearchParams(embedded ? 'view=tradeoff' : location.search);
      const preferred = list.find(r => r.slug === 'humor-prompted-lls-22/humor') || list.find(r => !/deprecated/i.test(`${r.name} ${r.note}`)) || list[0];
      const first = list.find(r => r.slug === params.get('x')) || preferred;
      const second = list.find(r => r.slug === params.get('y')) || list.find(r => experimentGroup(r) && experimentGroup(r) === (first && experimentGroup(first)) && normConst(r.constitution) !== normConst(first?.constitution));
      setRuns(list); setXSlug(first?.slug || ''); setYSlug(second?.slug || '');
      setView(params.get('view') === 'tradeoff' ? 'tradeoff' : 'ranking');
      setSelected(params.get('model') || ''); setFamily(params.get('family') || ''); setQuery(params.get('q') || ''); setShowCI(params.get('ci') !== '0');
      setReady(true);
    }).catch(() => { if (!cancelled) setIndexError('Could not load the experiment index. Reload to try again.'); });
    return () => { cancelled = true; };
  }, [embedded]);
  useEffect(() => {
    if (!ready || embedded) return;
    const params = new URLSearchParams();
    params.set('view', view); if (xSlug) params.set('x', xSlug);
    if (view === 'tradeoff' && ySlug) params.set('y', ySlug);
    if (selected) params.set('model', selected); if (family) params.set('family', family);
    if (query) params.set('q', query); if (!showCI) params.set('ci', '0');
    history.replaceState(null, '', `${location.pathname}?${params}`);
    setShareStatus('');
  }, [ready, view, xSlug, ySlug, selected, family, query, showCI, embedded]);
  const x = useRun(xSlug), y = useRun(view === 'tradeoff' ? ySlug : '');
  const xRun = runs.find(r => r.slug === xSlug), yRun = runs.find(r => r.slug === ySlug);
  const constitutions = [...new Set(runs.map(r => normConst(r.constitution)).filter(Boolean))].sort();
  const [yConstitution, setYConstitution] = useState('');
  const yOptions = runs.filter(r => normConst(r.constitution) !== normConst(xRun?.constitution) && experimentGroup(r) && experimentGroup(r) === (xRun && experimentGroup(xRun)));
  const issues = view === 'tradeoff' && xRun && yRun && x.value && y.value ? comparisonIssues(xRun, yRun, x.value.meta, y.value.meta) : [];
  const paired = useMemo(() => sharedRows(x.value?.rows || [], y.value?.rows || []), [x.value, y.value]);
  const allRows = view === 'ranking' ? x.value?.rows || [] : paired.map(p => p.x);
  const familyOf = (name: string) => {
    const model = x.value?.meta.models?.[name];
    const identity = `${model?.id || ''} ${model?.base_model || ''} ${name}`;
    if (/olmo|allenai/i.test(identity)) return 'Ai2';
    if (/grok|xai/i.test(identity)) return 'xAI';
    return detectLab(identity);
  };
  const colorOf = (name: string) => ({ Ai2: '#b77938', xAI: '#687985', ...LAB_COLORS }[familyOf(name)] || LAB_COLORS.Other);
  const families = [...new Set(allRows.map(r => familyOf(r.model_name)))].sort();
  const rows = [...allRows].filter(r => (!family || familyOf(r.model_name) === family) && r.model_name.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.elo_mean - a.elo_mean);
  const points = paired.filter(p => rows.some(r => r.model_name === p.name));
  const focused = hovered || selected;
  const detail = allRows.find(r => r.model_name === focused);
  const yDetail = paired.find(p => p.name === focused)?.y;
  const domain = extent(x.value?.rows || []), yDomain = extent(y.value?.rows || []);
  const chooseX = (slug: string) => {
    const first = runs.find(r => r.slug === slug);
    setXSlug(slug); setSelected(''); setHovered(''); setFamily(''); setQuery('');
    const other = runs.find(r => experimentGroup(r) && experimentGroup(r) === (first && experimentGroup(first)) && normConst(r.constitution) !== normConst(first?.constitution));
    setYSlug(other?.slug || ''); setYConstitution('');
  };
  const choose = (name: string) => { setSelected(name); setHovered(''); };
  const chartReady = Boolean(x.value && (view === 'ranking' || (y.value && !issues.length)));
  if (indexError) return <p role="alert" className="chart-message">{indexError}</p>;
  if (!ready) return <p role="status" className="chart-message chart-loading"><Penguin size={36} state="loading" /><span>Loading experiments…</span></p>;
  if (!runs.length) return <p className="chart-message">No published runs yet.</p>;
  return <section className={`results-explorer${embedded ? ' home-tradeoff' : ''}`} aria-label="Interactive results">
    {!embedded && <><div className="explorer-tabs" role="group" aria-label="Chart type">
      <button aria-pressed={view === 'ranking'} onClick={() => { setView('ranking'); setHovered(''); }}>Rankings</button>
      <button aria-pressed={view === 'tradeoff'} onClick={() => { setView('tradeoff'); setHovered(''); }}>Tradeoffs</button>
      <button className="chart-share" onClick={async () => { try { await navigator.clipboard.writeText(location.href); setShareStatus('Link copied'); } catch { setShareStatus('Copy the address from your browser to share this view.'); } }}>Share view ↗</button>
      <span role="status" className="chart-share-status">{shareStatus}</span>
    </div>
    <div className="explorer-controls">
      <label><span>{view === 'tradeoff' ? 'Horizontal axis' : 'Constitution'}</span><select value={normConst(xRun?.constitution)} onChange={e => { const match = runs.find(r => normConst(r.constitution) === e.target.value && !/deprecated/i.test(`${r.name} ${r.note}`)) || runs.find(r => normConst(r.constitution) === e.target.value); if (match) chooseX(match.slug); }}>{constitutions.map(c => <option key={c} value={c}>{constLabel(normConst(c))}</option>)}</select></label>
      <label className="explorer-run-select"><span>Experiment run</span><select value={xSlug} onChange={e => chooseX(e.target.value)}>{runs.filter(r => normConst(r.constitution) === normConst(xRun?.constitution)).map(r => <option key={r.slug} value={r.slug}>{r.name || r.slug}</option>)}</select></label>
      {view === 'tradeoff' && <><label><span>Vertical axis</span><select value={normConst(yRun?.constitution) || yConstitution} onChange={e => { setYConstitution(e.target.value); setYSlug(yOptions.find(r => normConst(r.constitution) === e.target.value)?.slug || ''); setHovered(''); }}>{!yOptions.length && <option value="">No paired constitution</option>}{[...new Set(yOptions.map(r => normConst(r.constitution)))].map(c => <option key={c} value={c}>{constLabel(normConst(c))}</option>)}</select></label><label className="explorer-run-select"><span>Paired run</span><select value={ySlug} onChange={e => { setYSlug(e.target.value); setHovered(''); }}>{!yOptions.length && <option value="">No paired run</option>}{yOptions.filter(r => normConst(r.constitution) === normConst(yRun?.constitution)).map(r => <option key={r.slug} value={r.slug}>{r.name || r.slug}</option>)}</select></label></>}
    </div>
    </>}
    <div className="chart-tools">
      {!embedded && <><label><span className="sr-only">Search models</span><input placeholder="Find a model…" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <label><span className="sr-only">Model family</span><select value={family} onChange={e => setFamily(e.target.value)}><option value="">All model families</option>{families.map(f => <option key={f}>{f}</option>)}</select></label>
      </>}<label className="chart-ci-toggle"><input type="checkbox" checked={showCI} onChange={e => setShowCI(e.target.checked)} />95% intervals</label>
      <span>{rows.length} of {allRows.length} models</span>
    </div>
    {/deprecated/i.test(`${xRun?.name} ${xRun?.note} ${yRun?.name} ${yRun?.note}`) && <p className="chart-message" role="status">One of these runs is deprecated. Read its notes before trusting the results.</p>}
    {(x.error || (view === 'tradeoff' && y.error)) ? <p className="chart-message" role="alert">{x.error || y.error}</p> : view === 'tradeoff' && !ySlug ? <p className="chart-message">This experiment only covers one constitution. Pick a run from an experiment that covers two or more.</p> : !x.value || (view === 'tradeoff' && !y.value) ? <p className="chart-message chart-loading" role="status"><Penguin size={36} state="loading" /><span>Loading scores and run settings…</span></p> : issues.length ? <div className="chart-message" role="status"><strong>These two runs can’t be compared directly.</strong><ul>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul><a href={runURL(xSlug)}>Open the first run →</a></div> : !rows.length ? <p className="chart-message">No matching models. Try clearing the search or family filter.</p> : <>
      {!embedded && <header className="chart-heading"><h2>{view === 'ranking' ? `${label(xRun)}: model rankings` : `${label(xRun)} and ${label(yRun)}`}</h2><p>{view === 'ranking' ? 'A higher score means the answers fit the constitution better.' : 'Each axis is Elo within its own run. Higher means more of that trait, which isn’t always a good thing.'}</p></header>}
      {view === 'ranking' ? <div className="ranking-figure" role="group" aria-label={`${label(xRun)} rankings with confidence intervals`}>
        <div className="ranking-axis"><span>Model</span><svg viewBox="0 0 600 30" aria-hidden="true">{ticks(domain).map(t => <text key={t} x={position(t, domain, 20, 560)} y={20} textAnchor="middle">{Math.round(t)}</text>)}</svg><span>Elo</span></div>
        {rows.map(row => { const ci = interval(row), active = focused === row.model_name; return <button key={row.model_name} className={`ranking-row${active ? ' is-selected' : ''}`} aria-pressed={selected === row.model_name} aria-label={`${row.model_name}, Elo ${fmt(row.elo_mean)}${ci ? `, 95% interval ${fmt(ci[0])} to ${fmt(ci[1])}` : ', interval unavailable'}`} onClick={() => choose(row.model_name)} onMouseEnter={() => setHovered(row.model_name)} onMouseLeave={() => setHovered('')}>
          <span className="ranking-name"><ModelLogo name={row.model_name} size={20} /><i style={{ background: colorOf(row.model_name) }} />{row.model_name}</span>
          <svg viewBox="0 0 600 36" preserveAspectRatio="none" aria-hidden="true">{ticks(domain).map(t => <line className="chart-grid" key={t} x1={position(t, domain, 20, 560)} x2={position(t, domain, 20, 560)} y1="0" y2="36" />)}{showCI && ci && <line x1={position(ci[0], domain, 20, 560)} x2={position(ci[1], domain, 20, 560)} y1="18" y2="18" stroke={colorOf(row.model_name)} strokeWidth="2" />}<circle cx={position(row.elo_mean, domain, 20, 560)} cy="18" r="1" stroke={colorOf(row.model_name)} strokeWidth={active ? 6 : 4} vectorEffect="non-scaling-stroke" fill={colorOf(row.model_name)} /></svg>
          <span className="ranking-score">{fmt(row.elo_mean)}</span>
        </button>; })}
      </div> : <div className="scatter-wrap"><svg viewBox="0 0 800 470" className="tradeoff-figure" role="group" aria-label={`${label(xRun)} versus ${label(yRun)}. Select a point or use the model selector below.`}>
        {ticks(domain).map(t => <g key={t}><line className="chart-grid" x1={position(t, domain, 70, 680)} x2={position(t, domain, 70, 680)} y1="30" y2="400" /><text x={position(t, domain, 70, 680)} y="425" textAnchor="middle">{Math.round(t)}</text></g>)}
        {ticks(yDomain).map(t => <g key={t}><line className="chart-grid" x1="70" x2="750" y1={400-position(t,yDomain,0,370)} y2={400-position(t,yDomain,0,370)} /><text x="57" y={404-position(t,yDomain,0,370)} textAnchor="end">{Math.round(t)}</text></g>)}
        <text x="410" y="461" textAnchor="middle">{label(xRun)} · Elo →</text><text transform="translate(17,215) rotate(-90)" textAnchor="middle">{label(yRun)} · Elo →</text>
        {points.map(p => { const cx=position(p.x.elo_mean,domain,70,680), cy=400-position(p.y.elo_mean,yDomain,0,370), ix=interval(p.x), iy=interval(p.y), active=focused===p.name, color=colorOf(p.name); return <g key={p.name} opacity={focused && !active ? .55 : 1}>
          {showCI && ix && <line x1={position(ix[0],domain,70,680)} x2={position(ix[1],domain,70,680)} y1={cy} y2={cy} stroke={color} opacity=".5" />}
          {showCI && iy && <line y1={400-position(iy[0],yDomain,0,370)} y2={400-position(iy[1],yDomain,0,370)} x1={cx} x2={cx} stroke={color} opacity=".5" />}
          <circle cx={cx} cy={cy} r="12" fill="transparent" tabIndex={0} role="button" aria-label={`${p.name}: ${label(xRun)} ${fmt(p.x.elo_mean)}, ${label(yRun)} ${fmt(p.y.elo_mean)}`} aria-pressed={selected===p.name} onClick={() => choose(p.name)} onMouseEnter={() => setHovered(p.name)} onMouseLeave={() => setHovered('')} onFocus={() => setHovered(p.name)} onBlur={() => setHovered('')} onKeyDown={e => { if(e.key==='Enter'||e.key===' ') {e.preventDefault();choose(p.name);} }}><title>{p.name}</title></circle>
          <circle cx={cx} cy={cy} r={active?7:5} className={`scatter-dot${active ? ' is-active' : ''}`} fill={color} stroke="var(--bg)" strokeWidth="1.5" pointerEvents="none" />
          {active && <text x={cx + (cx > 410 ? -12 : 12)} y={cy - 14} textAnchor={cx > 410 ? 'end' : 'start'} className="scatter-point-label" pointerEvents="none">{p.name}</text>}
        </g>; })}
      </svg></div>}
      <div className="chart-legend">{families.map(f => <button key={f} aria-pressed={family===f} onClick={() => setFamily(family===f?'':f)}><ModelLogo name={f === 'xAI' ? 'grok' : f === 'Ai2' ? 'olmo' : f} size={20} /><i style={{background:colorOf(allRows.find(r=>familyOf(r.model_name)===f)?.model_name || '')}} />{f}</button>)}</div>
      <p className="chart-footnote">{embedded ? `${paired.length} shared models. Higher scores mean more of each trait. Bars show separate 95% intervals.` : view==='ranking' ? 'Points show mean Elo; lines show published 95% intervals where available.' : `${paired.length} shared models. Each line is that axis’s own 95% interval, not a joint region. The recorded settings match, but we haven’t checked that the scenarios and model versions are identical.`}</p>
    </>}
    {chartReady && <aside className="chart-inspector" aria-label="Selected model details">
      <label><span>Inspect a model</span><select value={selected} onChange={e=>choose(e.target.value)}><option value="">Select a point or model</option>{allRows.map(r=><option key={r.model_name}>{r.model_name}</option>)}</select></label>
      {detail ? <div className="chart-detail" key={detail.model_name}><strong><ModelLogo name={x.value?.meta.models?.[detail.model_name]?.id || detail.model_name} size={22} />{detail.model_name}</strong><Score label={label(xRun)} row={detail} /><a href={transcriptURL(xSlug,detail.model_name)}>Read {label(xRun).toLowerCase()} judgments →</a>{view==='tradeoff' && yDetail && <><Score label={label(yRun)} row={yDetail} /><a href={transcriptURL(ySlug,detail.model_name)}>Read {label(yRun).toLowerCase()} judgments →</a></>}</div> : <p className="chart-detail-empty" key="empty">Hover over or tap a point to see its scores. Click it to keep the details open.</p>}
    </aside>}
    <footer className="chart-sources"><a href={runURL(xSlug)}>Run details & coverage: {xRun?.name || xSlug} ↗</a>{view==='tradeoff' && ySlug && <a href={runURL(ySlug)}>Paired run & coverage ↗</a>}{embedded ? <a className="home-expand-chart" href={`/explore/?view=tradeoff&x=${encodeURIComponent(xSlug)}&y=${encodeURIComponent(ySlug)}${selected ? `&model=${encodeURIComponent(selected)}` : ''}${family ? `&family=${encodeURIComponent(family)}` : ''}`}>Open in explorer ↗</a> : <a href="/leaderboard/">Full leaderboard →</a>}</footer>
  </section>;
}
function Score({ label, row }: { label: string; row: SummaryRow }) {
  const ci=interval(row);
  return <p><span>{label}</span> <b>{fmt(row.elo_mean)}</b> <small>{ci ? `95% CI ${fmt(ci[0])}–${fmt(ci[1])}` : '95% interval unavailable'}</small></p>;
}
