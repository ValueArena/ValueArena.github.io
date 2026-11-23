'use client';

import { useEffect, useState } from 'react';
import { fetchRawRecord } from '@/lib/transcripts';
import { renderMarkdownSanitized } from '@/lib/chat-render';
import { judgmentFileURL, rangeKey, type Layer, type PanelConstitution } from './data';
import { RouteLink, useNav } from './PanelExplorer';
import { renameModels } from '@/lib/model-names';

interface JudgmentRecord {
  response: string;
  reflection: string;
  judgment_raw: string;
  ratings: { criterion_index: number; criterion: string; rating: number }[];
}

type Part = 'answer' | 'ratings' | 'reflection' | 'raw';
const PARTS: { id: Part; label: string }[] = [
  { id: 'answer', label: 'Answer' }, { id: 'ratings', label: 'Ratings' },
  { id: 'reflection', label: 'Reflection' }, { id: 'raw', label: 'Raw' },
];
const cache = new Map<string, Promise<JudgmentRecord>>();

function loadJudgment(url: string, start: number, length: number): Promise<JudgmentRecord> {
  const key = `${url}#${start}`;
  if (!cache.has(key)) {
    const pending = fetchRawRecord(url, start, length).then(text => renameModels(JSON.parse(text) as JudgmentRecord));
    pending.catch(() => cache.delete(key));
    cache.set(key, pending);
  }
  return cache.get(key)!;
}

/** One judgment, read from the run's JSONL file with a single Range request. */
export function Evidence({ constitution, layer, answerer, prompt, judge }: {
  constitution: PanelConstitution; layer: Layer; answerer: number; prompt: number; judge: number;
}) {
  const { data } = useNav();
  const [part, setPart] = useState<Part>('answer');
  const [record, setRecord] = useState<JudgmentRecord | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const range = constitution.ranges[rangeKey(layer, answerer, prompt, judge)];

  useEffect(() => {
    if (!range) return;
    let active = true;
    setRecord(null); setHtml(null); setFailed(false);
    loadJudgment(judgmentFileURL(constitution, layer), range[0], range[1])
      .then(r => {
        if (!active) return;
        setRecord(r);
        renderMarkdownSanitized(r.response).then(out => { if (active) setHtml(out); }).catch(() => {});
      })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [constitution, layer, range, attempt]);

  const who = `${data.models[judge].name} judging ${data.models[answerer].name}`;
  if (!range) return <p className="panel-note">No {layer === 'second' ? 'second-judge ' : ''}judgment was recorded for {who}: the answer was blank after retries.</p>;
  if (failed) return <p className="panel-note" role="alert">Judgment unavailable. <button type="button" className="panel-link-button" onClick={() => setAttempt(n => n + 1)}>Retry</button></p>;
  if (!record) return <p className="panel-note" role="status">Loading the judgment…</p>;
  return <article className="panel-evidence" aria-label={`Judgment: ${who}`}>
    <div className="panel-segmented" role="tablist" aria-label="Judgment part">
      {PARTS.map(p => <button key={p.id} type="button" role="tab" aria-selected={part === p.id} onClick={() => setPart(p.id)}>{p.label}</button>)}
    </div>
    {part === 'answer' && (html
      ? <div className="panel-prose" dangerouslySetInnerHTML={{ __html: html }} />
      : <div className="panel-prose panel-pre">{record.response}</div>)}
    {part === 'ratings' && <ol className="panel-ratings">
      {record.ratings.map(r => <li key={r.criterion_index}>
        <RouteLink to={{ tab: 'criteria', constitution: constitution.id, criterion: r.criterion_index + 1 }} className="panel-criterion-number">#{r.criterion_index + 1}</RouteLink>
        <span>{r.criterion}</span>
        <strong>{r.rating}<small>/10</small></strong>
      </li>)}
    </ol>}
    {part === 'reflection' && <div className="panel-prose panel-pre">{record.reflection}</div>}
    {part === 'raw' && <pre className="panel-raw">{record.judgment_raw}</pre>}
  </article>;
}
