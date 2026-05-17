'use client';

import { useEffect, useMemo, useState } from 'react';
import { GIT_REPO } from '@/lib/config';
import { fetchIndex, fetchMeta, fetchSummary, hfImageURL } from '@/lib/hf';
import type { IndexJson, MetaJson, Summary } from '@/lib/types';
import { EloBarChart } from '@/components/EloBarChart';
import { ModelLogo } from '@/components/ModelLogo';
import { TrustChart } from '@/components/TrustChart';
import { Penguin } from '@/components/Penguin';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string; slug?: string }
  | { status: 'ok'; slug: string; meta: MetaJson; summary: Summary; group: string };

export default function RunPage() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      // Legacy site accepts both ?run= and ?slug=. Take whichever exists.
      const raw = (params.get('slug') || params.get('run') || '').replace(/ /g, '+');
      const slug = raw && /^[a-zA-Z0-9\-_./+]+$/.test(raw) ? raw : '';
      if (!slug) {
        if (!cancelled) setState({ status: 'error', message: 'Invalid or missing run.' });
        return;
      }
      try {
        const [meta, summary, index] = await Promise.all([
          fetchMeta(slug),
          fetchSummary(slug),
          fetchIndex().catch(() => null as IndexJson | null),
        ]);
        const entry = index?.runs?.find((r) => r.slug === slug);
        const group = entry?.group || slug.split('/')[0];
        if (!cancelled) setState({ status: 'ok', slug, meta, summary, group });
      } catch (e) {
        if (!cancelled)
          setState({
            status: 'error',
            slug,
            message: e instanceof Error ? e.message : String(e),
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state.status === 'ok') document.title = `ValueArena — ${state.meta.name || state.slug}`;
  }, [state]);

  if (state.status === 'loading') return <div className="loading"><Penguin state="loading" /><span>Loading run</span></div>;
  if (state.status === 'error')
    return (
      <div className="error">
        Failed to load run{state.slug ? ` "${state.slug}"` : ''}: {state.message} <br />
        <a href="/">Back to runs</a>
      </div>
    );

  const { slug, meta, summary, group } = state;
  return (
    <>
      <div className="breadcrumb">
        <a href="/">ValueArena</a> / {meta.name || slug}
      </div>

      <div className="specimen-hero">
        <div className="specimen-hero-inner">
          <div className="specimen-sigil" style={{ fontSize: '0.95rem' }}>RUN</div>
          <div>
            <div className="specimen-kicker">Run</div>
            <div className="specimen-title">{meta.name || slug}</div>
            <div className="specimen-sub">
              <span>{fmtDate(meta.timestamp)}</span>
              {meta.git_commit ? (
                <>
                  {' · '}
                  <GitLink hash={meta.git_commit} repo={meta.git_repo as string | undefined} />
                </>
              ) : null}
              {' · '}
              <span>{Object.keys(meta.models || {}).length} models</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Elo</h2>
        <EloBarChart summary={summary} />
      </div>

      {Array.isArray(meta.eigentrust) && meta.eigentrust.length ? (
        <div className="card">
          <h2>EigenTrust</h2>
          <div className="card-caption">
            Per-judge trust weights from the stationary distribution of the judge agreement matrix.
          </div>
          <TrustChart
            eigentrust={meta.eigentrust}
            modelNames={Object.keys(meta.models || {})}
          />
        </div>
      ) : null}

      <ModelsTable meta={meta} summary={summary} />
      <TrainingMetricsCard log={(meta.log || {}) as Record<string, unknown>} />
      <SpecCard meta={meta} />
      <GalleryCard slug={slug} group={group} onOpen={setLightbox} />

      {lightbox ? <Lightbox url={lightbox} onClose={() => setLightbox(null)} /> : null}
    </>
  );
}

function GitLink({ hash, repo }: { hash: string; repo?: string }) {
  const short = hash.substring(0, 7);
  const base = repo || GIT_REPO;
  return (
    <a className="link-subtle" href={`${base}/tree/${hash}`} target="_blank" rel="noopener">
      {short}
    </a>
  );
}

function ModelsTable({ meta, summary }: { meta: MetaJson; summary: Summary }) {
  const models = meta.models || {};
  const eloMap = useMemo(() => {
    const m: Record<string, Summary[number]> = {};
    for (const s of summary) m[s.model_name] = s;
    return m;
  }, [summary]);

  const entries = Object.entries(models)
    .map(([name, info]) => ({ name, info, elo: eloMap[name]?.elo_mean ?? 0 }))
    .sort((a, b) => b.elo - a.elo);

  return (
    <div className="card">
      <h2>Models</h2>
      <table className="elo-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Model</th>
            <th>Type</th>
            <th>Base Model</th>
            <th>Adapter / LoRA</th>
            <th className="mono-cell">Elo</th>
            <th className="mono-cell">95% CI</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(({ name, info }, i) => {
            const s = eloMap[name];
            const ci =
              s?.elo_ci_lower != null && s?.elo_ci_upper != null
                ? `${s.elo_ci_lower.toFixed(0)} — ${s.elo_ci_upper.toFixed(0)}`
                : '—';
            const type = info.type || 'base';
            const typeLabel =
              type === 'base' && info.base_model
                ? info.base_model.split('/').pop()
                : type;
            return (
              <tr key={name}>
                <td className="mono-cell">{i + 1}</td>
                <td>
                  <ModelLogo name={name} size={14} className="mr-1.5" />
                  <a className="link-subtle" href={`/model/?id=${encodeURIComponent(name)}`}>
                    {name}
                  </a>
                </td>
                <td>
                  <span className={`tag tag-${type}`}>{typeLabel}</span>
                </td>
                <td>{info.base_model || '—'}</td>
                <td className="mono-cell">{info.adapter || '—'}</td>
                <td className="mono-cell">{s?.elo_mean != null ? s.elo_mean.toFixed(1) : '—'}</td>
                <td className="mono-cell">{ci}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TrainingMetricsCard({ log }: { log: Record<string, unknown> }) {
  const items: { label: string; value: string }[] = [];
  const push = (label: string, value: unknown) => {
    if (value == null || value === '') return;
    items.push({ label, value: String(value) });
  };
  push('Train Size', log.train_datasize);
  push('Test Size', log.test_datasize);
  push('Models', log.num_models);
  push('Criteria', log.num_criteria);
  push('Dimension', log.dim);
  push('Learning Rate', log.lr);
  if (typeof log.min_train_loss === 'number') push('Train Loss', log.min_train_loss.toFixed(6));
  if (typeof log.test_loss === 'number') push('Test Loss', log.test_loss.toFixed(6));
  if (!items.length) return null;
  return (
    <div className="card">
      <h2>Training Metrics</h2>
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

function SpecCard({ meta }: { meta: MetaJson }) {
  // Pull each section from meta, rendering only those that have content.
  const sections: { title: string; rows: [string, React.ReactNode][] }[] = [];

  const d = meta.dataset as Record<string, unknown> | undefined;
  if (d) {
    const rows: [string, React.ReactNode][] = [
      ['Path', (d.path as string) || '—'],
      ['Start Index', d.start as React.ReactNode],
      ['Count', d.count as React.ReactNode],
    ];
    if (typeof d.start === 'number' && typeof d.count === 'number') {
      rows.push(['Range', `${d.start} — ${d.start + d.count}`]);
    }
    sections.push({ title: 'Dataset', rows });
  }
  const c = meta.constitution;
  if (c) {
    const m = (c.path || '').match(/([a-z_]+?)\.json$/i);
    const cid = m ? m[1].replace(/^oct_/, '') : null;
    const pathCell = cid ? (
      <a className="link-subtle" href={`/constitution/?id=${encodeURIComponent(cid)}`}>
        {c.path}
      </a>
    ) : (
      c.path || '—'
    );
    sections.push({
      title: 'Constitution',
      rows: [
        ['Path', pathCell],
        ['Criteria', c.num_criteria as React.ReactNode],
      ],
    });
  }
  const t = meta.training as Record<string, unknown> | undefined;
  if (t) {
    sections.push({
      title: 'Training',
      rows: [
        ['Model', t.model as React.ReactNode],
        ['Dimensions', Array.isArray(t.dims) ? (t.dims as unknown[]).join(', ') : (t.dims as React.ReactNode)],
        ['Learning Rate', t.lr as React.ReactNode],
        ['Max Epochs', t.max_epochs as React.ReactNode],
        ['Test Size', t.test_size as React.ReactNode],
      ],
    });
  }
  const cl = meta.collection as Record<string, unknown> | undefined;
  if (cl) {
    sections.push({
      title: 'Collection',
      rows: [
        ['Sampler Mode', cl.sampler_mode as React.ReactNode],
        ['Group Size', cl.group_size as React.ReactNode],
        ['Allow Ties', cl.allow_ties == null ? '—' : cl.allow_ties ? 'Yes' : 'No'],
      ],
    });
  }
  const b = meta.bootstrap as Record<string, unknown> | undefined;
  if (b) {
    sections.push({
      title: 'Bootstrap',
      rows: [
        ['Iterations', b.n_bootstraps as React.ReactNode],
        ['Random Seed', b.random_seed as React.ReactNode],
      ],
    });
  }

  if (!sections.length) return null;
  return (
    <div className="card">
      <h2>Run Configuration</h2>
      <div className="grid gap-6 sm:grid-cols-2">
        {sections.map((s) => (
          <div key={s.title}>
            <div className="metric-label" style={{ marginBottom: 8 }}>
              {s.title}
            </div>
            <div className="space-y-1.5 text-sm">
              {s.rows.map(([label, value], i) => (
                <div key={i} className="flex justify-between gap-3 border-b border-border-light pb-1">
                  <span className="text-text-muted">{label}</span>
                  <span className="text-right break-all">{value ?? '—'}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GalleryCard({
  slug,
  group,
  onOpen,
}: {
  slug: string;
  group: string;
  onOpen: (url: string) => void;
}) {
  const items: { url: string; caption: string }[] = [
    { url: hfImageURL(`runs/${group}/matrix_view.png`), caption: 'Matrix View' },
    { url: hfImageURL(`runs/${group}/matrix_ci.png`), caption: 'Matrix CI Width' },
    { url: hfImageURL(`runs/${slug}/images/bootstrap_elo.png`), caption: 'Bootstrap Elo' },
    { url: hfImageURL(`runs/${slug}/images/eigenbench.png`), caption: 'EigenBench Scores' },
    { url: hfImageURL(`runs/${slug}/images/uv_embeddings_pca.png`), caption: 'UV Embeddings PCA' },
    { url: hfImageURL(`runs/${slug}/images/training_loss.png`), caption: 'Training Loss' },
  ];
  return (
    <div className="card">
      <h2>Visualizations</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {items.map((it) => (
          <button
            key={it.url}
            onClick={() => onOpen(it.url)}
            className="group block text-left rounded border border-border-light overflow-hidden hover:border-border"
          >
            <div className="aspect-[4/3] bg-bg-surface overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={it.url}
                alt={it.caption}
                loading="lazy"
                onError={(e) => {
                  (e.currentTarget.closest('button') as HTMLElement).style.display = 'none';
                }}
                className="w-full h-full object-contain group-hover:opacity-90"
              />
            </div>
            <div className="px-2 py-1.5 text-xs text-text-muted">{it.caption}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Lock scrolling while open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview (press Escape to close)"
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6 cursor-zoom-out"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="max-w-full max-h-full object-contain" />
    </div>
  );
}

function fmtDate(ts?: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  return (
    d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  );
}