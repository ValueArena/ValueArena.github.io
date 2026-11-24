'use client';

import { ValueLogo, ValueSelect } from './ValueLogo';
import { useEffect, useRef, useState } from 'react';
import { constLabel } from '@/lib/nicks';
import { CONSTITUTION_TAGLINES } from '@/lib/taglines';
import { usePublishedBoards } from './usePublishedBoards';
import { ModelLogo } from './ModelLogo';
import { ValuePortrait } from './ValuePortrait';
import { DEFAULT_VALUE, profileURL, scoreRank } from '@/lib/arena-data';

const SYMBOL_TONES = ['sage', 'sand', 'mint', 'clay', 'dusk'] as const;

export function ConstitutionDirectory() {
  const data = usePublishedBoards();
  const [active, setActive] = useState(DEFAULT_VALUE);
  const [view, setView] = useState<'chapters' | 'overview'>('chapters');
  const [spotlight, setSpotlight] = useState<string | null>(null);
  const directory = useRef<HTMLElement>(null);
  const initialHashHandled = useRef(false);
  const pendingScroll = useRef<string | null>(null);
  const shown = data.boards;
  const current = shown.find(board => board.id === active) || shown[0];

  useEffect(() => {
    const root = directory.current;
    const heading = root?.querySelector<HTMLElement>('.values-heading');
    if (!root || !heading) return;
    const measure = () => root.style.setProperty('--values-content-top', `${Math.ceil(56 + heading.getBoundingClientRect().height)}px`);
    const observer = new ResizeObserver(measure);
    observer.observe(heading); measure();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (view !== 'chapters') return;
    const chapters = Array.from(directory.current?.querySelectorAll<HTMLElement>('.value-chapter') || []);
    if (!chapters.length) return;
    if (pendingScroll.current) {
      const target = document.getElementById(`value-${pendingScroll.current}`);
      pendingScroll.current = null;
      target?.scrollIntoView({ block: 'start', behavior: 'instant' });
    } else if (!initialHashHandled.current) {
      initialHashHandled.current = true;
      chapters.find(chapter => chapter.id === location.hash.slice(1))?.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const headingBottom = directory.current?.querySelector('.values-heading')?.getBoundingClientRect().bottom || 56;
      const readingLine = headingBottom + (innerHeight - headingBottom) * .45;
      let next = chapters[0];
      for (const chapter of chapters) {
        if (chapter.getBoundingClientRect().top > readingLine) break;
        next = chapter;
      }
      if (scrollY + innerHeight >= document.documentElement.scrollHeight - 2) next = chapters.at(-1)!;
      setActive(next.dataset.value!);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(schedule);
    const story = directory.current?.querySelector('.values-chapters');
    if (story) observer.observe(story);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('hashchange', schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('hashchange', schedule);
    };
  }, [shown, view]);

  const jumpToValue = (id: string) => {
    if (view !== 'chapters') {
      pendingScroll.current = id;
      setActive(id);
      setView('chapters');
      history.replaceState(history.state, '', `${location.pathname}${location.search}#value-${id}`);
      return;
    }
    const chapter = document.getElementById(`value-${id}`);
    if (!chapter) return;
    history.replaceState(history.state, '', `${location.pathname}${location.search}#value-${id}`);
    chapter.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };

  return <section className="values-directory" ref={directory}>
    <header className="values-heading" id="values-top">
      <div><h1>Model performance across values</h1><p>{view === 'overview' ? 'All constitutions at a glance. Hover any model to trace its rank across values.' : 'Different values, different rankings.'}</p></div>
      <nav className="values-controls" aria-label="Value index">
        <div className="arena-scope-tabs" role="tablist" aria-label="Values layout">
          <button type="button" role="tab" aria-selected={view === 'chapters'} onClick={() => setView('chapters')}>Chapters</button>
          <button type="button" role="tab" aria-selected={view === 'overview'} onClick={() => { setSpotlight(null); setView('overview'); }}>Top-down</button>
        </div>
        {view === 'chapters' && <ValueSelect aria-label="Jump to a value" disabled={!shown.length} value={current?.id || ''} onChange={e => jumpToValue(e.target.value)}>
          {!shown.length && <option value="">{data.loading ? 'Loading values…' : 'No values'}</option>}
          {shown.map(board => <option key={board.id} value={board.id}>{constLabel(board.id)}</option>)}
        </ValueSelect>}
      </nav>
    </header>
    {data.error ? <div className="results-status" role="alert">{data.error}<button onClick={data.retry}>Retry</button></div>
      : data.loading ? <p className="results-status" role="status">Loading values…</p>
        : !shown.length ? <p className="results-status">No values have published results yet.</p>
          : view === 'overview' ? <div className="values-overview" onMouseLeave={() => setSpotlight(null)}>
            {shown.map((board, i) => {
              const rows = data.scores[board.run.slug];
              const href = `/leaderboard/?constitution=${encodeURIComponent(board.id)}&run=${encodeURIComponent(board.run.slug)}`;
              const min = rows?.length ? Math.min(...rows.map(r => r.elo_mean)) : 1400;
              const max = rows?.length ? Math.max(...rows.map(r => r.elo_mean)) : 1600;
              const span = Math.max(1, max - min);
              return <article className="value-tile" key={board.id} data-tone={SYMBOL_TONES[i % SYMBOL_TONES.length]}>
                <header className="value-tile-head">
                  <button type="button" className="value-tile-title" onClick={() => jumpToValue(board.id)} title={`Zoom into ${constLabel(board.id)}`}>
                    <ValueLogo id={board.id} size={30} />
                    <span>
                      <strong>{constLabel(board.id)}</strong>
                      {CONSTITUTION_TAGLINES[board.id] && <small>{CONSTITUTION_TAGLINES[board.id]}</small>}
                    </span>
                  </button>
                </header>
                {rows?.length ? <ol className="value-tile-list">{rows.map(row => {
                  const pct = Math.max(8, ((row.elo_mean - min) / span) * 100);
                  const isSpot = spotlight === row.model_name;
                  const isDim = !!spotlight && !isSpot;
                  return <li key={row.model_name} data-spot={isSpot || undefined} data-dim={isDim || undefined}>
                    <a href={profileURL(row.model_name, board.run.slug)}
                      onMouseEnter={() => setSpotlight(row.model_name)}
                      onFocus={() => setSpotlight(row.model_name)}
                      title={`${row.model_name} · ${row.elo_mean.toFixed(1)} Elo`}>
                      <span className="value-tile-rank">{scoreRank(rows, row)}</span>
                      <ModelLogo name={row.model_name} size={15} />
                      <span className="value-tile-name">{row.model_name}</span>
                      <span className="value-tile-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
                      <strong>{row.elo_mean.toFixed(0)}</strong>
                    </a>
                  </li>;
                })}</ol> : data.failures[board.run.slug] ? <button className="results-retry" onClick={data.retry}>Retry</button> : <p className="value-tile-status">{rows ? 'No scores.' : 'Loading…'}</p>}
                <footer className="value-tile-foot">
                  <a href={href}>Leaderboard</a>
                  <a href={`/constitution/?id=${encodeURIComponent(board.id)}`}>Criteria</a>
                </footer>
              </article>;
            })}
          </div>
            : <div className="values-story">
            <div className="value-symbol-stage" aria-hidden="true" data-value={current?.id}>
              {shown.map((board, i) => <div key={board.id} className="value-symbol-layer" data-active={current?.id === board.id} data-tone={SYMBOL_TONES[i % SYMBOL_TONES.length]}>
                <ValuePortrait id={board.id} priority={i === 0} />
              </div>)}
            </div>
            <div className="values-chapters">{shown.map(board => {
              const rows = data.scores[board.run.slug], date = new Date(board.run.timestamp);
              const href = `/leaderboard/?constitution=${encodeURIComponent(board.id)}&run=${encodeURIComponent(board.run.slug)}`;
              return <article className="value-chapter" id={`value-${board.id}`} data-value={board.id} data-active={current?.id === board.id} key={board.id} aria-labelledby={`value-title-${board.id}`}>
                <div className="value-chapter-intro">
                  <h2 id={`value-title-${board.id}`}>{constLabel(board.id)}</h2>
                </div>
                {/* Accessible in chapter order; also becomes the visible portrait on small screens. */}
                <div className="value-chapter-portrait"><ValuePortrait id={board.id} /></div>
                <div className="value-chapter-leaders">
                  <header><h3>Top models</h3><span>Elo</span></header>
                  {rows?.length ? <ol>{rows.slice(0, 3).map(row => <li key={row.model_name}><a href={profileURL(row.model_name, board.run.slug)} title={row.model_name}>
                    <span className="value-model-rank">{scoreRank(rows, row)}</span><ModelLogo name={row.model_name} size={20} /><span className="value-model-name">{row.model_name}</span><strong>{row.elo_mean.toFixed(1)}</strong>
                  </a></li>)}</ol> : data.failures[board.run.slug] ? <button className="results-retry" onClick={data.retry}>Retry scores</button> : <p role="status">{rows ? 'No model scores available.' : 'Loading scores…'}</p>}
                </div>
                <div className="value-chapter-meta"><span>{rows?.length ?? Number(board.run.models_count || 0)} models tested</span>{Number.isFinite(date.getTime()) && <time dateTime={date.toISOString()}>Evaluated {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</time>}</div>
                <div className="value-chapter-links"><a href={href}>View results</a><a href={`/constitution/?id=${encodeURIComponent(board.id)}`}>Read constitution</a></div>
              </article>;
            })}</div>
          </div>}
  </section>;
}
