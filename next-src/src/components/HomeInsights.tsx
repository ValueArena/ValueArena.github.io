'use client';

import { ValueSelect, ValueLabel } from './ValueLogo';
import { useEffect, useRef, useState } from 'react';
import { usePublishedBoards } from './usePublishedBoards';
import { constLabel } from '@/lib/nicks';
import { modelMatch, profileURL, scoreInterval } from '@/lib/arena-data';
import { getModelLogo } from '@/lib/config';
import { papers } from '@/lib/papers';
import { modelInfo } from '@/lib/registry';
import { ModelLogo } from './ModelLogo';
import { useWidth } from './hub/useWidth';
import { ComparisonRanks } from './ComparisonVisuals';

const RANK_VALUES = ['kindness', 'conservatism', 'deep_ecology', 'lockean_rights_constitution', 'marxism_constitution', 'taoism_constitution'];

const LAB_COLORS: Record<string, string> = { OpenAI: '#78b99b', Anthropic: '#e8ab8c', Google: '#8cb7e0', Meta: '#adbce9', Qwen: '#b9a0d0', DeepSeek: '#a2bdec', Mistral: '#edc477', Moonshot: '#9abbb6', Zhipu: '#a9b3be', Nvidia: '#bed69d', xAI: '#c4c6bc' };
const labOf = (name: string) => modelInfo(name)?.lab || 'Other';
const colorOf = (name: string) => LAB_COLORS[labOf(name)] || '#afbdac';

export function HomeInsights() {
  const section = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '300px' });
    if (section.current) observer.observe(section.current);
    return () => observer.disconnect();
  }, []);
  const data = usePublishedBoards(visible ? '' : null);
  const [xValue, setXValue] = useState('kindness');
  const [yValue, setYValue] = useState('deep_ecology');
  const [selected, setSelected] = useState('');
  const [plotRef, width] = useWidth<HTMLDivElement>(1280);
  const left = width < 700 ? 48 : 64, right = width - 32, plotWidth = right - left;
  const values = data.boards.length ? data.boards.map(b => b.id) : [xValue, yValue];
  const chooseValue = (id: string) => { setXValue(id); if (id === yValue) setYValue(xValue); setSelected(''); };
  const xBoard = data.boards.find(b => b.id === xValue);
  const yBoard = data.boards.find(b => b.id === yValue);
  const xRows = data.scores[xBoard?.run.slug || ''];
  const yRows = data.scores[yBoard?.run.slug || ''];
  const points = (xRows || []).flatMap(x => { const y = modelMatch(yRows || [], x.model_name); return y ? [{ name: x.model_name, x, y }] : []; });
  const active = points.find(p => p.name === selected);
  const labs = [...new Set(points.map(p => labOf(p.name)))];
  const domain = (values: number[]) => [Math.floor((Math.min(...values) - 20) / 100) * 100, Math.ceil((Math.max(...values) + 20) / 100) * 100];
  const [xMin, xMax] = domain(points.length ? points.map(p => p.x.elo_mean) : [1400, 1600]);
  const [yMin, yMax] = domain(points.length ? points.map(p => p.y.elo_mean) : [1400, 1600]);
  const failed = data.error || data.failures[xBoard?.run.slug || ''] || data.failures[yBoard?.run.slug || ''];
  const rankBoards = data.boards.filter(b => RANK_VALUES.includes(b.id));
  const rankCohort = data.scores[rankBoards.find(b => b.id === 'kindness')?.run.slug || ''] || [];
  const rankLabs = new Set<string>();
  const rankModels = rankCohort.filter(row => {
    const lab = modelInfo(row.model_name)?.lab || row.model_name;
    if (rankLabs.has(lab)) return false;
    rankLabs.add(lab); return true;
  }).slice(0, 5).map(row => row.model_name);
  const ranksFailed = data.error || rankBoards.some(b => data.failures[b.run.slug]);
  const ranksReady = rankModels.length > 0 && rankBoards.length >= 3 && rankBoards.every(b => data.scores[b.run.slug]);

  return <div className="home-insights" ref={section}>
    <section className="home-value-comparison" aria-labelledby="home-compare-heading">
      <header className="home-section-heading"><h2 id="home-compare-heading">Value leaderboards</h2></header>
        <div id="featured-value-chart">
          <div className="value-plot-toolbar">
            <ValueSelect aria-label="Featured value" value={xValue} disabled={data.loading} onChange={e => chooseValue(e.target.value)}>{values.map(id => <option key={id} value={id}>{constLabel(id)}</option>)}</ValueSelect>
            <span>vs</span>
            <ValueSelect aria-label="Comparison value" value={yValue} disabled={data.loading} onChange={e => { setYValue(e.target.value); setSelected(''); }}>{values.filter(id => id !== xValue).map(id => <option key={id} value={id}>{constLabel(id)}</option>)}</ValueSelect>
            <a href={`/compare/?value=${encodeURIComponent(xValue)}&value=${encodeURIComponent(yValue)}`}>Full comparison</a>
          </div>
          <div className="value-plot-legend" aria-label="Developers">{labs.map(lab => <span key={lab}><i style={{ background: LAB_COLORS[lab] || '#afbdac' }} />{lab}</span>)}</div>
          <div className="value-plot">
            <div className="value-scatter-scroll" ref={plotRef}>
              {failed ? <div className="insight-status" role="alert">Results could not be loaded.<button onClick={data.retry}>Retry</button></div>
                : !xRows || !yRows ? <div className="insight-status" role="status">Loading value comparisons…</div>
                  : !points.length ? <div className="insight-status">No shared models in these evaluations. Choose another comparison value.</div>
                    : <svg className="value-scatter" viewBox={`0 0 ${width} 420`} role="group" aria-label={`${constLabel(xValue)} against ${constLabel(yValue)}. Select a model to inspect its scores.`}>
                      {[0, .25, .5, .75, 1].map(t => <g key={t} className="scatter-grid"><line x1={left} x2={right} y1={358 - t * 318} y2={358 - t * 318} /><line y1="40" y2="358" x1={left + t * plotWidth} x2={left + t * plotWidth} /><text x={left - 10} y={362 - t * 318} textAnchor="end">{Math.round(xMin + t * (xMax - xMin))}</text><text x={left + t * plotWidth} y="382" textAnchor="middle">{Math.round(yMin + t * (yMax - yMin))}</text></g>)}
                      <text className="scatter-axis" x={left + plotWidth / 2} y="410" textAnchor="middle">{constLabel(yValue)} · Elo</text><text className="scatter-axis" transform="translate(16 200) rotate(-90)" textAnchor="middle">{constLabel(xValue)} · Elo</text>
                      {points.map((point, i) => { const logo = getModelLogo(point.name); return <g key={point.name} className="scatter-point" role="button" tabIndex={0} aria-pressed={selected === point.name} aria-label={`${point.name}: ${constLabel(xValue)} ${point.x.elo_mean.toFixed(1)}, ${constLabel(yValue)} ${point.y.elo_mean.toFixed(1)}`} onClick={() => setSelected(point.name)} onFocus={() => setSelected(point.name)} onMouseEnter={() => setSelected(point.name)} onMouseLeave={() => setSelected('')} onBlur={() => setSelected('')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(point.name); } }} transform={`translate(${left + (point.y.elo_mean - yMin) / (yMax - yMin) * plotWidth} ${358 - (point.x.elo_mean - xMin) / (xMax - xMin) * 318})`}><rect className="scatter-hit" x="-18" y="-18" width="36" height="36" /><rect className="scatter-tile" x="-12" y="-12" width="24" height="24" fill={colorOf(point.name)} />{logo ? <image href={logo} x="-8" y="-8" width="16" height="16" /> : <circle r="4" fill="currentColor" />}{(width >= 700 && (i < 3 || selected === point.name)) && <text className="scatter-model-name" x={point.y.elo_mean > yMin + .78 * (yMax - yMin) ? -18 : 18} y={i % 2 ? 18 : -16} textAnchor={point.y.elo_mean > yMin + .78 * (yMax - yMin) ? 'end' : 'start'}>{point.name}</text>}</g>; })}
                    </svg>}
            </div>
            {active && <div className="value-plot-tooltip" aria-live="polite"><button type="button" aria-label="Close model details" onClick={() => setSelected('')}>×</button><a href={profileURL(active.name, xBoard!.run.slug)}><ModelLogo name={active.name} size={16} />{active.name}</a><dl>{[{ board:xBoard, row:active.x }, { board:yBoard, row:active.y }].map(({ board, row }) => <div key={board!.id}><dt><ValueLabel id={board!.id} size={20} /></dt><dd>{row.elo_mean.toFixed(1)}<span>{scoreInterval(row) || 'Interval not reported'}</span></dd></div>)}</dl></div>}
          </div>
        </div>
    </section>
    <div className="home-ranks">
      {ranksReady ? <ComparisonRanks models={rankModels} boards={rankBoards} scores={data.scores} /> : <section>
        <header className="comparison-section-heading"><h2>Comparison by value</h2><p>Relative standing within each evaluation.</p></header>
        {ranksFailed ? <div className="insight-status" role="alert">Value comparisons couldn’t be loaded.<button onClick={data.retry}>Retry</button></div> : <p className="insight-status" role="status">Loading value comparisons…</p>}
      </section>}
    </div>
    <section className="home-research-strip" aria-labelledby="home-research-title">
      <header className="home-section-heading"><h2 id="home-research-title">Research behind ValueArena</h2><p>The methods and experiments behind the rankings.</p><a className="home-text-action" href="/research/">All research</a></header>
      <div className="home-research-cards">{papers.map(paper => <a href={`/research/${paper.slug}/`} key={paper.slug}><img src={paper.image} alt="" loading="lazy" width="160" height="160" /><div><h3>{paper.subtitle}</h3><span>{paper.title}</span></div></a>)}<a href="/methodology/"><img src="/assets/art/constitution-notebook.webp" alt="" loading="lazy" width="160" height="160" /><div><h3>How scenarios, constitutions, and judgments become scores</h3><span>Methodology</span></div></a></div>
    </section>
  </div>;
}
