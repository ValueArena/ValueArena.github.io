'use client';

import { useEffect, useMemo, useState } from 'react';
import { CONSTITUTIONS, REF_ANCHOR } from '@/lib/config';
import { fetchIndex, fetchMeta, fetchSummary } from '@/lib/hf';
import {
  constLabel,
  formatModelId,
  inferInfoFromNick,
  inferPromptedConstitution,
  modelTypeLabel,
  normConst,
  normalizeNick,
} from '@/lib/nicks';
import type { IndexRun, MetaJson, MetaModel, Summary } from '@/lib/types';
import { ModelSigil } from '@/components/ModelLogo';
import { Sparkbar } from '@/components/Sparkbar';
import { Penguin } from '@/components/Penguin';

interface Appearance {
  run: IndexRun;
  meta: MetaJson;
  summary: Summary;
  info: MetaModel;
  elo: number | null;
  ci_low: number | null;
  ci_high: number | null;
  rank: number | null;
  field_size: number;
  const_id: string;
}

interface PageState {
  status: 'loading' | 'no-id' | 'not-found' | 'error' | 'ok';
  nick?: string;
  requested?: string;
  appearances?: Appearance[];
  message?: string;
}

export default function ModelPage() {
  const [state, setState] = useState<PageState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      // URLSearchParams turns "+" into " " per form-urlencoded; reverse so
      // canonical nicks like "claude+4+sonnet" survive round-tripping.
      const requestedRaw = (params.get('id') || '').replace(/ /g, '+');
      if (!requestedRaw) {
        if (!cancelled) setState({ status: 'no-id' });
        return;
      }

      try {
        const index = await fetchIndex();
        const runs = [...(index.runs || [])].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        const fetched = await Promise.all(
          runs.map(async (r) => {
            try {
              const [meta, summary] = await Promise.all([fetchMeta(r.slug), fetchSummary(r.slug)]);
              return { run: r, meta, summary };
            } catch {
              return null;
            }
          })
        );

        // Resolve the requested id to a canonical nick (exact → case-insensitive
        // → separator-insensitive). Identical to the legacy fallback logic.
        const seenNicks = new Set<string>();
        for (const x of fetched) {
          if (!x) continue;
          for (const row of x.summary || []) {
            if (row.model_name) seenNicks.add(row.model_name);
          }
          for (const k of Object.keys(x.meta?.models || {})) seenNicks.add(k);
        }
        let nick: string | null = null;
        if (seenNicks.has(requestedRaw)) {
          nick = requestedRaw;
        } else {
          const reqLow = requestedRaw.toLowerCase();
          const reqNorm = normalizeNick(requestedRaw);
          for (const n of seenNicks) {
            if (n.toLowerCase() === reqLow) {
              nick = n;
              break;
            }
          }
          if (!nick) {
            for (const n of seenNicks) {
              if (normalizeNick(n) === reqNorm) {
                nick = n;
                break;
              }
            }
          }
        }

        if (!nick) {
          if (!cancelled) setState({ status: 'not-found', requested: requestedRaw });
          return;
        }
        // Rewrite URL to canonical nick so deep-links converge.
        if (nick !== requestedRaw) {
          const newUrl = `${window.location.pathname}?id=${encodeURIComponent(nick)}${window.location.hash || ''}`;
          window.history.replaceState({}, '', newUrl);
        }

        const appearances: Appearance[] = [];
        for (const x of fetched) {
          if (!x || !x.summary) continue;
          const sEntry = x.summary.find((s) => s.model_name === nick);
          const inMeta = x.meta?.models?.[nick];
          if (!sEntry && !inMeta) continue;
          const ranked = [...x.summary].sort((a, b) => b.elo_mean - a.elo_mean);
          const rank = ranked.findIndex((s) => s.model_name === nick) + 1;
          const constId = normConst(
            x.run.constitution || (x.meta?.constitution?.path ?? '') || ''
          );
          if (!constId) continue;
          appearances.push({
            run: x.run,
            meta: x.meta,
            summary: x.summary,
            info: inMeta || inferInfoFromNick(nick),
            elo: sEntry ? sEntry.elo_mean : null,
            ci_low: sEntry?.elo_ci_lower ?? null,
            ci_high: sEntry?.elo_ci_upper ?? null,
            rank: rank || null,
            field_size: x.summary.length,
            const_id: constId,
          });
        }

        if (!appearances.length) {
          if (!cancelled) setState({ status: 'not-found', requested: nick });
          return;
        }
        if (!cancelled) setState({ status: 'ok', nick, appearances });
      } catch (e: unknown) {
        if (!cancelled) {
          const message = e instanceof Error ? e.message : String(e);
          setState({ status: 'error', message });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state.status === 'ok' && state.nick) {
      document.title = `ValueArena — ${state.nick}`;
    } else if (state.status === 'not-found' && state.requested) {
      document.title = `ValueArena — ${state.requested}`;
    }
  }, [state.status, state.nick, state.requested]);

  if (state.status === 'loading') {
    return <div className="loading"><Penguin state="loading" /><span>Loading model profile</span></div>;
  }
  if (state.status === 'no-id') {
    return (
      <div className="error">
        No model specified. <a href="/">Back</a>
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="error">
        Failed to load: {state.message}
        <br />
        <a href="/">Back</a>
      </div>
    );
  }
  if (state.status === 'not-found') {
    return <NotFound nick={state.requested!} />;
  }

  return <Profile nick={state.nick!} appearances={state.appearances!} />;
}

function NotFound({ nick }: { nick: string }) {
  return (
    <>
      <div className="breadcrumb">
        <a href="/">ValueArena</a> / <span>{nick}</span>
      </div>
      <div className="card">
        <h2>Model</h2>
        <p className="text-2xl font-mono mb-3">{nick}</p>
        <p className="text-text-muted">No evaluations found for this model in the ValueArena dataset.</p>
      </div>
    </>
  );
}

function Profile({ nick, appearances }: { nick: string; appearances: Appearance[] }) {
  const canonical = appearances[0];
  const info = canonical.info;
  const modelId = formatModelId(info);

  const elos = appearances.map((a) => a.elo).filter((v): v is number => typeof v === 'number');
  const meanElo = elos.length ? elos.reduce((s, x) => s + x, 0) / elos.length : null;
  const maxAppear = appearances.reduce<Appearance | null>(
    (best, a) =>
      best == null || (a.elo ?? -Infinity) > (best.elo ?? -Infinity) ? a : best,
    null
  );

  const constRows = useMemo(() => {
    const byConst = new Map<string, Appearance>();
    for (const a of appearances) if (!byConst.has(a.const_id)) byConst.set(a.const_id, a);
    return [...byConst.values()].sort((a, b) => a.const_id.localeCompare(b.const_id));
  }, [appearances]);

  const promptedConst = inferPromptedConstitution(nick);

  return (
    <>
      <div className="breadcrumb">
        <a href="/">ValueArena</a> / <span>{nick}</span>
      </div>

      <Hero
        nick={nick}
        info={info}
        modelId={modelId}
        meanElo={meanElo}
        topAppear={maxAppear}
        runCount={appearances.length}
        constCount={constRows.length}
      />

      <LineageCard info={info} modelId={modelId} promptedConst={promptedConst} />

      <HyperparamCard meta={canonical.meta} />

      <div className="card">
        <h2>Elo across constitutions</h2>
        <div className="card-caption">
          Each row shows this model&apos;s bootstrapped Elo in one run, anchored so the three reference
          models (gpt-4o, claude-4-sonnet, gemini-2.5-pro) average to {REF_ANCHOR}. The sparkbar
          visualizes distance from anchor; rightward = above reference, leftward = below.
        </div>
        <MatrixTable rows={constRows} />
      </div>
    </>
  );
}

function Hero({
  nick,
  info,
  modelId,
  meanElo,
  topAppear,
  runCount,
  constCount,
}: {
  nick: string;
  info: MetaModel;
  modelId: string | null;
  meanElo: number | null;
  topAppear: Appearance | null;
  runCount: number;
  constCount: number;
}) {
  return (
    <div className="specimen-hero">
      <div className="specimen-hero-inner">
        <ModelSigil name={nick} />
        <div>
          <div className="specimen-kicker">Model · {modelTypeLabel(info)}</div>
          <div className="specimen-title">{nick}</div>
          <div className="specimen-sub">
            {modelId ? <code>{modelId}</code> : null}
            {info.type ? <span className={`tag tag-${info.type} tag-sm`}>{info.type}</span> : null}
          </div>
        </div>
        <div className="specimen-stats">
          <div className="specimen-stat-label">Mean Elo</div>
          <div className="specimen-stat-value">{meanElo != null ? meanElo.toFixed(0) : '—'}</div>
          <div className="specimen-stat-sub">
            {topAppear && topAppear.elo ? (
              <>
                Peak <strong>{topAppear.elo.toFixed(0)}</strong> on{' '}
                {constLabel(topAppear.const_id)}
              </>
            ) : null}
          </div>
        </div>
      </div>
      <div className="hero-summary">
        <div className="hero-summary-item">
          <span className="k">Constitutions</span>
          <span className="v">
            {constCount} <small>/ {CONSTITUTIONS.length}</small>
          </span>
        </div>
        <div className="hero-summary-item">
          <span className="k">Appearances</span>
          <span className="v">{runCount}</span>
        </div>
        <div className="hero-summary-item">
          <span className="k">Reference anchor</span>
          <span className="v">{REF_ANCHOR}</span>
        </div>
      </div>
    </div>
  );
}

function LineageCard({
  info,
  modelId,
  promptedConst,
}: {
  info: MetaModel;
  modelId: string | null;
  promptedConst: string | null;
}) {
  const chips: React.ReactNode[] = [];
  if (modelId) {
    chips.push(
      <span key="base" className="lineage-chip">
        <strong>Base</strong> {modelId}
      </span>
    );
  } else if (info.base_model) {
    chips.push(
      <span key="base" className="lineage-chip">
        <strong>Base</strong> {info.base_model}
      </span>
    );
  }
  if (info.adapter) {
    chips.push(
      <span key="sep1" className="lineage-sep">
        ›
      </span>,
      <span key="lora" className="lineage-chip">
        <strong>LoRA</strong> {info.adapter}
      </span>
    );
  }
  if (promptedConst) {
    chips.push(
      <span key="sep2" className="lineage-sep">
        ›
      </span>,
      <a
        key="prompt"
        className="lineage-chip"
        href={`/constitution/?id=${encodeURIComponent(promptedConst)}`}
      >
        <strong>Prompt</strong> {constLabel(promptedConst)}
      </a>
    );
  }
  if (!chips.length) return null;
  return (
    <div className="card">
      <h2>Lineage</h2>
      <div className="lineage">{chips}</div>
    </div>
  );
}

function HyperparamCard({ meta }: { meta: MetaJson }) {
  const items: { label: string; value: string }[] = [];
  const t = (meta.training || {}) as Record<string, unknown>;
  const c = (meta.collection || {}) as Record<string, unknown>;
  const b = (meta.bootstrap || {}) as Record<string, unknown>;
  const log = (meta.log || {}) as Record<string, unknown>;
  const push = (label: string, value: unknown) => {
    if (value == null || value === '') return;
    items.push({
      label,
      value: Array.isArray(value) ? value.join(' × ') : String(value),
    });
  };
  push('BTD Model', t.model);
  push('Dimensions', t.dims);
  push('Learning Rate', t.lr);
  push('Weight Decay', t.weight_decay);
  push('Max Epochs', t.max_epochs);
  push('Batch Size', t.batch_size);
  push('Test Size', t.test_size);
  push('Sampler', c.sampler_mode);
  push('Group Size', c.group_size);
  if (c.allow_ties != null) push('Ties Allowed', c.allow_ties ? 'yes' : 'no');
  push('Bootstraps', b.n_bootstraps);
  if (typeof log.min_train_loss === 'number') push('Train Loss', log.min_train_loss.toFixed(4));
  if (typeof log.test_loss === 'number') push('Test Loss', log.test_loss.toFixed(4));

  if (!items.length) return null;
  return (
    <div className="card">
      <h2>Training configuration</h2>
      <div className="card-caption">
        From the most recent evaluation run. Older runs may differ — click through to any run for full
        spec.
      </div>
      <div className="metrics-grid">
        {items.map((i) => (
          <div key={i.label} className="metric-item">
            <div className="metric-label">{i.label}</div>
            <div className="metric-value">{i.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MatrixTable({ rows }: { rows: Appearance[] }) {
  if (!rows.length) return <div className="hollow">No constitution data for this model yet.</div>;
  return (
    <table className="elo-table">
      <thead>
        <tr>
          <th>Constitution</th>
          <th className="mono-cell">Elo</th>
          <th className="mono-cell">Rank</th>
          <th>Distance from anchor</th>
          <th className="mono-cell">Run</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((a) => (
          <tr key={a.const_id}>
            <td>
              <a className="link-subtle" href={`/constitution/?id=${encodeURIComponent(a.const_id)}`}>
                {constLabel(a.const_id)}
              </a>
            </td>
            <td className="mono-cell">{a.elo != null ? a.elo.toFixed(0) : '—'}</td>
            <td className="mono-cell">
              {a.rank ? `${a.rank} / ${a.field_size}` : '—'}
            </td>
            <td>
              <Sparkbar elo={a.elo} />
            </td>
            <td className="mono-cell">
              <a className="link-subtle" href={`/run/?slug=${encodeURIComponent(a.run.slug)}`}>
                {a.run.name || a.run.slug}
              </a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}