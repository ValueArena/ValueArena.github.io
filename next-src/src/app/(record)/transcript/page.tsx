'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchMeta } from '@/lib/hf';
import { metaEvaluationMode } from '@/lib/protocol';
import {
  FIRST_WINDOW_BYTES,
  JsonlWindowReader,
  WINDOW_BYTES,
  evaluationsURL,
  fetchRawRecord,
  hasDeclines,
  meanRating,
  normalizeJudgment,
  parseCriteria,
  type Criterion,
  type DirectJudgment,
  type Judgment,
  type PairwiseJudgment,
} from '@/lib/transcripts';
import type { EvaluationMode, MetaJson } from '@/lib/types';
import { DirectStrip, PairwiseStrip, StripLegend } from '@/components/CriterionStrip';
import { ModelLogo } from '@/components/ModelLogo';
import { Penguin } from '@/components/Penguin';

/** Rows added per page. The whole run is in memory; this is only rendering. */
const PAGE_ROWS = 400;

/** Search runs over every reflection in the run, so it waits for a pause. */
const SEARCH_DEBOUNCE_MS = 250;

type Shape = {
  mode: EvaluationMode;
  criteria: Criterion[];
  numCriteria: number;
  scaleMin: number;
  scaleMax: number;
};

type Sort = 'file' | 'scenario' | 'weakest' | 'strongest';
type Tab = 'transcript' | 'scoring' | 'record';

export default function TranscriptPage() {
  const [slug, setSlug] = useState('');
  const [meta, setMeta] = useState<MetaJson | null>(null);
  const [shape, setShape] = useState<Shape | null>(null);
  const [judgments, setJudgments] = useState<Judgment[]>([]);
  const [totalBytes, setTotalBytes] = useState(-1);
  const [bytesRead, setBytesRead] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('transcript');
  const [judgeFilter, setJudgeFilter] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [scenarioFilter, setScenarioFilter] = useState('');
  const [declinesOnly, setDeclinesOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sort, setSort] = useState<Sort>('file');
  const [jump, setJump] = useState('');
  const [jumpMiss, setJumpMiss] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_ROWS);

  const readerRef = useRef<JsonlWindowReader | null>(null);
  // Mirrors `judgments` so the scan and the jump control can see what is
  // loaded without waiting for a render.
  const judgmentsRef = useRef<Judgment[]>([]);
  const shapeRef = useRef<Shape | null>(null);
  // A judgment number asked for before the scan reached it.
  const pendingTargetRef = useRef<number | null>(null);

  // Pull one more window and append whatever normalizes out of it.
  const loadMore = useCallback(async (windowBytes: number): Promise<number> => {
    const reader = readerRef.current;
    if (!reader || reader.done) return 0;
    const { records } = await reader.next(windowBytes);
    // A remount installs a fresh reader; drop whatever the superseded one was
    // still fetching rather than appending it twice.
    if (readerRef.current !== reader) return 0;

    // Every record repeats the run's constitution, so the first one settles
    // what meta could not — the mode, the criterion text, the scale.
    if (records.length) {
      const merged = mergeShape(shapeRef.current, records[0].value);
      if (merged && merged !== shapeRef.current) {
        shapeRef.current = merged;
        setShape(merged);
      }
    }

    const numCriteria = shapeRef.current?.numCriteria ?? 0;
    const fresh: Judgment[] = [];
    for (const record of records) {
      const judgment = normalizeJudgment(record, numCriteria);
      if (judgment) fresh.push(judgment);
    }
    if (fresh.length) {
      judgmentsRef.current = judgmentsRef.current.concat(fresh);
      setJudgments(judgmentsRef.current);
    }

    setTotalBytes(reader.totalBytes);
    setBytesRead(reader.offset);
    setExhausted(reader.done);
    return fresh.length;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const raw = (params.get('run') || params.get('slug') || '').replace(/ /g, '+');
      const runId = raw && /^[a-zA-Z0-9\-_./+]+$/.test(raw) ? raw : '';
      if (!runId) {
        setError('No run specified.');
        return;
      }
      setSlug(runId);

      // meta gives the criteria count and rating scale up front; the records
      // can stand in for it if the fetch fails, so this never blocks.
      const loaded = await fetchMeta(runId).catch(() => null);
      if (cancelled) return;
      if (loaded) {
        setMeta(loaded);
        const derived = deriveShape(null, loaded);
        if (derived) {
          shapeRef.current = derived;
          setShape(derived);
        }
      }

      const reader = new JsonlWindowReader(evaluationsURL(runId));
      readerRef.current = reader;
      judgmentsRef.current = [];
      setJudgments([]);

      const wanted = Number(params.get('i'));
      if (Number.isInteger(wanted) && wanted > 0) pendingTargetRef.current = wanted;

      // Read the whole file. Filters that only see part of a run give answers
      // that quietly change as more loads, so the scan runs to the end — but
      // rows land as each window arrives, so the list is usable immediately.
      try {
        let first = true;
        while (!reader.done) {
          await loadMore(first ? FIRST_WINDOW_BYTES : WINDOW_BYTES);
          first = false;
          if (cancelled || readerRef.current !== reader) return;
        }
      } catch (e) {
        if (cancelled || readerRef.current !== reader) return;
        setError(e instanceof Error ? e.message : String(e));
        setExhausted(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadMore]);

  // Select whatever `?i=` or the jump box asked for, once the scan reaches it.
  useEffect(() => {
    const target = pendingTargetRef.current;
    if (target == null) return;
    const hit = judgments.find((j) => j.id >= target);
    if (hit) {
      pendingTargetRef.current = null;
      setSelected(hit.id);
      setJumpMiss(hit.id !== target);
    } else if (exhausted) {
      pendingTargetRef.current = null;
      setJumpMiss(true);
    }
  }, [judgments, exhausted]);

  // Open on the first judgment when nothing else was asked for.
  useEffect(() => {
    if (selected != null || pendingTargetRef.current != null) return;
    if (judgments.length) setSelected(judgments[0].id);
  }, [judgments, selected]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    document.title = slug ? `ValueArena — ${slug} transcripts` : 'ValueArena — Transcripts';
  }, [slug]);

  // Keep the address bar pointing at whatever is on screen.
  useEffect(() => {
    if (!slug || selected == null) return;
    window.history.replaceState(null, '', `?run=${encodeURIComponent(slug)}&i=${selected}`);
  }, [slug, selected]);

  // A narrower filter should start from the top of its own results.
  useEffect(() => {
    setVisibleCount(PAGE_ROWS);
  }, [judgeFilter, modelFilter, scenarioFilter, declinesOnly, debouncedQuery, sort]);

  const goTo = useCallback((target: number) => {
    if (!Number.isInteger(target) || target < 1) return;
    const hit = judgmentsRef.current.find((j) => j.id >= target);
    if (hit) {
      pendingTargetRef.current = null;
      setSelected(hit.id);
      setJumpMiss(hit.id !== target);
    } else {
      pendingTargetRef.current = target;
      setJumpMiss(false);
    }
  }, []);

  const judges = useMemo(() => uniqueSorted(judgments.map((j) => j.judge)), [judgments]);
  const models = useMemo(
    () =>
      uniqueSorted(
        judgments.flatMap((j) => (j.kind === 'direct' ? [j.evaluee] : [j.a.name, j.b.name]))
      ),
    [judgments]
  );

  const filtered = useMemo(() => {
    const numCriteria = shape?.numCriteria ?? 0;
    const needle = debouncedQuery.trim().toLowerCase();
    const scenario = scenarioFilter.trim();
    const rows = judgments.filter((j) => {
      if (judgeFilter && j.judge !== judgeFilter) return false;
      if (modelFilter) {
        const named = j.kind === 'direct' ? [j.evaluee] : [j.a.name, j.b.name];
        if (!named.includes(modelFilter)) return false;
      }
      if (scenario && String(j.scenarioIndex) !== scenario) return false;
      if (declinesOnly && !hasDeclines(j, numCriteria)) return false;
      if (needle && !matches(j, needle)) return false;
      return true;
    });
    if (sort === 'scenario') {
      rows.sort((a, b) => a.scenarioIndex - b.scenarioIndex || a.id - b.id);
    } else if (sort === 'weakest' || sort === 'strongest') {
      const dir = sort === 'weakest' ? 1 : -1;
      rows.sort((a, b) => {
        const av = sortValue(a);
        const bv = sortValue(b);
        if (av == null && bv == null) return a.id - b.id;
        if (av == null) return 1;
        if (bv == null) return -1;
        return dir * (av - bv) || a.id - b.id;
      });
    }
    return rows;
  }, [judgments, judgeFilter, modelFilter, scenarioFilter, declinesOnly, debouncedQuery, sort, shape]);

  const active = useMemo(
    () => judgments.find((j) => j.id === selected) ?? null,
    [judgments, selected]
  );

  if (error && judgments.length === 0) {
    return (
      <div className="error">
        {error}
        <br />
        {slug ? (
          <a href={`/run/?slug=${encodeURIComponent(slug)}`}>Back to the run</a>
        ) : (
          <a href="/">Back to runs</a>
        )}
      </div>
    );
  }

  if (!shape || judgments.length === 0) {
    return (
      <div className="loading">
        <Penguin state="loading" />
        <span>Reading transcripts</span>
      </div>
    );
  }

  const scanning = !exhausted;
  const estimated = estimateTotal(judgments.length, bytesRead, totalBytes);
  const shown = filtered.slice(0, visibleCount);

  return (
    <>
      <div className="breadcrumb">
        <a href="/">ValueArena</a> /{' '}
        <a className="link-subtle" href={`/run/?slug=${encodeURIComponent(slug)}`}>
          {meta?.name || slug}
        </a>{' '}
        / Transcripts
      </div>

      <div className="specimen-hero">
        <div className="specimen-hero-inner">
          <div className="specimen-sigil" style={{ fontSize: '0.8rem' }}>
            {shape.numCriteria}×
          </div>
          <div>
            <div className="specimen-kicker">Transcripts</div>
            <div className="specimen-title">{meta?.name || slug}</div>
            <div className="specimen-sub">
              <span>
                {judgments.length.toLocaleString()} judgment
                {judgments.length === 1 ? '' : 's'}
                {scanning && estimated ? ` of ~${estimated.toLocaleString()}` : ''}
              </span>
              {' · '}
              <span>{shape.numCriteria} criteria</span>
              {' · '}
              <span className={`protocol-badge protocol-${shape.mode}`}>
                {shape.mode === 'direct_rating' ? 'Direct ratings' : 'Pairwise comparisons'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="tx-toolbar">
        {/* Reading forward is the common case; this is for coming back to a
            judgment you already know the number of. */}
        <form
          className="tx-field tx-field-narrow"
          onSubmit={(e) => {
            e.preventDefault();
            goTo(Number(jump));
          }}
        >
          <span>Go to #</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="Number"
            value={jump}
            onChange={(e) => {
              setJump(e.target.value);
              setJumpMiss(false);
            }}
          />
        </form>

        <label className="tx-field">
          <span>Judge</span>
          <select value={judgeFilter} onChange={(e) => setJudgeFilter(e.target.value)}>
            <option value="">Any</option>
            {judges.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </select>
        </label>

        <label className="tx-field">
          <span>{shape.mode === 'direct_rating' ? 'Evaluee' : 'Either response'}</span>
          <select value={modelFilter} onChange={(e) => setModelFilter(e.target.value)}>
            <option value="">Any</option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label className="tx-field tx-field-narrow">
          <span>Scenario</span>
          <input
            type="number"
            inputMode="numeric"
            placeholder="Any"
            value={scenarioFilter}
            onChange={(e) => setScenarioFilter(e.target.value)}
          />
        </label>

        <label className="tx-field tx-field-grow">
          <span>Search</span>
          <input
            type="search"
            placeholder="Scenario, response or reflection text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

        <label className="tx-field tx-field-narrow">
          <span>Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="file">File order</option>
            <option value="scenario">Scenario</option>
            <option value="weakest">Weakest first</option>
            <option value="strongest">Strongest first</option>
          </select>
        </label>

        <label className="tx-check">
          <input
            type="checkbox"
            checked={declinesOnly}
            onChange={(e) => setDeclinesOnly(e.target.checked)}
          />
          <span>Only unanswered criteria</span>
        </label>
      </div>

      <div className="tx-status">
        <StripLegend
          mode={shape.mode === 'direct_rating' ? 'direct' : 'pairwise'}
          scaleMin={shape.scaleMin}
          scaleMax={shape.scaleMax}
        />
        <div className="tx-status-right">
          <span>
            {filtered.length.toLocaleString()} match{filtered.length === 1 ? '' : 'es'} in{' '}
            {judgments.length.toLocaleString()}
          </span>
          {scanning ? (
            <span className="tx-scan" title="Filters cover the whole run once this finishes">
              <span className="tx-scan-bar">
                <span
                  className="tx-scan-fill"
                  style={{ width: `${percentValue(bytesRead, totalBytes)}%` }}
                />
              </span>
              reading {percentRead(bytesRead, totalBytes)}
            </span>
          ) : null}
        </div>
      </div>

      {error ? <div className="tx-warn">Stopped reading: {error}</div> : null}

      {jumpMiss ? (
        <div className="tx-warn tx-warn-soft">
          No judgment is numbered {jump}. Numbers are line numbers in evaluations.jsonl, so a
          number past the end of the file, or one on a line that holds no judgment, has no match —
          the nearest judgment after it is selected instead.
        </div>
      ) : null}

      <div className="tx-split">
        <div className="tx-list">
          <div className="tx-list-rows" role="listbox" aria-label="Judgments">
            {shown.map((j) => (
              <JudgmentRow
                key={j.id}
                judgment={j}
                shape={shape}
                active={j.id === selected}
                onSelect={() => setSelected(j.id)}
              />
            ))}
          </div>

          {filtered.length === 0 ? (
            <p className="tx-empty">
              Nothing matches these filters
              {scanning ? ' yet — the run is still being read.' : ' in this run.'}
            </p>
          ) : null}

          {/* Reaching the end of the rows is where you decide to see more, so
              the control sits here rather than only above the list. */}
          <div className="tx-list-foot">
            {filtered.length > shown.length ? (
              <>
                <button
                  type="button"
                  className="tx-btn tx-btn-wide"
                  onClick={() => setVisibleCount((n) => n + PAGE_ROWS)}
                >
                  Show more
                </button>
                <span className="tx-foot-note">
                  Showing {shown.length.toLocaleString()} of {filtered.length.toLocaleString()}{' '}
                  matches
                </span>
              </>
            ) : (
              <span className="tx-foot-note">
                {scanning
                  ? `End of what has been read — still reading (${percentRead(bytesRead, totalBytes)}).`
                  : `End of the list — all ${filtered.length.toLocaleString()} matches shown.`}
              </span>
            )}
          </div>
        </div>

        <div className="tx-detail">
          {active ? (
            <Detail judgment={active} shape={shape} slug={slug} tab={tab} onTab={setTab} />
          ) : (
            <p className="tx-empty">Select a judgment to read it.</p>
          )}
        </div>
      </div>
    </>
  );
}

// ── List ────────────────────────────────────────────────────────────────────

function JudgmentRow({
  judgment,
  shape,
  active,
  onSelect,
}: {
  judgment: Judgment;
  shape: Shape;
  active: boolean;
  onSelect: () => void;
}) {
  const summary =
    judgment.kind === 'direct'
      ? formatMean(meanRating(judgment))
      : `${judgment.countedThrough}/${shape.numCriteria}`;

  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onSelect}
      className={`tx-row${active ? ' tx-row-active' : ''}`}
    >
      <span className="tx-row-head">
        <span className="tx-row-id">#{judgment.id}</span>
        <span className="tx-row-scenario">s{judgment.scenarioIndex}</span>
        <span className="tx-row-summary">{summary}</span>
      </span>

      {/* Model nicks in a run often share a long prefix, so cutting the end
          would drop the only part that tells them apart. They get the row's
          full width and wrap instead. */}
      <span className="tx-row-who">
        <ModelLogo name={judgment.judge} size={12} />
        <span className="tx-row-judge" title={judgment.judge}>
          {judgment.judge}
        </span>
        {judgment.kind === 'direct' ? (
          <>
            <span className="tx-row-arrow">→</span>
            <ModelLogo name={judgment.evaluee} size={12} />
            <span title={judgment.evaluee}>{judgment.evaluee}</span>
          </>
        ) : (
          <>
            <span className="tx-row-arrow">judged</span>
            <ModelLogo name={judgment.a.name} size={12} />
            <span title={judgment.a.name}>{judgment.a.name}</span>
            <span className="tx-row-arrow">vs</span>
            <ModelLogo name={judgment.b.name} size={12} />
            <span title={judgment.b.name}>{judgment.b.name}</span>
          </>
        )}
      </span>
      {judgment.kind === 'direct' ? (
        <DirectStrip
          judgment={judgment}
          criteriaCount={shape.numCriteria}
          scaleMin={shape.scaleMin}
          scaleMax={shape.scaleMax}
        />
      ) : (
        <PairwiseStrip judgment={judgment} criteriaCount={shape.numCriteria} />
      )}
    </button>
  );
}

// ── Detail ──────────────────────────────────────────────────────────────────

function Detail({
  judgment,
  shape,
  slug,
  tab,
  onTab,
}: {
  judgment: Judgment;
  shape: Shape;
  slug: string;
  tab: Tab;
  onTab: (t: Tab) => void;
}) {
  return (
    <>
      <header className="tx-detail-head">
        <span className="tx-detail-id" title="Line number in evaluations.jsonl">
          #{judgment.id}
        </span>
        <span className="tx-detail-where">
          scenario {judgment.scenarioIndex} · {judgment.judge}
          {judgment.kind === 'direct'
            ? ` → ${judgment.evaluee}`
            : ` · ${judgment.a.name} vs ${judgment.b.name}`}
        </span>
      </header>

      <div className="tx-tabs" role="tablist" aria-label="Judgment detail">
        {(['transcript', 'scoring', 'record'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`tx-tab${tab === t ? ' tx-tab-active' : ''}`}
            onClick={() => onTab(t)}
          >
            {t === 'transcript' ? 'Transcript' : t === 'scoring' ? 'Scoring' : 'Record'}
          </button>
        ))}
      </div>

      {tab === 'transcript' ? (
        judgment.kind === 'direct' ? (
          <DirectTranscript judgment={judgment} />
        ) : (
          <PairwiseTranscript judgment={judgment} />
        )
      ) : null}

      {tab === 'scoring' ? (
        judgment.kind === 'direct' ? (
          <DirectScoring judgment={judgment} shape={shape} />
        ) : (
          <PairwiseScoring judgment={judgment} shape={shape} />
        )
      ) : null}

      {tab === 'record' ? <RawRecord judgment={judgment} slug={slug} /> : null}
    </>
  );
}

/**
 * The original JSON line, re-read from the file.
 *
 * The scan keeps only what the page needs, dropping each record's copy of the
 * constitution, so the untouched record is fetched back by byte range when
 * someone wants to see it. That is one ~9 KB request.
 */
function RawRecord({ judgment, slug }: { judgment: Judgment; slug: string }) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setFailed(null);
    fetchRawRecord(evaluationsURL(slug), judgment.byteStart, judgment.byteLen)
      .then((body) => {
        if (!cancelled) setText(body);
      })
      .catch((e: unknown) => {
        if (!cancelled) setFailed(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [slug, judgment.byteStart, judgment.byteLen]);

  if (failed) return <p className="tx-note">Could not re-read this record: {failed}</p>;
  if (text == null) return <p className="tx-note">Re-reading line {judgment.id}…</p>;
  return <pre className="tx-json">{prettyJson(text)}</pre>;
}

function Message({ role, who, body }: { role: string; who?: string; body: string }) {
  if (!body.trim()) return null;
  return (
    <section className="tx-msg">
      <header className="tx-msg-head">
        <span className="tx-msg-role">{role}</span>
        {who ? (
          <span className="tx-msg-who">
            <ModelLogo name={who} size={12} /> {who}
          </span>
        ) : null}
      </header>
      <div className="tx-msg-body">{body}</div>
    </section>
  );
}

function DirectTranscript({ judgment }: { judgment: DirectJudgment }) {
  return (
    <div className="tx-messages">
      <Message role="Scenario" body={judgment.scenario} />
      <Message role="Response" who={judgment.evaluee} body={judgment.response} />
      <Message role="Reflection" who={judgment.judge} body={judgment.reflection} />
      <Message role="Ratings" who={judgment.judge} body={judgment.judgmentRaw} />
    </div>
  );
}

function PairwiseTranscript({ judgment }: { judgment: PairwiseJudgment }) {
  return (
    <div className="tx-messages">
      <Message role="Scenario" body={judgment.scenario} />
      <Message role="First response" who={judgment.a.name} body={judgment.a.response} />
      <Message role="Second response" who={judgment.b.name} body={judgment.b.response} />
      <Message role="Reflection on first" who={judgment.judge} body={judgment.a.reflection} />
      <Message role="Reflection on second" who={judgment.judge} body={judgment.b.reflection} />
      <Message role="Verdict" who={judgment.judge} body={judgment.judgeResponse} />
    </div>
  );
}

function DirectScoring({ judgment, shape }: { judgment: DirectJudgment; shape: Shape }) {
  const mean = meanRating(judgment);
  return (
    <>
      <div className="tx-score-head">
        <div className="metric-item">
          <div className="metric-label">Mean rating</div>
          <div className="metric-value">{formatMean(mean)}</div>
        </div>
        <div className="metric-item">
          <div className="metric-label">Rated</div>
          <div className="metric-value">
            {judgment.ratings.size}/{shape.numCriteria}
          </div>
        </div>
        <div className="metric-item">
          <div className="metric-label">Scale</div>
          <div className="metric-value">
            {shape.scaleMin}–{shape.scaleMax}
          </div>
        </div>
      </div>
      <table className="elo-table tx-score-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Criterion</th>
            <th className="mono-cell">Rating</th>
          </tr>
        </thead>
        <tbody>
          {criteriaRows(shape).map((c) => {
            const rating = judgment.ratings.get(c.index);
            return (
              <tr key={c.index}>
                <td className="mono-cell">{c.index + 1}</td>
                <td>{c.body}</td>
                <td className="mono-cell">
                  {rating == null ? <span className="tx-declined">declined</span> : rating}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function PairwiseScoring({ judgment, shape }: { judgment: PairwiseJudgment; shape: Shape }) {
  const dropped = shape.numCriteria - judgment.countedThrough;
  return (
    <>
      <div className="tx-score-head">
        <div className="metric-item">
          <div className="metric-label">Counted</div>
          <div className="metric-value">
            {judgment.countedThrough}/{shape.numCriteria}
          </div>
        </div>
        <div className="metric-item">
          <div className="metric-label">First response</div>
          <div className="metric-value">{judgment.a.name}</div>
        </div>
        <div className="metric-item">
          <div className="metric-label">Second response</div>
          <div className="metric-value">{judgment.b.name}</div>
        </div>
      </div>
      {dropped > 0 ? (
        <p className="tx-note">
          Training keeps the longest unbroken run of verdicts starting at criterion 1, so the last{' '}
          {dropped} criteri{dropped === 1 ? 'on' : 'a'} of this judgment did not count toward the
          run.
        </p>
      ) : null}
      <table className="elo-table tx-score-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Criterion</th>
            <th>Verdict</th>
          </tr>
        </thead>
        <tbody>
          {criteriaRows(shape).map((c) => {
            const counted = c.index < judgment.countedThrough;
            const choice = counted ? judgment.choices.get(c.index) : undefined;
            return (
              <tr key={c.index} className={counted ? undefined : 'tx-row-muted'}>
                <td className="mono-cell">{c.index + 1}</td>
                <td>{c.body}</td>
                <td>
                  {choice === 1 ? (
                    judgment.a.name
                  ) : choice === 2 ? (
                    judgment.b.name
                  ) : choice === 0 ? (
                    'Tie'
                  ) : (
                    <span className="tx-declined">{counted ? 'no verdict' : 'not counted'}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function criteriaRows(shape: Shape): Criterion[] {
  if (shape.criteria.length) return shape.criteria.slice(0, shape.numCriteria);
  return Array.from({ length: shape.numCriteria }, (_, i) => ({
    index: i,
    text: `Criterion ${i + 1}`,
    body: `Criterion ${i + 1}`,
  }));
}

/**
 * Fill in what meta could not supply from the record itself.
 *
 * meta carries the mode, criterion count and scale but not the criterion text
 * — only the path to the constitution file. The records carry the text, so the
 * first one to arrive completes the shape.
 */
function mergeShape(existing: Shape | null, raw: unknown): Shape | null {
  if (existing && existing.criteria.length) return existing;
  const fromRecord = deriveShape(raw, null);
  if (!existing) return fromRecord;
  if (!fromRecord || !fromRecord.criteria.length) return existing;
  return { ...existing, criteria: fromRecord.criteria };
}

/** Read mode, criteria and scale from meta if present, else from a record. */
function deriveShape(raw: unknown, meta: MetaJson | null): Shape | null {
  let mode: EvaluationMode | null = null;
  let criteria: Criterion[] = [];

  if (meta) {
    mode = metaEvaluationMode(meta);
  }
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    if (!mode) {
      mode =
        r.record_type === 'direct_rating' || Array.isArray(r.ratings)
          ? 'direct_rating'
          : 'pairwise_btd';
    }
    criteria = parseCriteria(r.constitution);
  }
  if (!mode) return null;

  const declared = Number(meta?.constitution?.num_criteria);
  const numCriteria = Number.isFinite(declared) && declared > 0 ? declared : criteria.length || 0;
  if (!numCriteria) return null;

  const direct = (meta?.evaluation?.direct_rating || {}) as Record<string, unknown>;
  const scaleMin = Number(direct.scale_min);
  const scaleMax = Number(direct.scale_max);

  return {
    mode,
    criteria,
    numCriteria,
    scaleMin: Number.isFinite(scaleMin) ? scaleMin : 1,
    scaleMax: Number.isFinite(scaleMax) ? scaleMax : 10,
  };
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function matches(j: Judgment, needle: string): boolean {
  if (j.scenario.toLowerCase().includes(needle)) return true;
  if (j.kind === 'direct') {
    return j.response.toLowerCase().includes(needle) || j.reflection.toLowerCase().includes(needle);
  }
  return (
    j.a.response.toLowerCase().includes(needle) ||
    j.b.response.toLowerCase().includes(needle) ||
    j.a.reflection.toLowerCase().includes(needle) ||
    j.b.reflection.toLowerCase().includes(needle)
  );
}

/** What "weakest" orders by: mean rating, or the share of criteria counted. */
function sortValue(j: Judgment): number | null {
  return j.kind === 'direct' ? meanRating(j) : j.countedThrough;
}

function formatMean(value: number | null): string {
  return value == null ? '—' : value.toFixed(1);
}

function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function estimateTotal(count: number, bytesRead: number, totalBytes: number): number | null {
  if (count === 0 || bytesRead <= 0 || totalBytes <= 0) return null;
  return Math.round((count / bytesRead) * totalBytes);
}

function percentValue(bytesRead: number, totalBytes: number): number {
  if (totalBytes <= 0) return 0;
  return Math.min(100, Math.round((bytesRead / totalBytes) * 100));
}

function percentRead(bytesRead: number, totalBytes: number): string {
  if (totalBytes <= 0) return '—';
  return `${percentValue(bytesRead, totalBytes)}%`;
}
