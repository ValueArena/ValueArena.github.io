'use client';

import { useEffect, useRef, useState } from 'react';
import { ModelLogo } from './ModelLogo';
import { closestModels, matchScores, type MatchPack, type MatchPick, type MatchQuestion } from '@/lib/model-match';
import { renderMarkdownSanitized } from '@/lib/chat-render';

const STORE = 'eigenbench-model-match-v1';

function ResponseText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  // Exact excerpts from the saved response; no generated summaries.
  const cut = text.indexOf('\n\n', 240);
  const preview = cut > 0 && cut < 700 ? cut : Math.min(text.length, 600);
  const short = text.length > preview + 100;
  const shown = expanded || !short ? text : `${text.slice(0, preview).trim()}…`;
  const [html, setHtml] = useState<{ text: string; html: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    renderMarkdownSanitized(shown).then(html => { if (!cancelled && html !== null) setHtml({ text: shown, html }); }).catch(() => { /* Keep the original text if formatting is unavailable. */ });
    return () => { cancelled = true; };
  }, [shown]);
  return <>{html?.text === shown ? <div className="match-response-text match-response-markdown" dangerouslySetInnerHTML={{ __html: html.html }} /> : <div className="match-response-text">{shown}</div>}{short && <button className="match-read" type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : 'Read full response'}</button>}</>;
}

function SavedEvidence({ question }: { question: MatchQuestion }) {
  return <div className="match-evidence"><span>Saved evaluation: {question.value}</span><a href={`/run/?slug=${encodeURIComponent(question.run)}`}>Explore evaluation</a>{question.judges.map(judge => <a key={`${judge.name}-${judge.line}`} href={`/transcript/?run=${encodeURIComponent(question.run)}&i=${judge.line}`}>
    {judge.name} rated {question[judge.side].model} {judge.score.toFixed(1)}/10
  </a>)}</div>;
}

export function ModelMatch() {
  const [pack, setPack] = useState<MatchPack | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [answers, setAnswers] = useState<(MatchPick | null)[]>([]);
  const [flips, setFlips] = useState<boolean[]>([]);
  const [index, setIndex] = useState(0);
  const [screen, setScreen] = useState<'intro' | 'quiz' | 'result'>('intro');
  const [copied, setCopied] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusNext = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    fetch('/model-match.json', { signal: controller.signal }).then(r => {
      if (!r.ok) throw new Error('Could not load quiz');
      return r.json() as Promise<MatchPack>;
    }).then(data => {
      let picks: (MatchPick | null)[] = data.questions.map(() => null);
      let order = data.questions.map(() => Math.random() < .5);
      try {
        const saved = JSON.parse(sessionStorage.getItem(STORE) || 'null');
        if (saved?.version === data.version && saved.answers?.length === picks.length && saved.answers.every((a: unknown) => a === null || ['a', 'b', 'skip'].includes(String(a))) && saved.flips?.length === order.length && saved.flips.every((f: unknown) => typeof f === 'boolean')) {
          picks = saved.answers; order = saved.flips;
        }
      } catch { /* The quiz works without browser storage. */ }
      setAnswers(picks); setFlips(order); setPack(data);
    }).catch(e => { if (e.name !== 'AbortError') setError(true); });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (!pack) return;
    try { sessionStorage.setItem(STORE, JSON.stringify({ version: pack.version, answers, flips })); } catch { /* Optional persistence. */ }
  }, [pack, answers, flips]);
  useEffect(() => {
    if (!focusNext.current) return;
    focusNext.current = false;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [screen, index]);

  const move = (next: number) => { focusNext.current = true; setIndex(next); };
  const begin = () => {
    if (!pack) return;
    focusNext.current = true;
    const next = answers.findIndex(answer => answer === null);
    setIndex(next < 0 ? 0 : next); setScreen(next < 0 ? 'result' : 'quiz');
  };
  const choose = (pick: MatchPick) => setAnswers(previous => previous.map((answer, i) => i === index ? pick : answer));
  const finish = () => { focusNext.current = true; setScreen('result'); };
  const restart = () => {
    if (!pack) return;
    setAnswers(pack.questions.map(() => null)); setFlips(pack.questions.map(() => Math.random() < .5)); setCopied(false); setIndex(0); focusNext.current = true; setScreen('quiz');
  };
  const completed = answers.filter(Boolean).length;

  if (screen === 'intro') return <section className="model-match-intro">
    <div><h1>Which model thinks<br />most like you?</h1><p>Ten situations. Two anonymous responses each. Choose the answer closer to what you would do, then discover your model match.</p>
      <div className="match-intro-meta"><span>10 scenarios</span><span>5 models</span><span>No signup</span></div>
      <div className="eigenbench-actions"><button className="eigenbench-primary" onClick={begin} disabled={!pack}>{pack ? completed === answers.length ? 'See your match' : completed ? 'Continue your match' : 'Find my model match' : error ? 'Questions unavailable' : 'Loading questions…'}</button><a href="/evaluate/">Create an evaluation</a></div>
      {error && <p role="alert" className="match-load-error">Couldn’t load the saved responses. <button onClick={() => setAttempt(n => n + 1)}>Try again</button></p>}
      <p className="match-saved-note">Real responses from saved EigenBench evaluations. Your choices stay in this browser tab.</p>
    </div><img className="match-intro-art" src="/assets/art/model-conversation-values.webp" width="320" height="240" alt="Three pixel computers gathered around a table" />
  </section>;

  if (!pack) return null;
  if (screen === 'result') {
    const scores = matchScores(pack, answers), winners = closestModels(scores, answers);
    const decisive = answers.filter(answer => answer && answer !== 'skip').length;
    return <section className="model-match-results">
      <div className="match-result-heading"><span className="match-eyebrow">Your model match</span><h1 ref={heading} tabIndex={-1}>{!winners.length ? 'A few more choices would help.' : winners.length === 1 ? <>You leaned toward<br />{winners[0].model}.</> : 'Your closest matches are tied.'}</h1>
        {winners.length > 0 && <div className="match-winners">{winners.map(w => <span key={w.model}><ModelLogo name={w.model} size={40} />{w.model}</span>)}</div>}
        <p>{winners.length ? 'Based on which saved responses you preferred in these scenarios.' : 'Make a choice in at least six scenarios to see a match. “Neither / unsure” is left out of the comparison.'}</p>
      </div>
      <div className="match-standings"><header><h2>How your choices compared</h2><span>Responses you chose</span></header>{scores.map(score => <div className="match-standing" key={score.model}><div><ModelLogo name={score.model} size={22} /><span>{score.model}</span><strong>{score.chosen} / {score.compared}</strong></div><span className="match-score-track"><span style={{ width: `${score.rate * 100}%` }} /></span>{score.compared < 2 && <small>Too few comparisons to rank</small>}</div>)}<p>You made {decisive} choices and skipped {answers.length - decisive}. Each model appeared four times. Skipped scenarios don’t count; models need two comparisons to qualify. This is a match to these responses, not a complete measure of your values.</p></div>
      <div className="eigenbench-actions"><button className="eigenbench-primary" onClick={() => { focusNext.current = true; setIndex(0); setScreen('quiz'); }}>Review my choices</button><button onClick={restart}>Start again</button>{winners.length > 0 && <button onClick={async () => { try { await navigator.clipboard.writeText(`My closest model ${winners.length === 1 ? 'match is' : 'matches are'} ${winners.map(w => w.model).join(' and ')}, based on 10 saved-response scenarios on EigenBench. Try yours: ${location.origin}/eigenbench/`); setCopied(true); } catch { setCopied(false); } }}>{copied ? 'Copied' : 'Copy result'}</button>}</div>
      <section className="match-review"><h2>The choices behind your match</h2>{pack.questions.map((question, i) => <details key={question.id}><summary><span>{String(i + 1).padStart(2, '0')}</span><span>{question.scenario}</span><strong>{answers[i] && answers[i] !== 'skip' ? question[answers[i] as 'a' | 'b'].model : 'Neither / unsure'}</strong></summary><div className="match-review-responses">{(['a', 'b'] as const).map(side => <article key={side}><h3><ModelLogo name={question[side].model} size={20} />{question[side].model}{answers[i] === side && <span>Your choice</span>}</h3><ResponseText text={question[side].response} /></article>)}</div><SavedEvidence question={question} /></details>)}</section>
    </section>;
  }

  const question = pack.questions[index], selected = answers[index];
  const sides: ('a' | 'b')[] = flips[index] ? ['b', 'a'] : ['a', 'b'];
  return <section className="model-match-quiz" aria-label="Model match quiz">
    <div className="match-progress-heading"><span>Scenario {index + 1} of {pack.questions.length}</span><button onClick={() => setScreen('intro')}>Save and exit</button></div>
    <progress value={index + 1} max={pack.questions.length} aria-label="Quiz progress" />
    <h1 ref={heading} tabIndex={-1}>What would you do?</h1><p className="match-scenario">{question.scenario}</p>
    <p className="match-question">Which response is closer to how you would respond?</p>
    <div className="match-response-grid" key={question.id}>{sides.map((side, i) => <article className="match-response" data-selected={selected === side} key={side}>
      <h2><span>{i === 0 ? 'A' : 'B'}</span>Response {i === 0 ? 'A' : 'B'}</h2><ResponseText text={question[side].response} />
      <button className="match-pick" aria-pressed={selected === side} onClick={() => choose(side)}>{selected === side ? 'Selected' : `I’m closer to ${i === 0 ? 'A' : 'B'}`}</button>
    </article>)}</div>
    <div className="match-quiz-bottom"><button className="match-skip" aria-pressed={selected === 'skip'} onClick={() => choose('skip')}>Neither / unsure</button><div><button disabled={index === 0} onClick={() => move(index - 1)}>Back</button><button className="eigenbench-primary" disabled={!selected} onClick={() => index === pack.questions.length - 1 ? finish() : move(index + 1)}>{index === pack.questions.length - 1 ? 'See my match' : 'Next scenario'}</button></div></div>
    <p className="match-saved-note">Model names are revealed at the end. These are previously recorded responses.</p>
  </section>;
}
