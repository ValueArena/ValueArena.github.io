'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { fetchIndex, fetchSummary } from '@/lib/hf';
import { constLabel } from '@/lib/nicks';
import { PixelHills } from './PixelHills';
import { ModelLogo } from './ModelLogo';
import { ModelMascot } from './ModelMascot';
import { BoardIcon } from './hub/ui';
import { HomeInsights } from './HomeInsights';
import { detectLab } from '@/lib/labs';
import { DEFAULT_VALUE, HEADLINE_GROUP, HEADLINE_VALUES, boardId, headlineRuns, valueId } from '@/lib/arena-data';
import { TrendsCard } from './hub/TrendsCard';
import { ValueLogo, ValueSelect } from './ValueLogo';
import type { IndexRun, SummaryRow } from '@/lib/types';

const COLORS: Record<string, string> = { OpenAI: '#78b99b', Anthropic: '#e8ab8c', Google: '#8cb7e0', Meta: '#adbce9', Qwen: '#b9a0d0', DeepSeek: '#a2bdec', Mistral: '#edc477', Kimi: '#9abbb6', GLM: '#a9b3be', Microsoft: '#b4c89a', xAI: '#c4c6bc', Nvidia: '#bed69d', Baidu: '#bacbc9' };
function lab(name: string) { return /kimi|moonshot/i.test(name) ? 'Kimi' : /glm|zai/i.test(name) ? 'GLM' : /grok|xai/i.test(name) ? 'xAI' : /nvidia|nemotron/i.test(name) ? 'Nvidia' : /baidu|ernie/i.test(name) ? 'Baidu' : detectLab(name); }

export function ArenaOverview({ full = false }: { full?: boolean }) {
  const [runs, setRuns] = useState<IndexRun[]>([]);
  const [constitution, setConstitution] = useState(DEFAULT_VALUE);
  const [selected, setSelected] = useState('');
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [perLab, setPerLab] = useState(!full);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const colsRef = useRef<HTMLDivElement>(null);
  const prevXRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    let active = true;
    setError('');
    fetchIndex().then(index => {
      if (!active) return;
      const available = headlineRuns(index.runs).filter(r => valueId(r));
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
    const order = (id: string) => { const i = HEADLINE_VALUES.indexOf(id); return i < 0 ? HEADLINE_VALUES.length : i; };
    return order(a) - order(b) || a.localeCompare(b);
  }), [runs]);
  const choices = useMemo(() => runs.filter(r => valueId(r) === constitution).sort((a, b) => (Number(b.models_count) || 0) - (Number(a.models_count) || 0) || String(b.timestamp).localeCompare(String(a.timestamp))), [runs, constitution]);
  const run = choices.find(r => r.slug === selected) || choices[0];
  useEffect(() => {
    if (!run) return;
    let active = true;
    setUpdating(true); setError('');
    fetchSummary(run.slug).then(data => { if (active) setRows(data.filter(r => Number.isFinite(r.elo_mean)).sort((a, b) => b.elo_mean - a.elo_mean)); })
      .catch(() => { if (active) setError('Scores could not be loaded. Try another run or retry.'); })
      .finally(() => { if (active) { setLoading(false); setUpdating(false); } });
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
    });
  }, [rows, perLab]);
  const valueTabs = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = valueTabs.current;
    const tab = strip?.querySelector<HTMLElement>('[aria-selected=true]');
    if (!strip || !tab) return;
    const bounds = strip.getBoundingClientRect(), item = tab.getBoundingClientRect();
    if (item.left < bounds.left) strip.scrollLeft += item.left - bounds.left;
    else if (item.right > bounds.right) strip.scrollLeft += item.right - bounds.right;
  }, [constitution, constitutions]);
  const [hovered, setHovered] = useState<string | null>(null);
  const scaleSource = shown.length ? shown : rows;
  const { low, high } = useMemo(() => {
    if (!scaleSource.length) return { low: 1400, high: 1600 };
    const minScore = Math.min(1500, ...scaleSource.map(r => r.elo_ci_lower ?? r.elo_mean));
    const maxScore = Math.max(1500, ...scaleSource.map(r => r.elo_ci_upper ?? r.elo_mean));
    const rawSpan = Math.max(24, maxScore - minScore);
    const pad = Math.max(6, rawSpan * 0.14);
    const step = rawSpan <= 60 ? 5 : rawSpan <= 160 ? 10 : rawSpan <= 360 ? 25 : 50;
    return {
      low: Math.floor((minScore - pad) / step) * step,
      high: Math.ceil((maxScore + pad) / step) * step,
    };
  }, [scaleSource]);
  const span = Math.max(1, high - low);
  // Percentage from the TOP of the stage (0% = high, 100% = low).
  const yOf = (n: number) => Math.max(0, Math.min(100, (high - n) / span * 100));
  const datumY = yOf(1500);
  const gridTicks = useMemo(() => {
    const step = span <= 80 ? 20 : span <= 160 ? 25 : span <= 360 ? 50 : 100;
    const ticks: number[] = [];
    for (let v = Math.ceil(low / step) * step; v <= high; v += step) {
      if (Math.abs(v - 1500) >= span * 0.08) ticks.push(v);
    }
    return ticks;
  }, [low, high, span]);
  const activeRow = shown.find(r => r.model_name === hovered) || shown[0] || null;
  const activeRank = activeRow ? rows.indexOf(activeRow) + 1 : null;
  const activeInterval = activeRow && typeof activeRow.elo_ci_lower === 'number' && typeof activeRow.elo_ci_upper === 'number'
    ? `${activeRow.elo_ci_lower.toFixed(1)}–${activeRow.elo_ci_upper.toFixed(1)}` : null;
  const choose = (c: string) => {
    if (c === constitution) return;
    setConstitution(c); setSelected(''); setHovered(null); setUpdating(true);
    const params = new URLSearchParams(location.search);
    params.set('constitution', c); params.delete('run');
    history.replaceState(null, '', `${location.pathname}?${params}${location.hash}`);
  };
  // FLIP horizontal rank swaps so mascots glide smoothly to their new positions when switching values.
  useLayoutEffect(() => {
    const container = colsRef.current;
    if (!container) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const nodes = Array.from(container.querySelectorAll<HTMLElement>('[data-model]'));
    const nextX = new Map<string, number>();
    nodes.forEach(el => { nextX.set(el.dataset.model!, el.getBoundingClientRect().left); });
    if (!reduced && prevXRef.current.size) {
      const moved: HTMLElement[] = [];
      nodes.forEach(el => {
        const prev = prevXRef.current.get(el.dataset.model!);
        const cur = nextX.get(el.dataset.model!);
        if (prev === undefined || cur === undefined) return;
        const dx = prev - cur;
        if (Math.abs(dx) < 1) return;
        el.style.transition = 'none';
        el.style.transform = `translateX(${dx}px)`;
        moved.push(el);
      });
      if (moved.length) {
        container.getBoundingClientRect();
        requestAnimationFrame(() => {
          moved.forEach(el => {
            el.style.transition = 'transform 520ms cubic-bezier(.22,1,.36,1)';
            el.style.transform = '';
          });
        });
      }
    }
    prevXRef.current = nextX;
  }, [shown]);
  const ranking = <section className="arena-ranking" id="rankings" aria-labelledby="ranking-heading">
    <div className="arena-plate">
      <header className="arena-plate-head">
        <div className="arena-plate-title">
          <ValueLogo id={constitution} size={28} />
          <div>
            <h2 id="ranking-heading">{constLabel(constitution)}</h2>
            <p>Deviation from 1500 equal-trust baseline · 95% confidence plumb-lines</p>
          </div>
        </div>
        <div className="arena-ranking-actions">
          <div className="arena-scope-tabs" role="tablist" aria-label="Models shown">
            <button type="button" role="tab" aria-selected={perLab} onClick={() => setPerLab(true)}>Top per lab</button>
            <button type="button" role="tab" aria-selected={!perLab} onClick={() => setPerLab(false)}>All models</button>
          </div>
          {!full && <a className="arena-plate-link" href={`/leaderboard/?constitution=${encodeURIComponent(constitution)}&run=${encodeURIComponent(run?.slug || '')}`}>Full results</a>}
        </div>
      </header>
      <div className="arena-plate-tabs" role="tablist" aria-label="Leaderboard values" ref={valueTabs} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]'));
        const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        tabs[next]?.focus({ preventScroll: true }); tabs[next]?.click();
      }}>{(constitutions.length ? constitutions : [DEFAULT_VALUE]).map(c => <button key={c} id={`ranking-value-${c}`} role="tab" aria-selected={constitution === c} aria-controls="home-ranking-panel" tabIndex={constitution === c ? 0 : -1} onClick={() => choose(c)}><BoardIcon constitution={c} /><span>{constLabel(c)}</span></button>)}</div>
      <div className="arena-plate-readout" aria-live="polite">
        {activeRow ? <>
          <span className="arena-readout-rank">#{activeRank}</span>
          <ModelLogo name={activeRow.model_name} size={16} />
          <strong className="arena-readout-name">{activeRow.model_name}</strong>
          <span className="arena-readout-score">{activeRow.elo_mean.toFixed(1)} Elo</span>
          <span className={`arena-readout-delta${activeRow.elo_mean >= 1500 ? ' is-up' : ' is-down'}`}>
            {activeRow.elo_mean >= 1500 ? '+' : ''}{(activeRow.elo_mean - 1500).toFixed(1)} vs 1500
          </span>
          {activeInterval && <span className="arena-readout-ci">95% CI {activeInterval}</span>}
        </> : <span className="arena-readout-empty">{loading ? 'Loading published scores…' : 'Hover or focus a monolith to inspect'}</span>}
      </div>
      <div id="home-ranking-panel" role="tabpanel" aria-labelledby={`ranking-value-${constitution}`} data-updating={updating || undefined}>
        {error ? <div className="arena-feedback" role="alert">{error} <button onClick={() => setRetry(n => n + 1)}>Retry</button></div>
          : loading && !rows.length ? <div className="arena-skyline-skeleton" role="status" aria-label="Loading published scores">
              {[38, 31, 24, 18, 11, -8, -17, -26].map((delta, i) => <div className="arena-skeleton-col" key={i}><span style={{ top: delta >= 0 ? `${50 - delta}%` : '50%', height: `${Math.abs(delta)}%` }} /></div>)}
            </div>
            : !shown.length ? <p className="arena-feedback" role="status">No scores available.</p>
              : <div className="arena-skyline-scroll" role="region" aria-label="Model rankings" tabIndex={0}>
                  <div className="arena-skyline" style={{ minWidth: Math.max(680, shown.length * 108) }}>
                    <div className="arena-skyline-stage">
                      <div className="arena-skyline-grid" aria-hidden="true">
                        {gridTicks.map(tick => <div key={tick} className="arena-skyline-tick" style={{ top: `${yOf(tick)}%` }}><span>{tick}</span></div>)}
                        <div className="arena-skyline-datum" style={{ top: `${datumY}%` }}><span>1500 · equal trust</span></div>
                      </div>
                      <div className="arena-skyline-cols" ref={colsRef}>{shown.map((row, i) => {
                        const rank = rows.indexOf(row) + 1;
                        const family = lab(row.model_name);
                        const above = row.elo_mean >= 1500;
                        const scoreY = yOf(row.elo_mean);
                        const top = Math.min(scoreY, datumY);
                        const height = Math.max(0.6, Math.abs(datumY - scoreY));
                        const hasCI = typeof row.elo_ci_lower === 'number' && typeof row.elo_ci_upper === 'number';
                        const ciTop = hasCI ? yOf(row.elo_ci_upper!) : scoreY;
                        const ciHeight = hasCI ? Math.max(0.6, yOf(row.elo_ci_lower!) - ciTop) : 0;
                        const interval = hasCI ? `95% interval ${row.elo_ci_lower!.toFixed(1)}–${row.elo_ci_upper!.toFixed(1)}` : 'Interval not reported';
                        const color = COLORS[family] || ['#c0c9b4', '#d8c5b4', '#b4c6cf'][i % 3];
                        const isActive = activeRow?.model_name === row.model_name;
                        return <a className={`arena-monolith${above ? ' is-above' : ' is-below'}${isActive ? ' is-active' : ''}`} key={row.model_name} data-model={row.model_name} data-lab={family.toLowerCase()}
                          style={{ '--column-color': color } as React.CSSProperties}
                          href={`/model/?run=${encodeURIComponent(run.slug)}&id=${encodeURIComponent(row.model_name)}`}
                          onMouseEnter={() => setHovered(row.model_name)}
                          onFocus={() => setHovered(row.model_name)}
                          aria-label={`Rank ${rank}. ${row.model_name}, ${row.elo_mean.toFixed(1)} Elo. ${interval}. View model profile.`}>
                          <div className="arena-monolith-plot">
                            <span className="arena-monolith-stem" style={{ top: `${top}%`, height: `${height}%` }} />
                            {hasCI && <span className="arena-monolith-aura" aria-hidden="true" style={{ top: `${ciTop}%`, height: `${ciHeight}%` }} />}
                            <span className="arena-monolith-node" style={{ top: `${scoreY}%` }}>
                              <ModelMascot lab={family} size={52} />
                            </span>
                            <span className="arena-monolith-score" style={{ top: `${above ? Math.min(scoreY, ciTop) : Math.max(scoreY, ciTop + ciHeight)}%` }}>{row.elo_mean.toFixed(0)}</span>
                          </div>
                          <div className="arena-monolith-foot">
                            <span className={`arena-monolith-rank${rank === 1 ? ' is-first' : ''}`}>#{rank}</span>
                            <span className="arena-monolith-label"><ModelLogo name={row.model_name} size={14} /><span className="arena-monolith-name">{row.model_name}</span></span>
                          </div>
                        </a>;
                      })}</div>
                    </div>
                  </div>
                </div>}
      </div>
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
      <section className="arena-trends" id="trends" aria-label="Model release history"><div className="hub hub-embed"><ValueTrends /></div></section>
      {ranking}
      <HomeInsights />
    </div>}
  </>;
}

/** Each value's best score by model release date, from the site's results. */
function ValueTrends() {
  const [value, setValue] = useState(DEFAULT_VALUE);
  const picker = <ValueSelect aria-label="Value" className="trend-value-select" value={value} onChange={e => setValue(e.target.value)}>
    {HEADLINE_VALUES.map(id => <option key={id} value={id}>{constLabel(id)}</option>)}
  </ValueSelect>;
  return <TrendsCard compact flat showNotes={false} home run={`${HEADLINE_GROUP}/${value.replace(/-/g, '_')}`} value={value} picker={picker} />;
}
