'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ModelLogo } from './ModelLogo';
import { usePublishedBoards } from './usePublishedBoards';
import { constLabel } from '@/lib/nicks';
import { modelInfo } from '@/lib/registry';
import { modelMatch, scoreRank } from '@/lib/arena-data';
import { ModelProfile } from './ModelProfile';

function jumpToProfile(article: HTMLElement) {
  const inset = (document.querySelector('.arena-nav')?.getBoundingClientRect().bottom ?? 56) + 12;
  window.scrollTo({ top: Math.max(0, article.getBoundingClientRect().top + scrollY - inset), behavior: 'instant' });
}

export function ModelBrowser() {
  const [preferred, setPreferred] = useState('');
  const [value, setValue] = useState('kindness');
  const [model, setModel] = useState('');
  const [query, setQuery] = useState('');
  const [developer, setDeveloper] = useState('');
  const [ready, setReady] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const profiles = useRef<HTMLDivElement>(null);
  const initialPositioned = useRef(false);
  const pendingJump = useRef<string | null>(null);
  const directory = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setPreferred(params.get('run') || ''); setValue(params.get('constitution') || 'kindness');
    setModel(params.get('id') || params.get('model') || ''); setReady(true);
  }, []);
  const data = usePublishedBoards(ready ? preferred : null);
  const board = data.boards.find(b => b.run.slug === preferred) || data.boards.find(b => b.id === value) || data.boards[0];
  const rows = data.scores[board?.run.slug || ''];
  const selected = modelMatch(rows || [], model);
  const name = selected?.model_name || model || rows?.[0]?.model_name || '';
  const developers = [...new Set((rows || []).map(row => modelInfo(row.model_name)?.lab || 'Other'))].sort();
  const shown = useMemo(() => (rows || []).filter(row => row.model_name.toLowerCase().includes(query.toLowerCase()) && (!developer || (modelInfo(row.model_name)?.lab || 'Other') === developer)), [rows, query, developer]);
  const names = useMemo(() => shown.map(row => row.model_name), [shown]);
  const selectModel = useCallback((next: string) => {
    setModel(next); setDirectoryOpen(false); pendingJump.current = next;
  }, []);
  useEffect(() => {
    if (!profiles.current || !names.length) return;
    const articles = Array.from(profiles.current.querySelectorAll<HTMLElement>('[data-model]'));
    // Only an explicit model selection or initial deep link changes scroll position.
    if (!initialPositioned.current) {
      initialPositioned.current = true;
      const requested = new URLSearchParams(location.search).get('id') || new URLSearchParams(location.search).get('model');
      const target = articles.find(el => el.dataset.model === modelMatch(rows || [], requested || '')?.model_name);
      if (target && target !== articles[0]) jumpToProfile(target);
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = (document.querySelector('.arena-nav')?.getBoundingClientRect().bottom ?? 56) + 80;
      let active = articles[0];
      for (const article of articles) {
        if (article.getBoundingClientRect().top > line) break;
        active = article;
      }
      if (scrollY + innerHeight >= document.documentElement.scrollHeight - 2) active = articles.at(-1)!;
      if (active?.dataset.model) setModel(active.dataset.model);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(schedule);
    observer.observe(profiles.current);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule); schedule();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); };
  }, [names, rows]);
  useEffect(() => {
    const target = pendingJump.current;
    if (!target || directoryOpen) return;
    pendingJump.current = null;
    const article = Array.from(profiles.current?.querySelectorAll<HTMLElement>('[data-model]') || []).find(el => el.dataset.model === target);
    if (article) jumpToProfile(article);
  }, [model, directoryOpen]);
  useEffect(() => {
    if (!ready || !board || !name) return;
    const params = new URLSearchParams({ id: name, constitution: board.id, run: board.run.slug });
    history.replaceState(history.state, '', `${location.pathname}?${params}`);
    document.title = `${name} | ValueArena`;
  }, [ready, board, name]);
  useEffect(() => {
    const list = directory.current, selected = list?.querySelector('[aria-pressed=true]');
    if (!list || !selected || !list.clientHeight) return;
    const item = selected.getBoundingClientRect(), bounds = list.getBoundingClientRect();
    if (item.top < bounds.top) list.scrollTop -= bounds.top - item.top;
    else if (item.bottom > bounds.bottom) list.scrollTop += item.bottom - bounds.bottom;
  }, [name, directoryOpen]);
  const chooseValue = (id: string) => { setValue(id); setPreferred(''); setModel(''); setQuery(''); setDeveloper(''); };
  return <div className="results-browser">
    <aside className="model-directory" aria-label="Model rankings" data-open={directoryOpen}>
      <button className="directory-mobile-toggle" aria-expanded={directoryOpen} aria-label="Choose a model" onClick={() => setDirectoryOpen(!directoryOpen)}>{name || 'Choose a model'}<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M3 4.5l3 3 3-3" stroke="currentColor" /></svg></button>
      <header><h1 className="sr-only">Leaderboard</h1><div className="directory-filters"><select aria-label="Ranking value" value={board?.id || value} onChange={e => chooseValue(e.target.value)}>{data.boards.map(b => <option key={b.id} value={b.id}>{constLabel(b.id)}</option>)}</select><select aria-label="Developer" value={developer} onChange={e => setDeveloper(e.target.value)}><option value="">All developers</option>{developers.map(lab => <option key={lab}>{lab}</option>)}</select></div>
        <input type="search" aria-label="Find a model" placeholder="Search models" value={query} onChange={e => setQuery(e.target.value)} />
        <div className="directory-columns"><span>Rank</span><span>Model</span><span>Score</span></div>
      </header>
      {data.error ? <div className="results-status" role="alert">{data.error}<button onClick={data.retry}>Retry</button></div>
        : data.loading || !!board && !rows && !data.failures[board?.run.slug || ''] ? <p className="results-status" role="status">Loading rankings…</p>
          : data.failures[board?.run.slug || ''] ? <div className="results-status">Scores could not be loaded.<button onClick={data.retry}>Retry</button></div>
            : <div className="model-directory-list" ref={directory}>{shown.length ? shown.map(row => <button key={row.model_name} onClick={() => selectModel(row.model_name)} aria-pressed={name === row.model_name}>
              <span className="directory-rank">{scoreRank(rows!, row)}</span><span className="directory-model-logo"><ModelLogo name={row.model_name} size={16} /></span><span>{row.model_name}</span><strong>{Math.round(row.elo_mean)}</strong>
            </button>) : <p className="results-status">No matching models.</p>}</div>}
      {board && <label className="directory-run">Evaluation run<select aria-label="Evaluation run" value={board.run.slug} onChange={e => { setPreferred(e.target.value); setModel(''); }}>{board.runs.map(run => <option key={run.slug} value={run.slug}>{run.name || run.slug}</option>)}</select></label>}
    </aside>
    <p className="sr-only" role="status" aria-live="polite">{name && `Selected model: ${name}`}</p>
    <div className="model-profile-list" ref={profiles}>
      {shown.map(row => <ModelProfile key={`${board?.run.slug}:${row.model_name}`} name={row.model_name} active={name === row.model_name} board={board} rows={rows} data={data} />)}
      {!shown.length && <p className="results-status">{rows ? 'No matching models.' : 'Loading model profiles…'}</p>}
    </div>
  </div>;
}
