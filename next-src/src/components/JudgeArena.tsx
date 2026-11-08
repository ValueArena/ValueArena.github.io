'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ModelLogo } from './ModelLogo';
import { Penguin } from './Penguin';
import { asset } from '@/lib/config';
import { fetchSummary } from '@/lib/hf';
import { validRows } from '@/lib/chart-data';
import { renderMarkdownSanitized } from '@/lib/chat-render';
import { clearVotes, loadVotes, saveVote, stats, type Matchup, type Pack, type PackInfo, type Pick, type Vote, type JudgeVerdict } from '@/lib/judge';

/** Votes needed before the values match opens. */
const UNLOCK = 10;
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function JudgeArena() {
  const [packs, setPacks] = useState<PackInfo[]>([]);
  const [active, setActive] = useState('');
  const [pack, setPack] = useState<Pack | null>(null);
  const [error, setError] = useState('');
  const [votes, setVotes] = useState<Vote[]>([]);
  const [current, setCurrent] = useState<Matchup | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [pick, setPick] = useState<Pick | null>(null);
  const [elo, setElo] = useState<{ model: string; elo: number }[]>([]);
  const [shareStatus, setShareStatus] = useState('');
  const card = useRef<HTMLElement>(null);

  useEffect(() => {
    setVotes(loadVotes());
    fetch(asset('/judge/index.json')).then(r => r.ok ? r.json() : Promise.reject()).then((d: { constitutions: PackInfo[] }) => {
      setPacks(d.constitutions);
      const wanted = new URLSearchParams(location.search).get('value');
      setActive(d.constitutions.some(c => c.id === wanted) ? wanted! : d.constitutions[0]?.id || '');
    }).catch(() => setError('Could not load the questions. Reload to try again.'));
  }, []);

  const next = useCallback((from: Pack, voted: Vote[], skip?: string) => {
    const done = new Set(voted.map(v => v.id));
    const open = from.matchups.filter(m => !done.has(m.id) && m.id !== skip);
    setCurrent(open.length ? open[Math.floor(Math.random() * open.length)] : null);
    setFlipped(Math.random() < .5);
    setPick(null);
    setShareStatus('');
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setPack(null); setCurrent(null); setElo([]);
    history.replaceState(null, '', `?value=${active}`);
    fetch(asset(`/judge/${active}.json`)).then(r => r.ok ? r.json() : Promise.reject()).then((p: Pack) => {
      if (cancelled) return;
      setPack(p); next(p, loadVotes());
      fetchSummary(p.run).then(rows => {
        if (!cancelled) setElo(validRows(rows).sort((x, y) => y.elo_mean - x.elo_mean).map(r => ({ model: r.model_name, elo: r.elo_mean })));
      }).catch(() => { /* the ranking table just stays empty */ });
    }).catch(() => { if (!cancelled) setError('Could not load these questions. Reload to try again.'); });
    return () => { cancelled = true; };
  }, [active, next]);

  const left = current && (flipped ? current.b : current.a), right = current && (flipped ? current.a : current.b);
  const toCanonical = (side: 'left' | 'right' | 'tie'): Pick => side === 'tie' ? 'tie' : (side === 'left') !== flipped ? 'a' : 'b';
  const label = (p: Pick) => p === 'tie' ? 'even' : (p === 'a') !== flipped ? 'Answer A' : 'Answer B';

  const vote = useCallback((side: 'left' | 'right' | 'tie') => {
    if (!current || !pack || pick) return;
    const p = side === 'tie' ? 'tie' : (side === 'left') !== flipped ? 'a' : 'b';
    setPick(p);
    setVotes(saveVote({ id: current.id, constitution: pack.id, pick: p, a: current.a.model, b: current.b.model, verdict: current.verdict, judges: current.judges.map(j => ({ name: j.name, pick: j.pick })), at: Date.now() }));
  }, [current, pack, pick, flipped]);

  const goNext = useCallback(() => {
    if (!pack) return;
    next(pack, votes, current?.id);
    const top = card.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) card.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [pack, votes, current, next]);

  // 1 / ← picks A, 2 calls it even, 3 / → picks B; Enter or → moves on after the reveal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || target.closest('input, select, textarea')) return;
      if (e.key === 'Enter' && target.closest('button, a, summary')) return;
      if (!pick) {
        const side = ({ '1': 'left', ArrowLeft: 'left', '2': 'tie', '3': 'right', ArrowRight: 'right' } as const)[e.key as '1'];
        if (side) { e.preventDefault(); vote(side); }
      } else if (e.key === 'Enter' || e.key === 'ArrowRight' || e.key === 'n') { e.preventDefault(); goNext(); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [pick, vote, goNext]);

  const overall = useMemo(() => stats(votes), [votes]);
  const here = useMemo(() => stats(votes.filter(v => v.constitution === active)), [votes, active]);
  const votedHere = votes.filter(v => v.constitution === active).length;

  const share = async () => {
    const judge = overall.judges.find(j => j.total >= 3);
    const text = `I agree with the AI judges ${pct(overall.agreementRate ?? 0)} of the time on ValueArena${judge ? `. The AI judge closest to me: ${judge.name}` : ''}. Do you agree with them?`;
    const url = `${location.origin}/judge/`;
    try {
      if (navigator.share) { await navigator.share({ title: 'You vs the AI judges', text, url }); return; }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setShareStatus('Copied to clipboard');
    } catch { setShareStatus(''); }
  };

  if (error) return <div className="judge-page"><p className="chart-message" role="alert">{error}</p></div>;

  return <div className="judge-page">
    <header className="judge-head">
      <p className="judge-kicker">You vs the AI judges</p>
      <h1>Do you agree with the AI judges?</h1>
      <p>Read an AI dilemma and two anonymous answers from frontier models. Pick the one that better fits the value, then see which answer the AI judges scored higher.</p>
    </header>

    <div className="judge-values" role="group" aria-label="Value">
      {packs.map(c => <button key={c.id} type="button" aria-pressed={c.id === active} onClick={() => setActive(c.id)}>
        {c.label}<small>{votes.filter(v => v.constitution === c.id).length}/{c.count}</small>
      </button>)}
    </div>

    <dl className="judge-record" aria-label="Your record">
      <div><dt>Votes</dt><dd>{overall.votes}</dd></div>
      <div><dt>Agree with AI judges</dt><dd>{overall.agreementRate === null ? '–' : pct(overall.agreementRate)}</dd></div>
      <div><dt>Streak</dt><dd>{overall.streak}</dd></div>
    </dl>

    <div className="judge-layout">
      <article className="judge-card" ref={card} aria-live="polite">
        {!pack ? <p className="chart-message chart-loading" role="status"><Penguin size={36} state="loading" /><span>Loading questions…</span></p>
          : !current ? <div className="judge-done"><h2>You’ve judged every {pack.label.toLowerCase()} question.</h2><p>Try another value, or look at how your picks compare with the AI judges.</p>
            <div className="judge-done-values">{packs.filter(c => c.id !== active).map(c => <button key={c.id} type="button" onClick={() => setActive(c.id)}>{c.label} →</button>)}</div></div>
          : <>
            <div className="judge-card-top">
              <span className="judge-value-tag">{pack.label}</span>
              <h2>{pack.question}</h2>
              <details className="judge-criteria"><summary>What the judges look for</summary><ul>{pack.criteria.map(c => <li key={c}>Prefers the answer that {c}</li>)}</ul></details>
            </div>
            <div className="judge-scenario"><span>The dilemma</span><p>{current.scenario}</p></div>
            <div className="judge-answers">
              <Answer letter="A" side={left!} revealed={!!pick} chosen={!!pick && pick === toCanonical('left')} scoredBy={current.judges.find(j => j.side === toCanonical('left'))} scale={pack.scale} />
              <Answer letter="B" side={right!} revealed={!!pick} chosen={!!pick && pick === toCanonical('right')} scoredBy={current.judges.find(j => j.side === toCanonical('right'))} scale={pack.scale} />
            </div>
            {!pick ? <div className="judge-vote">
              <button type="button" className="judge-pick" onClick={() => vote('left')}>A is better</button>
              <button type="button" className="judge-even" onClick={() => vote('tie')}>About the same</button>
              <button type="button" className="judge-pick" onClick={() => vote('right')}>B is better</button>
              <p className="judge-keys" aria-hidden="true">Keys: 1 or ← for A · 2 for even · 3 or → for B</p>
            </div> : <Reveal matchup={current} pick={pick} flipped={flipped} label={label} run={pack.run} scale={pack.scale} onNext={goNext} />}
          </>}
      </article>

      <aside className="judge-aside" aria-label="Your values match">
        <section className="judge-panel">
          <h2>Your values match</h2>
          {overall.votes < UNLOCK ? <>
            <div className="judge-progress" role="progressbar" aria-valuemin={0} aria-valuemax={UNLOCK} aria-valuenow={overall.votes} aria-label="Votes towards your values match"><span style={{ width: `${overall.votes / UNLOCK * 100}%` }} /></div>
            <p className="judge-panel-note">{UNLOCK - overall.votes} more {UNLOCK - overall.votes === 1 ? 'vote' : 'votes'} to see which models and which AI judge share your values.</p>
          </> : <>
            <h3>Models whose answers you prefer</h3>
            <ol className="judge-bars">{overall.models.filter(m => m.games >= 2).slice(0, 3).map(m => <li key={m.model}>
              <span><ModelLogo name={m.model} size={18} />{m.model}</span><b>{pct(m.rate)}</b>
              <i aria-hidden="true"><em style={{ width: pct(m.rate) }} /></i>
            </li>)}</ol>
            {(() => { const j = overall.judges.find(x => x.total >= 3); return j && <>
              <h3>The AI judge closest to you</h3>
              <p className="judge-twin"><ModelLogo name={j.name} size={22} /><span><strong>{j.name}</strong>agreed with you on {pct(j.rate)} of {j.total} calls</span></p>
            </>; })()}
            <button type="button" className="judge-share" onClick={share}>Share my result</button>
            {shareStatus && <span className="judge-share-status" role="status">{shareStatus}</span>}
          </>}
        </section>

        <section className="judge-panel">
          <h2>{pack?.label ?? 'Value'} rankings</h2>
          <table className="judge-table">
            <thead><tr><th scope="col">Model</th><th scope="col">AI judges</th><th scope="col">You</th><th scope="col">Community <span className="judge-soon">soon</span></th></tr></thead>
            <tbody>{elo.map((row, i) => {
              const mine = here.models.filter(m => m.games >= 2);
              const rank = mine.findIndex(m => m.model === row.model);
              return <tr key={row.model}><th scope="row"><ModelLogo name={row.model} size={16} /><span title={row.model}>{row.model}</span></th><td>#{i + 1}</td><td>{rank >= 0 ? `#${rank + 1}` : '–'}</td><td className="judge-muted">–</td></tr>;
            })}</tbody>
          </table>
          <p className="judge-panel-note">AI judges: the published EigenBench ranking. You: your {votedHere ? `${votedHere} ` : ''}{pack?.label.toLowerCase() ?? ''} votes, once a model has appeared twice. The community ranking opens when voting goes live.</p>
        </section>

        <p className="judge-fineprint">Your votes are saved in this browser only for now.{votes.length > 0 && <> <button type="button" onClick={() => { if (confirm('Clear all your votes on this device?')) setVotes(clearVotes()); }}>Clear my votes</button></>}</p>
      </aside>
    </div>
  </div>;
}

function Answer({ letter, side, revealed, chosen, scoredBy, scale }: { letter: string; side: { model: string; response: string }; revealed: boolean; chosen: boolean; scoredBy?: JudgeVerdict; scale: number }) {
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const text = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    setHtml(null); setOpen(false);
    renderMarkdownSanitized(side.response).then(out => { if (!cancelled) setHtml(out); }).catch(() => { /* plain text stays */ });
    return () => { cancelled = true; };
  }, [side.response]);
  useEffect(() => {
    const el = text.current;
    if (el) setLong(el.scrollHeight > el.clientHeight + 4);
  }, [side.response, html]);
  return <section className={`judge-answer${chosen ? ' is-chosen' : ''}${revealed ? ' is-revealed' : ''}`} aria-label={`Answer ${letter}`}>
    <header>
      <span className="judge-letter">Answer {letter}</span>
      {revealed && <span className="judge-model"><ModelLogo name={side.model} size={18} />{side.model}</span>}
      {chosen && <span className="judge-badge">Your pick</span>}
    </header>
    {html != null
      ? <div ref={text} className={`judge-answer-text judge-md${open ? ' is-open' : ''}`} dangerouslySetInnerHTML={{ __html: html }} />
      : <div ref={text} className={`judge-answer-text${open ? ' is-open' : ''}`}>{side.response}</div>}
    {long && <button type="button" className="judge-more" onClick={() => setOpen(o => !o)} aria-expanded={open}>{open ? 'Show less' : 'Show full answer'}</button>}
    {revealed && scoredBy && <p className="judge-answer-votes">Scored <b>{scoredBy.score}/{scale}</b> by {scoredBy.name}</p>}
  </section>;
}

function Reveal({ matchup, pick, flipped, label, run, scale, onNext }: { matchup: Matchup; pick: Pick; flipped: boolean; label: (p: Pick) => string; run: string; scale: number; onNext: () => void }) {
  const headline = pick === matchup.verdict ? 'The AI judges agreed with you' : `The AI judges preferred ${label(matchup.verdict)}`;
  const tone = pick === matchup.verdict ? 'is-agree' : pick === 'tie' ? 'is-split' : 'is-disagree';
  // List the judges in on-screen order: whoever scored Answer A first.
  const judges = [...matchup.judges].sort((x, y) => Number((x.side === 'a') === flipped) - Number((y.side === 'a') === flipped));
  const next = useRef<HTMLButtonElement>(null);
  useEffect(() => { next.current?.focus({ preventScroll: true }); }, []);
  return <div className={`judge-reveal ${tone}`}>
    <p className="judge-verdict" role="status">{headline}</p>
    <p className="judge-reveal-note">Each answer was scored by a different AI judge. The scores are compared after adjusting for how generous each judge usually is.</p>
    <ul className="judge-judges">{judges.map(j => {
      const usual = Math.abs(j.z) < .15 ? 'about its usual score' : j.z > 0 ? 'above its usual score' : 'below its usual score';
      return <li key={j.name}>
        <span className="judge-judge-name"><ModelLogo name={j.name} size={18} />{j.name}</span>
        <span className="judge-judge-pick">scored {label(j.side)} <b>{j.score}/{scale}</b></span>
        <span className="judge-score" aria-hidden="true"><i style={{ width: `${j.score / scale * 100}%` }} /></span>
        <small className="judge-judge-usual">{usual}</small>
      </li>;
    })}</ul>
    <div className="judge-reveal-actions">
      <button ref={next} type="button" className="button-primary" onClick={onNext}>Next dilemma →</button>
      <a href={`/transcript/?run=${encodeURIComponent(run)}&i=${judges[0].line}`}>Read the AI judges’ reasoning</a>
    </div>
  </div>;
}
