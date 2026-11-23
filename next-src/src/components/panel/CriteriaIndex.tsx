'use client';

import { useMemo, useState } from 'react';
import { ValueSelect } from '@/components/ValueLogo';
import { RouteLink, useNav } from './PanelExplorer';
import type { Route } from './route';

/** Each constitution's criteria and the prompts written to test them, in the run or the whole bank. */
export function CriteriaIndex() {
  const { route, go, data } = useNav();
  const [find, setFind] = useState('');
  const bankScope = route.scope === 'bank';
  const constitution = data.constitutions.find(c => c.id === (bankScope ? route.bank : route.constitution))
    ?? data.constitutions.find(c => c.id === route.constitution) ?? data.constitutions[0];
  const scenarios = useMemo(() => bankScope ? data.bank : constitution.prompts.map(id => data.bank.find(s => s.id === id)!).filter(Boolean),
    [bankScope, constitution, data.bank]);
  const tagged = useMemo(() => constitution.criteria.map((_, i) => scenarios.filter(s => s.tags[constitution.id]?.includes(i + 1))), [constitution, scenarios]);
  const untagged = scenarios.filter(s => !s.tags[constitution.id]?.length);
  const query = find.trim().replace(/^#/, '');
  const rows = constitution.criteria.map((text, i) => ({ text, n: i + 1 })).filter(({ text, n }) =>
    !query || (/^\d+$/.test(query) ? n === Number(query) : text.toLowerCase().includes(query.toLowerCase())));
  const scoped = (patch: Partial<Route>): Route => bankScope
    ? { tab: 'criteria', scope: 'bank', bank: constitution.id, ...patch }
    : { tab: 'criteria', constitution: constitution.id, ...patch };

  return <div className="panel-body">
    <div className="panel-toolbar">
      <label><span>Constitution</span>
        <ValueSelect value={constitution.id} logoId={constitution.id} onChange={e => go(bankScope
          ? { tab: 'criteria', scope: 'bank', bank: e.target.value } : { tab: 'criteria', constitution: e.target.value })}>
          {data.constitutions.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </ValueSelect>
      </label>
      <label><span>Scenario set</span>
        <select value={bankScope ? 'bank' : 'run'} onChange={e => go(e.target.value === 'bank'
          ? { tab: 'criteria', scope: 'bank', bank: constitution.id } : { tab: 'criteria', constitution: constitution.id })}>
          <option value="run">Run selection ({constitution.prompts.length})</option>
          <option value="bank">Full bank ({data.bank.length})</option>
        </select>
      </label>
      <label className="panel-search"><span>Find a criterion</span>
        <input type="search" placeholder="Number or wording" value={find} onChange={e => setFind(e.target.value)} />
      </label>
    </div>
    <p className="panel-stats"><strong>{scenarios.length}</strong> {bankScope ? 'bank' : 'selected'} prompts · <strong>{constitution.criteria.length}</strong> criteria</p>
    {rows.length ? <ol className="panel-criteria">
      {rows.map(({ text, n }) => {
        const open = route.criterion === n;
        const prompts = tagged[n - 1];
        return <li key={n} className={open ? 'is-open' : ''}>
          <RouteLink to={scoped({ criterion: open ? undefined : n })} className="panel-criterion-row" aria-current={open ? 'page' : undefined}>
            <span className="panel-criterion-number">{String(n).padStart(2, '0')}</span>
            <span>{text}</span>
            <strong title="Tagged prompts">{prompts.length}</strong>
          </RouteLink>
          {open && <div className="panel-criterion-body">
            {prompts.length ? <ul className="panel-id-list">{prompts.map(s => <li key={s.id}>
              <RouteLink to={bankScope ? { tab: 'scenarios', scenario: s.id, constitution: constitution.id, criterion: n }
                : { tab: 'sampling', constitution: constitution.id, column: constitution.prompts.indexOf(s.id) }} title={s.prompt.slice(0, 160)}>{s.id}</RouteLink>
            </li>)}</ul> : <p className="panel-muted">No {bankScope ? 'bank' : 'selected'} prompt is tagged with this criterion.</p>}
            <RouteLink to={{ tab: 'relationships', relationship: `criterion/${constitution.id}/${n}` }}>Criterion relationships</RouteLink>
          </div>}
        </li>;
      })}
    </ol> : <p className="panel-muted">No matching criteria.</p>}
    {untagged.length > 0 && <details className="panel-checks">
      <summary>Untagged prompts ({untagged.length})</summary>
      <ul className="panel-id-list">{untagged.map(s => <li key={s.id}><RouteLink to={{ tab: 'scenarios', scenario: s.id }}>{s.id}</RouteLink></li>)}</ul>
    </details>}
  </div>;
}
