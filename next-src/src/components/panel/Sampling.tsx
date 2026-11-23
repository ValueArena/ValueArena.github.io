'use client';

import { useMemo, useRef, type KeyboardEvent } from 'react';
import { ValueSelect } from '@/components/ValueLogo';
import { assignments, judgeColor, promptTags, type Layer } from './data';
import { Evidence } from './Evidence';
import { RouteLink, useNav } from './PanelExplorer';
import type { Route } from './route';

/** Which judge rated which answer: one row per answering model, one column per prompt. */
export function Sampling() {
  const { route, go, data } = useNav();
  const constitution = data.constitutions.find(c => c.id === route.constitution) ?? data.constitutions[0];
  const layer: Layer = route.judges === 'second' ? 'second' : 'primary';
  const pairs = route.view === 'pairs';
  const models = data.models;
  const grid = useMemo(() => assignments(constitution, layer), [constitution, layer]);
  const tags = useMemo(() => promptTags(data, constitution), [data, constitution]);
  const answerer = Math.min(route.answerer ?? 0, models.length - 1);
  const column = Math.min(route.column ?? 0, (pairs ? models.length : constitution.prompts.length) - 1);
  const trace = route.trace;
  const base: Route = { tab: 'sampling', constitution: route.constitution, judges: route.judges, view: route.view };
  const gridRef = useRef<HTMLDivElement>(null);

  const pairCounts = useMemo(() => models.map((_, a) => models.map((__, j) => grid[a].filter(cell => cell.judges.includes(j)).length)), [grid, models]);
  const maxPair = Math.max(1, ...pairCounts.flat());
  const ratings = layer === 'primary' ? constitution.counts.primary : constitution.counts.audit;
  const selfPrompts = constitution.prompts.filter((_, p) => grid.some((row, a) => row[p].judges.includes(a))).length;
  const multi = grid.some(row => row.some(cell => cell.judges.length > 1));
  const empty = grid.some(row => row.some(cell => !cell.judges.length));

  const select = (a: number, c: number) => go({ ...base, answerer: a, column: c, trace }, true);
  const onKey = (event: KeyboardEvent) => {
    const cols = pairs ? models.length : constitution.prompts.length;
    const step: Record<string, [number, number]> = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
    const move = step[event.key];
    if (!move) return;
    event.preventDefault();
    const a = Math.max(0, Math.min(models.length - 1, answerer + move[0]));
    const c = Math.max(0, Math.min(cols - 1, column + move[1]));
    select(a, c);
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLElement>(`[data-cell="${a}:${c}"]`)?.focus());
  };

  // Switching views keeps the selection: a prompt cell maps to its judge's column, a pair to its first prompt.
  const toPairs: Route = { ...base, view: 'pairs', answerer, column: grid[answerer][column]?.judges[0] ?? 0, trace: undefined, read: undefined };
  const firstPrompt = pairs ? Math.max(0, grid[answerer].findIndex(cell => cell.judges.includes(column))) : column;
  const toPrompts: Route = { ...base, view: undefined, answerer, column: firstPrompt, trace: pairs ? column : trace, read: undefined };

  return <div className="panel-body">
    <div className="panel-toolbar">
      <label><span>Constitution</span>
        <ValueSelect value={constitution.id} logoId={constitution.id} onChange={e => go({ tab: 'sampling', constitution: e.target.value, judges: route.judges, view: route.view })}>
          {data.constitutions.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </ValueSelect>
      </label>
      <label><span>Assignments</span>
        <select value={layer} onChange={e => go({ ...base, judges: e.target.value === 'second' ? 'second' : undefined, answerer, column, trace })}>
          <option value="primary">Primary judges</option>
          <option value="second">Second judges</option>
        </select>
      </label>
      <p className="panel-stats"><strong>{ratings}</strong> {layer === 'primary' ? 'primary' : 'second-judge'} ratings · <strong>{selfPrompts}/{constitution.prompts.length}</strong> prompts with self-ratings</p>
    </div>

    <div className="panel-toolbar panel-toolbar-sub">
      <div className="panel-segmented" role="group" aria-label="Matrix view">
        <RouteLink to={toPrompts} aria-current={!pairs ? 'page' : undefined}>By prompt</RouteLink>
        <RouteLink to={toPairs} aria-current={pairs ? 'page' : undefined}>Pair totals</RouteLink>
      </div>
      <ul className="panel-legend">
        <li>Columns: {pairs ? 'judges' : 'prompts'}</li>
        <li><span className="panel-dot" aria-hidden="true" /> {pairs ? 'Self-pair' : 'Self-rating'}</li>
        {!pairs && multi && <li><span className="panel-swatch is-multi" aria-hidden="true" /> Multiple judges</li>}
        {!pairs && empty && <li><span className="panel-swatch is-empty" aria-hidden="true" /> Unassigned</li>}
        {!pairs && constitution[layer === 'primary' ? 'missing' : 'missingAudit'].length > 0 && <li><span className="panel-swatch is-missing" aria-hidden="true" /> Judgment missing</li>}
      </ul>
    </div>

    {!pairs && <div className="panel-judges" role="group" aria-label="Trace a judge">
      <RouteLink to={{ ...base, answerer, column }} replace aria-current={trace === undefined ? 'page' : undefined}>All judges</RouteLink>
      {models.map((m, j) => <RouteLink key={m.name} to={{ ...base, answerer, column, trace: trace === j ? undefined : j }} replace
        aria-current={trace === j ? 'page' : undefined} title={`Highlight ${m.name}'s assignments`}>
        <span className="panel-chip-swatch" style={{ background: judgeColor(j) }} aria-hidden="true" />{m.name}
      </RouteLink>)}
    </div>}

    <div className="panel-split">
      <div className="panel-matrix-wrap">
        <div ref={gridRef} className={`panel-matrix${pairs ? ' is-pairs' : ''}${trace !== undefined && !pairs ? ' is-tracing' : ''}`} role="grid"
          aria-label={pairs ? 'Answerer by judge totals' : 'Answerer by prompt judge assignments'} onKeyDown={onKey}
          style={{ gridTemplateColumns: `minmax(5.5rem, auto) repeat(${pairs ? models.length : constitution.prompts.length}, minmax(${pairs ? '2.4rem' : '0.8rem'}, 1fr))` }}>
          <div role="row" className="panel-matrix-row">
            <span role="columnheader" className="panel-corner">{pairs ? 'Answerer ↓ Judge →' : 'Answerer ↓'}</span>
            {(pairs ? models.map(m => m.name) : constitution.prompts).map((label, c) =>
              <span role="columnheader" key={label} className={`panel-colhead${c === column ? ' is-on' : ''}`} title={label}>
                {pairs ? label.slice(0, 4) : (c % 10 === 0 ? label : '')}
              </span>)}
          </div>
          {models.map((m, a) => <div role="row" className="panel-matrix-row" key={m.name}>
            <span role="rowheader" className={`panel-rowhead${a === answerer ? ' is-on' : ''}`}>{m.name}</span>
            {pairs
              ? models.map((judge, j) => {
                const count = pairCounts[a][j];
                return <button key={judge.name} type="button" role="gridcell" data-cell={`${a}:${j}`}
                  className={`panel-cell is-count${a === j ? ' is-self' : ''}`} aria-pressed={a === answerer && j === column}
                  tabIndex={a === answerer && j === column ? 0 : -1} title={`${judge.name} → ${m.name}: ${count} rating${count === 1 ? '' : 's'}`}
                  style={{ '--shade': `${Math.round(70 * count / maxPair)}%` } as React.CSSProperties} onClick={() => select(a, j)}>{count || ''}</button>;
              })
              : constitution.prompts.map((id, p) => {
                const cell = grid[a][p];
                const judges = cell.judges;
                const single = judges.length === 1 ? judges[0] : null;
                const traced = trace !== undefined && judges.includes(trace);
                const missingHere = judges.some(j => cell.missing.has(j));
                const names = judges.map(j => models[j].name).join(', ');
                return <button key={id} type="button" role="gridcell" data-cell={`${a}:${p}`}
                  className={`panel-cell${!judges.length ? ' is-empty' : ''}${judges.length > 1 ? ' is-multi' : ''}${traced ? ' is-traced' : ''}${missingHere ? ' is-missing' : ''}`}
                  aria-pressed={a === answerer && p === column} tabIndex={a === answerer && p === column ? 0 : -1}
                  title={`${id} · ${names || 'not assigned'} → ${m.name}${missingHere ? ' (judgment missing)' : ''}`}
                  style={single !== null && (trace === undefined || traced) ? { background: judgeColor(single) } : undefined}
                  onClick={() => select(a, p)}>
                  {judges.includes(a) && <span className="panel-dot" aria-label="self-rating" />}
                </button>;
              })}
          </div>)}
        </div>
      </div>

      <aside className="panel-detail" aria-live="polite">
        {pairs ? <PairDetail answerer={answerer} judge={column} />
          : <PromptDetail answerer={answerer} prompt={column} layer={layer} tags={tags[column] ?? []} />}
      </aside>
    </div>

    <details className="panel-checks">
      <summary>Assignment checks</summary>
      <ul>
        <li>Answer slots with a primary judge: <strong>{constitution.primary.flat().filter(j => j >= 0).length}/{models.length * constitution.prompts.length}</strong></li>
        <li>Distinct primary judge lineups across prompts: <strong>{new Set(constitution.prompts.map((_, p) => constitution.primary.map(row => row[p]).join(','))).size}</strong></li>
        <li>Second judges that repeat the primary judge: <strong>{constitution.audits.filter(([a, p, j]) => constitution.primary[a][p] === j).length}/{constitution.audits.length}</strong></li>
        <li>Planned judgments that never arrived: <strong>{constitution.missing.length}</strong> primary, <strong>{constitution.missingAudit.length}</strong> second-judge</li>
      </ul>
    </details>
  </div>;
}

function PromptDetail({ answerer, prompt, layer, tags }: { answerer: number; prompt: number; layer: Layer; tags: number[] }) {
  const { route, data } = useNav();
  const constitution = data.constitutions.find(c => c.id === route.constitution) ?? data.constitutions[0];
  const grid = assignments(constitution, layer);
  const cell = grid[answerer]?.[prompt];
  if (!cell) return null;
  const id = constitution.prompts[prompt];
  const models = data.models;
  const base: Route = { tab: 'sampling', constitution: route.constitution, judges: route.judges, answerer, column: prompt, trace: route.trace };
  const open = route.read !== undefined && cell.judges.includes(route.read) ? route.read : null;
  return <>
    <p className="panel-eyebrow">Prompt <RouteLink to={{ tab: 'scenarios', scenario: id }}>{id}</RouteLink></p>
    <h2>{cell.judges.length ? cell.judges.map(j => models[j].name).join(' + ') : 'Unassigned'} → {models[answerer].name}</h2>
    {cell.judges.includes(answerer) && <p className="panel-flag"><span className="panel-dot" aria-hidden="true" /> Self-rating</p>}
    {tags.length > 0 && <p className="panel-tags">Criteria: {tags.map(n => <RouteLink key={n} to={{ tab: 'criteria', constitution: constitution.id, criterion: n }} title={constitution.criteria[n - 1]}>#{n}</RouteLink>)}</p>}
    <ul className="panel-actions">
      {cell.judges.map(j => <li key={j}>
        {cell.missing.has(j)
          ? <span className="panel-muted">Judgment unavailable{cell.judges.length > 1 ? ` · ${models[j].name}` : ''}</span>
          : <RouteLink to={{ ...base, read: open === j ? undefined : j }} replace aria-current={open === j ? 'page' : undefined}>
            {open === j ? 'Hide' : 'Read'} answer and judgment{cell.judges.length > 1 ? ` · ${models[j].name}` : ''}</RouteLink>}
        <RouteLink to={{ tab: 'sampling', constitution: route.constitution, judges: route.judges, view: 'pairs', answerer, column: j }}>Pair totals</RouteLink>
      </li>)}
    </ul>
    {open !== null && <Evidence constitution={constitution} layer={layer} answerer={answerer} prompt={prompt} judge={open} />}
    <details className="panel-lineup">
      <summary>Full prompt lineup</summary>
      <ul>
        {models.map((m, a) => {
          const judges = grid[a][prompt].judges;
          return <li key={m.name} className={a === answerer ? 'is-on' : ''}>
            <RouteLink to={{ ...base, answerer: a, read: undefined }} replace>
              <span>{m.name}</span>
              <span>{judges.length ? judges.map(j => models[j].name).join(', ') : 'Unassigned'}{judges.includes(a) && <span className="panel-dot" aria-label="self-rating" />}</span>
            </RouteLink>
          </li>;
        })}
      </ul>
    </details>
  </>;
}

function PairDetail({ answerer, judge }: { answerer: number; judge: number }) {
  const { route, data } = useNav();
  const constitution = data.constitutions.find(c => c.id === route.constitution) ?? data.constitutions[0];
  const layer: Layer = route.judges === 'second' ? 'second' : 'primary';
  const grid = assignments(constitution, layer);
  const prompts = constitution.prompts.map((id, p) => ({ id, p })).filter(({ p }) => grid[answerer][p].judges.includes(judge));
  const models = data.models;
  return <>
    <p className="panel-eyebrow">{answerer === judge ? 'Self-pair' : 'Judge → Answerer'}</p>
    <h2>{models[judge].name} → {models[answerer].name}</h2>
    <p>{prompts.length} prompt{prompts.length === 1 ? '' : 's'} in the {layer === 'primary' ? 'primary' : 'second-judge'} layer.</p>
    <ul className="panel-id-list">
      {prompts.map(({ id, p }) => <li key={id}>
        <RouteLink to={{ tab: 'sampling', constitution: route.constitution, judges: route.judges, answerer, column: p, trace: judge }}>{id}</RouteLink>
      </li>)}
    </ul>
  </>;
}
