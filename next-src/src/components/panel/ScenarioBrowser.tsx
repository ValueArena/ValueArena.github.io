'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { BankScenario } from './data';
import { RouteLink, useNav } from './PanelExplorer';
import type { Route } from './route';

const REUSE = [['', 'Any'], ['1', '1'], ['2-4', '2–4'], ['5+', '5+']] as const;
const BREADTH = [['', 'Any'], ['1-5', '1–5'], ['6-10', '6–10'], ['11+', '11+']] as const;
const SORTS = [['', 'Scenario ID'], ['reuse', 'Most constitutions'], ['breadth', 'Most criteria']] as const;

const reuseOf = (s: BankScenario) => Object.keys(s.tags).length;
const breadthOf = (s: BankScenario) => Object.values(s.tags).reduce((n, list) => n + list.length, 0);
function inBand(value: number, band?: string): boolean {
  if (!band) return true;
  if (band.endsWith('+')) return value >= Number(band.slice(0, -1));
  const [low, high] = band.split('-').map(Number);
  return high === undefined ? value === low : value >= low && value <= high;
}

/** Read any bank scenario and see which constitutions' criteria it was written to test. */
export function ScenarioBrowser() {
  const { route, go, data } = useNav();
  const constitution = data.constitutions.find(c => c.id === route.constitution);
  const filters: Route = { tab: 'scenarios', q: route.q, constitution: route.constitution, criterion: route.criterion, reuse: route.reuse, breadth: route.breadth, sort: route.sort };
  const matches = useMemo(() => {
    const q = (route.q ?? '').trim().toLowerCase();
    const list = data.bank.filter(s =>
      (!q || s.id.toLowerCase().includes(q) || s.prompt.toLowerCase().includes(q))
      && (!constitution || s.tags[constitution.id]?.length)
      && (!constitution || route.criterion === undefined || s.tags[constitution.id]?.includes(route.criterion))
      && inBand(reuseOf(s), route.reuse) && inBand(breadthOf(s), route.breadth));
    if (route.sort === 'reuse') list.sort((a, b) => reuseOf(b) - reuseOf(a) || a.id.localeCompare(b.id));
    if (route.sort === 'breadth') list.sort((a, b) => breadthOf(b) - breadthOf(a) || a.id.localeCompare(b.id));
    return list;
  }, [data.bank, constitution, route.q, route.criterion, route.reuse, route.breadth, route.sort]);
  const current = matches.find(s => s.id === route.scenario) ?? matches[0];
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    listRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' });
  }, [current?.id]);

  const update = (patch: Partial<Route>, replace = false) => go({ ...filters, scenario: current?.id, ...patch }, replace);
  const moreOpen = Boolean(route.reuse || route.breadth || route.sort);
  const runs = current ? data.constitutions.filter(c => c.prompts.includes(current.id)) : [];
  const runFor = runs.find(c => c.id === route.constitution) ?? runs[0];

  return <div className="panel-body">
    <div className="panel-toolbar">
      <label className="panel-search"><span>Search</span>
        <input type="search" placeholder="ID or prompt text" value={route.q ?? ''} onChange={e => update({ q: e.target.value || undefined }, true)} />
      </label>
      <label><span>Constitution</span>
        <select value={constitution?.id ?? ''} onChange={e => update({ constitution: e.target.value || undefined, criterion: undefined })}>
          <option value="">All constitutions</option>
          {data.constitutions.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </label>
      {constitution && <label><span>Criterion</span>
        <select value={route.criterion ?? ''} onChange={e => update({ criterion: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">Any criterion</option>
          {constitution.criteria.map((text, i) => <option key={i} value={i + 1} title={text}>#{i + 1}</option>)}
        </select>
      </label>}
    </div>
    <details className="panel-more" open={moreOpen}>
      <summary>More filters</summary>
      <div className="panel-toolbar">
        <label><span>Constitutions per prompt</span>
          <select value={route.reuse ?? ''} onChange={e => update({ reuse: e.target.value || undefined })}>{REUSE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <label><span>Criteria per prompt</span>
          <select value={route.breadth ?? ''} onChange={e => update({ breadth: e.target.value || undefined })}>{BREADTH.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <label><span>Sort</span>
          <select value={route.sort ?? ''} onChange={e => update({ sort: e.target.value || undefined })}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
      </div>
    </details>

    <div className="panel-reader">
      <nav className="panel-index" aria-label="Scenarios">
        <p className="panel-eyebrow">Scenario · {matches.length} match{matches.length === 1 ? '' : 'es'}</p>
        <select className="panel-picker" aria-label="Scenario" value={current?.id ?? ''} onChange={e => update({ scenario: e.target.value })}>
          {matches.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}
        </select>
        <ol ref={listRef}>
          {matches.map(s => <li key={s.id}>
            <RouteLink to={{ ...filters, scenario: s.id }} aria-current={s.id === current?.id ? 'page' : undefined}
              title={s.prompt.slice(0, 160)}>{s.id}<small>{reuseOf(s)} · {breadthOf(s)}</small></RouteLink>
          </li>)}
        </ol>
      </nav>
      {current ? <article className="panel-scenario">
        <header>
          <h2>{current.id}</h2>
          {runFor && <RouteLink to={{ tab: 'sampling', constitution: runFor.id, column: runFor.prompts.indexOf(current.id) }}>Judge assignments</RouteLink>}
        </header>
        <p className="panel-prompt">{current.prompt}</p>
        <h3>Tagged criteria</h3>
        <table className="panel-tag-table">
          <tbody>{Object.entries(current.tags).sort(([a], [b]) => a.localeCompare(b)).map(([id, numbers]) => {
            const c = data.constitutions.find(x => x.id === id);
            return <tr key={id}>
              <th scope="row">{c?.label ?? id}{c?.prompts.includes(current.id) && <small> · in run</small>}</th>
              <td>{numbers.map(n => <RouteLink key={n} to={{ tab: 'criteria', scope: 'bank', bank: id, criterion: n }} title={c?.criteria[n - 1]}>#{n}</RouteLink>)}</td>
            </tr>;
          })}</tbody>
        </table>
      </article> : <p className="panel-note">No matching scenarios.</p>}
    </div>
  </div>;
}
