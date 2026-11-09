'use client';

import { ValueSelect } from './ValueLogo';
import { useEffect, useMemo, useRef, useState } from 'react';
import { constLabel } from '@/lib/nicks';
import { usePublishedBoards } from './usePublishedBoards';
import { ModelLogo } from './ModelLogo';
import { ValuePortrait } from './ValuePortrait';
import { profileURL, scoreRank } from '@/lib/arena-data';

const SYMBOL_TONES = ['sage', 'sand', 'mint', 'clay', 'dusk'] as const;
const VALUE_ORDER: Record<string, number> = { taoism_constitution: 0, mathematical: 1 };

export function ConstitutionDirectory() {
  const data = usePublishedBoards();
  const [active, setActive] = useState('taoism_constitution');
  const directory = useRef<HTMLElement>(null);
  const initialHashHandled = useRef(false);
  const shown = useMemo(() => [...data.boards].sort((a, b) =>
    (VALUE_ORDER[a.id] ?? 2) - (VALUE_ORDER[b.id] ?? 2)
  ), [data.boards]);
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
    const chapters = Array.from(directory.current?.querySelectorAll<HTMLElement>('.value-chapter') || []);
    if (!chapters.length) return;
    if (!initialHashHandled.current) {
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
  }, [shown]);

  const jumpToValue = (id: string) => {
    const chapter = document.getElementById(`value-${id}`);
    if (!chapter) return;
    history.replaceState(history.state, '', `${location.pathname}${location.search}#value-${id}`);
    chapter.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };

  return <section className="values-directory" ref={directory}>
    <header className="values-heading" id="values-top">
      <div><h1>Model performance across values</h1><p>Different values, different rankings.</p></div>
      <nav className="values-controls" aria-label="Value index">
        <ValueSelect aria-label="Jump to a value" disabled={!shown.length} value={current?.id || ''} onChange={e => jumpToValue(e.target.value)}>
          {!shown.length && <option value="">{data.loading ? 'Loading values…' : 'No values'}</option>}
          {shown.map(board => <option key={board.id} value={board.id}>{constLabel(board.id)}</option>)}
        </ValueSelect>
      </nav>
    </header>
    {data.error ? <div className="results-status" role="alert">{data.error}<button onClick={data.retry}>Retry</button></div>
      : data.loading ? <p className="results-status" role="status">Loading values…</p>
        : !shown.length ? <p className="results-status">No values have published results yet.</p>
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
