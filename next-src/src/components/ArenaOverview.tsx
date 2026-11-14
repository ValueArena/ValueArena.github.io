'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchIndex, fetchSummary } from '@/lib/hf';
import { constLabel } from '@/lib/nicks';
import { PixelHills } from './PixelHills';
import { ModelLogo } from './ModelLogo';
import { TrendsCard } from './hub/TrendsCard';
import { BoardIcon } from './hub/ui';
import { HomeInsights } from './HomeInsights';
import { detectLab } from '@/lib/labs';
import { boardId, valueId } from '@/lib/arena-data';
import { CONSTITUTIONS } from '@/lib/config';
import type { IndexRun, SummaryRow } from '@/lib/types';

const COLORS: Record<string, string> = { OpenAI: '#78b99b', Anthropic: '#e8ab8c', Google: '#8cb7e0', Meta: '#adbce9', Qwen: '#b9a0d0', DeepSeek: '#a2bdec', Mistral: '#edc477', Kimi: '#9abbb6', GLM: '#a9b3be', Microsoft: '#b4c89a', xAI: '#c4c6bc', Nvidia: '#bed69d', Baidu: '#bacbc9' };
function lab(name: string) { return /kimi|moonshot/i.test(name) ? 'Kimi' : /glm|zai/i.test(name) ? 'GLM' : /grok|xai/i.test(name) ? 'xAI' : /nvidia|nemotron/i.test(name) ? 'Nvidia' : /baidu|ernie/i.test(name) ? 'Baidu' : detectLab(name); }

export function ArenaOverview({ full = false }: { full?: boolean }) {
  const [runs, setRuns] = useState<IndexRun[]>([]);
  const [constitution, setConstitution] = useState('kindness');
  const [selected, setSelected] = useState('');
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [search, setSearch] = useState('');
  const [perLab, setPerLab] = useState(!full);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    fetchIndex().then(index => {
      if (!active) return;
      const available = index.runs.filter(r => valueId(r));
      setRuns(available);
      if (!available.length) { setLoading(false); return; }
      const params = new URLSearchParams(window.location.search);
      const requestedRun = available.find(r => r.slug === params.get('run'));
      const requestedConstitution = boardId(params.get('constitution'));
      if (requestedRun) {
        setConstitution(valueId(requestedRun));
        setSelected(requestedRun.slug);
        return;
      }
      if (requestedConstitution && available.some(r => valueId(r) === requestedConstitution)) {
        setConstitution(requestedConstitution);
        return;
      }
      setConstitution(c => available.some(r => valueId(r) === c) ? c : valueId(available[0]));
    }).catch(() => { if (active) { setError('Published results could not be loaded.'); setLoading(false); } });
    return () => { active = false; };
  }, [retry]);
  const constitutions = useMemo(() => [...new Set(runs.map(valueId))].sort((a, b) => {
    const order = (id: string) => { const i = CONSTITUTIONS.findIndex(c => c.id === id); return i < 0 ? CONSTITUTIONS.length : i; };
    return order(a) - order(b) || a.localeCompare(b);
  }), [runs]);
  const choices = useMemo(() => runs.filter(r => valueId(r) === constitution).sort((a, b) => (Number(b.models_count) || 0) - (Number(a.models_count) || 0) || String(b.timestamp).localeCompare(String(a.timestamp))), [runs, constitution]);
  const run = choices.find(r => r.slug === selected) || choices[0];
  useEffect(() => {
    if (!run) return;
    let active = true;
    setLoading(true); setError(''); setRows([]);
    fetchSummary(run.slug).then(data => { if (active) setRows(data.filter(r => Number.isFinite(r.elo_mean)).sort((a, b) => b.elo_mean - a.elo_mean)); })
      .catch(() => { if (active) setError('Scores could not be loaded. Try another run or retry.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [run, retry]);
  const shown = useMemo(() => {
    const seen = new Set<string>();
    return rows.filter(row => {
      if (!perLab) return true;
      const family = lab(row.model_name);
      const key = family === 'Other' ? row.model_name : family;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).filter(row => row.model_name.toLowerCase().includes(search.toLowerCase()));
  }, [rows, search, perLab]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const filterButton = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const valueTabs = useRef<HTMLDivElement>(null);
  const rankingRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (full) return;
    const ranking = rankingRef.current;
    if (!ranking) return;
    const nav = document.querySelector('.arena-nav');
    let frame = 0;
    const measure = () => {
      frame = 0;
      const top = (nav?.getBoundingClientRect().bottom ?? 56) + 12;
      const bar = ranking.querySelector('.arena-value-bar')?.getBoundingClientRect().height || 40;
      // Keep the bars compact; the entrance still aligns their baseline with the screen edge.
      const height = Math.max(200, Math.min(520, innerHeight * .55, innerHeight - top - bar));
      ranking.style.setProperty('--arena-stage-height', `${Math.round(height)}px`);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    if (nav) observer.observe(nav);
    observer.observe(ranking);
    window.addEventListener('resize', schedule); schedule();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', schedule); };
  }, [full, shown]);
  useEffect(() => {
    const strip = valueTabs.current;
    const tab = strip?.querySelector<HTMLElement>('[aria-selected=true]');
    if (!strip || !tab) return;
    const bounds = strip.getBoundingClientRect(), item = tab.getBoundingClientRect();
    if (item.left < bounds.left) strip.scrollLeft += item.left - bounds.left;
    else if (item.right > bounds.right) strip.scrollLeft += item.right - bounds.right;
  }, [constitution, constitutions]);
  useEffect(() => {
    if (!filtersOpen) return;
    searchInput.current?.focus({ preventScroll: true });
    filtersRef.current?.querySelector('.arena-filter-panel')?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    const outside = (event: PointerEvent) => {
      if (!filtersRef.current?.contains(event.target as Node)) setFiltersOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [filtersOpen]);
  const closeFilters = () => {
    setFiltersOpen(false);
    filterButton.current?.focus({ preventScroll: true });
  };
  const low = rows.length ? Math.floor((Math.min(...rows.map(r => r.elo_ci_lower ?? r.elo_mean)) - 200) / 100) * 100 : 1000;
  const high = rows.length ? Math.ceil((Math.max(...rows.map(r => r.elo_ci_upper ?? r.elo_mean)) + 30) / 100) * 100 : 1800;
  const pos = (n: number) => Math.max(0, Math.min(100, (n - low) / Math.max(1, high - low) * 100));
  const choose = (c: string) => {
    if (c === constitution) return;
    setConstitution(c); setSelected(''); setSearch(''); setLoading(true); setRows([]);
    const params = new URLSearchParams(location.search);
    params.set('constitution', c); params.delete('run');
    history.replaceState(null, '', `${location.pathname}?${params}${location.hash}`);
  };
  const ranking = <section className="arena-ranking" id="rankings" aria-labelledby="ranking-heading" ref={rankingRef}>
    <h2 id="ranking-heading" className="sr-only">{constLabel(constitution)}</h2>
    <div className="arena-value-bar">
      <div className="arena-value-tabs" role="tablist" aria-label="Leaderboard values" ref={valueTabs} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]'));
        const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        tabs[next]?.focus({ preventScroll: true }); tabs[next]?.click();
      }}>{(constitutions.length ? constitutions : ['kindness']).map(c => <button key={c} id={`ranking-value-${c}`} role="tab" aria-selected={constitution === c} aria-controls="home-ranking-panel" tabIndex={constitution === c ? 0 : -1} onClick={() => choose(c)}><BoardIcon constitution={c} /><span>{constLabel(c)}</span></button>)}</div>
      <div className="arena-ranking-actions">
      {!full && <a className="arena-ranking-more" href={`/leaderboard/?constitution=${encodeURIComponent(constitution)}&run=${encodeURIComponent(run?.slug || '')}`}>Full results</a>}
      <div className="arena-filter" ref={filtersRef}
        onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); closeFilters(); } }}
        onBlur={e => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) setFiltersOpen(false); }}>
        <button className="arena-filter-toggle" ref={filterButton} aria-label="Filter rankings"
          aria-expanded={filtersOpen} aria-controls="ranking-filters" onClick={() => setFiltersOpen(open => !open)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 5h16l-6.5 8v5l-3 2v-7L4 5Z" />
          </svg>
        </button>
        {filtersOpen && <div className="arena-filter-panel" id="ranking-filters" role="region" aria-label="Ranking filters">
          <label>Model<input ref={searchInput} aria-label="Search models" value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a model" /></label>
          {choices.length > 1 && <label>Evaluation run<select value={run?.slug || ''} onChange={e => setSelected(e.target.value)}>
            {choices.map(r => <option key={r.slug} value={r.slug}>{r.name || r.slug}</option>)}
          </select></label>}
          <label className="arena-filter-check"><input type="checkbox" checked={perLab} onChange={e => setPerLab(e.target.checked)} /> Best model from each lab</label>
          <div className="arena-filter-actions"><button onClick={() => { setSearch(''); setPerLab(false); }}>Clear model filters</button><button onClick={closeFilters}>Done</button></div>
          <div className="arena-filter-sources"><a href={`/constitution/?id=${encodeURIComponent(constitution)}`}>Read criteria</a>{run && <a href={`/run/?slug=${encodeURIComponent(run.slug)}`}>Run details</a>}</div>
        </div>}
      </div>
      </div>
    </div>
    <div id="home-ranking-panel" role="tabpanel" aria-labelledby={`ranking-value-${constitution}`}>
    {error ? <div className="arena-feedback" role="alert">{error} <button onClick={() => setRetry(n => n + 1)}>Retry</button></div>
      : loading ? <div className="arena-chart-loading" role="status"><div>{[62, 57, 52, 48, 43, 39, 34, 30, 28, 25].map((height, i) => <span key={i} style={{ height: `${height}%` }} />)}</div><p>Loading published scores…</p></div>
      : !shown.length ? <p className="arena-feedback" role="status">{search ? 'No models match your search.' : 'No scores available.'}</p>
      : <div className="arena-chart-scroll" role="region" aria-label="Model rankings" tabIndex={0}><div className="arena-chart" style={{ minWidth: Math.max(640, shown.length * 120) }}>
        <div className="arena-grid-lines" aria-hidden="true">{[0, 25, 50, 75, 100].map(p => <div key={p} style={{ bottom: `${p}%` }}><span>{Math.round(low + (high - low) * p / 100)}</span></div>)}</div>
        <div className="arena-columns">{shown.map((row, i) => {
        const interval = typeof row.elo_ci_lower === 'number' && typeof row.elo_ci_upper === 'number'
          ? `95% interval ${row.elo_ci_lower.toFixed(1)}–${row.elo_ci_upper.toFixed(1)}` : 'Interval not reported';
        return <a className="arena-column" key={row.model_name} style={{ '--column-color': COLORS[lab(row.model_name)] || ['#c0c9b4', '#d8c5b4', '#b4c6cf'][i % 3] } as React.CSSProperties}
            href={`/model/?run=${encodeURIComponent(run.slug)}&id=${encodeURIComponent(row.model_name)}`}
            aria-label={`Rank ${rows.indexOf(row) + 1}. ${row.model_name}, ${row.elo_mean.toFixed(1)} Elo. ${interval}. View model profile.`}
            aria-describedby={`ranking-tooltip-${i}`}>
            <span className="arena-column-tooltip" id={`ranking-tooltip-${i}`} role="tooltip" data-align={i >= shown.length / 2 ? 'end' : 'start'}>
              <span className="arena-column-tooltip-name"><ModelLogo name={row.model_name} size={20} />{row.model_name}</span>
              <span className="arena-column-tooltip-score">{row.elo_mean.toFixed(1)} <span>Elo</span></span>
              <span className="arena-column-tooltip-interval">{interval}</span>
            </span>
            <div className="arena-column-stage">
              <div className="arena-column-bar" style={{ height: `${pos(row.elo_mean)}%` }}><strong>{row.elo_mean.toFixed(0)}</strong><span className="arena-bar-rank">#{rows.indexOf(row) + 1}</span></div>
              {typeof row.elo_ci_lower === 'number' && typeof row.elo_ci_upper === 'number' && <span className="arena-whisker" aria-hidden="true" style={{ bottom: `${pos(row.elo_ci_lower)}%`, height: `${pos(row.elo_ci_upper) - pos(row.elo_ci_lower)}%` }} />}
            </div>
            <div className="arena-column-label"><ModelLogo name={row.model_name} size={23} /><span>{row.model_name}</span></div>
          </a>;
      })}</div></div></div>}
    </div>
  </section>;

  return <>
    {full ? <>
      <section className="arena-intro"><h1>The ValueArena leaderboards</h1><p className="arena-deck">Explore the rankings and the choices behind the scores.</p></section>
      <div className="arena-full-rankings">{ranking}</div>
    </> : <div className="arena-home-canvas">
        <div className="arena-original-intro arena-home story-home">
          <section className="arena-tv-panel research-intro has-pixel-art hero-with-hills" aria-labelledby="arena-home-heading">
            <PixelHills variant="hero" className="hero-hills arena-tv-hills" />
            <h1 id="arena-home-heading">Measuring values in language models</h1>
            <img className="home-pixel-art" src="/assets/art/model-conversation-values.webp?v=5" width="768" height="507" alt="" aria-hidden="true" />
            <p className="research-deck">EigenBench scores language models on how well their answers fit a written set of values, which we call a constitution. Browse the rankings, compare models across constitutions, and read the actual responses and judgments behind every score.</p>
            <div className="home-actions"><a className="button-primary" href="/constitutions/">Explore results</a><a className="button-secondary" href="/methodology/">How EigenBench works</a></div>
          </section>
        </div>
      <section className="arena-trends" id="trends" aria-label="Model release history"><div className="hub hub-embed"><TrendsCard compact flat showNotes={false} home /></div></section>
      {ranking}
      <HomeInsights />
    </div>}
  </>;
}
