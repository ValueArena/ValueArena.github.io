'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePublishedBoards } from './usePublishedBoards';
import { ComparisonPicker } from './ComparisonPicker';
import { ModelLogo } from './ModelLogo';
import { constLabel } from '@/lib/nicks';
import { CONSTITUTION_TAGLINES } from '@/lib/taglines';
import { ComparisonValueChart, ComparisonRanks, ComparisonMetadata } from './ComparisonVisuals';
import { modelInfo } from '@/lib/registry';
import { modelMatch, profileURL, rowStrength, scoreInterval } from '@/lib/arena-data';

export function ModelComparison() {
  const [ready, setReady] = useState(false);
  const [models, setModels] = useState<string[] | null>(null);
  const [values, setValues] = useState(['kindness', 'conservatism', 'deep_ecology', 'lockean_rights_constitution', 'marxism_constitution', 'taoism_constitution']);
  const [preferred, setPreferred] = useState('');
  const [chartValue, setChartValue] = useState('kindness');
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const names = [...new Set(params.getAll('model'))].slice(0, 7);
    if (names.length) setModels(names);
    const ids = [...new Set(params.getAll('value'))];
    if (ids.length) { setValues(ids); setChartValue(ids[0]); }
    setPreferred(params.get('run') || ''); setReady(true);
  }, []);
  const data = usePublishedBoards(ready ? preferred : null);
  const first = data.boards.find(b => b.id === 'kindness') || data.boards[0];
  const firstRows = data.scores[first?.run.slug || ''];
  useEffect(() => {
    if (models !== null || !firstRows) return;
    const labs = new Set<string>();
    const initial = firstRows.filter(row => {
      const lab = modelInfo(row.model_name)?.lab || row.model_name;
      if (labs.has(lab)) return false;
      labs.add(lab); return true;
    }).slice(0, 5).map(row => row.model_name);
    setModels(initial);
  }, [models, firstRows]);
  const selected = models || [];
  const choices = useMemo(() => [...new Set([...selected, ...Object.values(data.scores).flat().map(r => r.model_name)])].sort((a, b) => a.localeCompare(b)), [data.scores, models]);
  const boards = data.boards.filter(b => values.includes(b.id));
  const chartBoard = boards.find(b => b.id === chartValue) || boards[0];
  useEffect(() => {
    if (!ready || models === null) return;
    const params = new URLSearchParams();
    models.forEach(name => params.append('model', name)); values.forEach(id => params.append('value', id));
    if (preferred) params.set('run', preferred);
    history.replaceState(null, '', `${location.pathname}?${params}`);
  }, [models, values, ready, preferred]);

  return <div className="comparison-page">
    <header className="results-page-heading"><h1>Compare models</h1></header>
    <section className="comparison-selection" aria-label="Comparison selection">
      <div><ComparisonPicker label="Models" choices={choices.map(id => ({ id, label: id }))} selected={selected} onChange={setModels} limit={7} />
        <div className="selection-chips">{selected.map(name => <button key={name} onClick={() => setModels(selected.filter(n => n !== name))} aria-label={`Remove ${name}`}><ModelLogo name={name} size={18} /><span>{name}</span><span aria-hidden="true">×</span></button>)}</div>
      </div>
      <div><ComparisonPicker label="Values" choices={data.boards.map(b => ({ id: b.id, label: constLabel(b.id) }))} selected={values} onChange={setValues} />
        <div className="selection-chips">{values.map(id => <button key={id} onClick={() => setValues(values.filter(v => v !== id))} aria-label={`Remove ${constLabel(id)}`}><span>{constLabel(id)}</span><span aria-hidden="true">×</span></button>)}</div>
      </div>
    </section>
    {data.error ? <div className="results-status" role="alert">{data.error}<button onClick={data.retry}>Retry</button></div>
      : data.loading ? <p className="results-status" role="status">Loading evaluations…</p>
        : !selected.length || !boards.length ? <p className="results-status">Select models and values to build a comparison.</p>
          : <>
            <div className="results-table-scroll comparison-matrix"><table><caption className="sr-only">EigenBench scores by value, with reported 95% intervals. Each row uses one evaluation run.</caption><thead><tr><th>Value</th>{selected.map(name => <th key={name}><ModelLogo name={name} size={14} /><a href={profileURL(name, boards.find(b => modelMatch(data.scores[b.run.slug] || [], name))?.run.slug || boards[0]?.run.slug || '')}>{name}</a></th>)}</tr></thead>
              <tbody>{boards.map(board => { const rows = data.scores[board.run.slug]; return <tr key={board.id}><th><a href={`/leaderboard/?constitution=${encodeURIComponent(board.id)}&run=${encodeURIComponent(board.run.slug)}`}>{constLabel(board.id)}</a><span className="matrix-description">{CONSTITUTION_TAGLINES[board.id]}</span></th>
                {selected.map(name => { const row = rows && modelMatch(rows, name); return <td key={name} style={row ? { background: `color-mix(in srgb,var(--accent) ${4 + rowStrength(rows!, row) * 17}%,var(--bg))` } : undefined}>
                  {row ? <a className="matrix-score" href={`/transcript/?run=${encodeURIComponent(board.run.slug)}&model=${encodeURIComponent(row.model_name)}`} aria-label={`${name}, ${constLabel(board.id)}, score ${row.elo_mean.toFixed(1)}, view responses`}><strong>{row.elo_mean.toFixed(1)}</strong><span>{scoreInterval(row) || 'Interval not reported'}</span></a>
                    : data.failures[board.run.slug] ? <button className="results-retry" onClick={data.retry}>Retry</button> : <span className="matrix-empty">{rows ? 'Not evaluated' : 'Loading…'}</span>}</td>; })}</tr>; })}</tbody>
            </table></div>
            <ComparisonValueChart models={selected} boards={boards} scores={data.scores} value={chartBoard?.id || ''} onValueChange={setChartValue} />
            <ComparisonRanks models={selected} boards={boards} scores={data.scores} />
            <ComparisonMetadata models={selected} />
            <div className="comparison-links"><a href="/methodology/#comparisons">Methodology</a><a href="/responses/">Compare responses</a></div>
          </>}
  </div>;
}
