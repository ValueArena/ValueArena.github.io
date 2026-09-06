'use client';

import { useEffect, useState } from 'react';
import { fetchMeta } from '@/lib/hf';
import { inspectViewerURL } from '@/lib/protocol';
import type { MetaJson } from '@/lib/types';
import { Penguin } from '@/components/Penguin';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string; slug?: string }
  | { status: 'ok'; slug: string; meta: MetaJson; url: string };

/**
 * The run's Inspect log viewer, framed in place. The bundle is a static
 * single-page app, so a deep link is all it needs; keeping it here means a
 * reader can move between our transcripts and Inspect's without leaving the
 * site or losing the way back to the run.
 */
export default function InspectPage() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const raw = (params.get('slug') || params.get('run') || '').replace(/ /g, '+');
      const slug = raw && /^[a-zA-Z0-9\-_./+]+$/.test(raw) ? raw : '';
      if (!slug) {
        if (!cancelled) setState({ status: 'error', message: 'Invalid or missing run.' });
        return;
      }
      try {
        const meta = await fetchMeta(slug);
        const url = inspectViewerURL(meta, slug);
        if (cancelled) return;
        if (!url) {
          setState({
            status: 'error',
            slug,
            message: 'This run has no Inspect log — it was collected before the Inspect engine.',
          });
          return;
        }
        setState({ status: 'ok', slug, meta, url });
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
    if (state.status === 'ok')
      document.title = `ValueArena — ${state.meta.name || state.slug} — Inspect`;
  }, [state]);

  if (state.status === 'loading')
    return (
      <div className="loading">
        <Penguin state="loading" />
        <span>Loading log viewer</span>
      </div>
    );

  if (state.status === 'error')
    return (
      <div className="error">
        Could not open the Inspect viewer{state.slug ? ` for "${state.slug}"` : ''}:{' '}
        {state.message} <br />
        {state.slug ? (
          <a href={`/run/?run=${encodeURIComponent(state.slug)}`}>Back to the run</a>
        ) : (
          <a href="/">Back to runs</a>
        )}
      </div>
    );

  const { slug, meta, url } = state;
  return (
    <>
      <div className="breadcrumb">
        <a href="/">ValueArena</a> /{' '}
        <a href={`/run/?run=${encodeURIComponent(slug)}`}>{meta.name || slug}</a> / Inspect
      </div>

      <div className="inspect-frame-wrap">
        <iframe
          className="inspect-frame"
          src={url}
          title={`Inspect log viewer for ${meta.name || slug}`}
          loading="lazy"
        />
      </div>

      <div className="inspect-frame-note">
        Raw generation records — messages as sent, token usage, retries — read
        directly from this run's log in the dataset.{' '}
        <a className="link-subtle" href={`/transcript/?run=${encodeURIComponent(slug)}`}>
          Read the judgments
        </a>{' '}
        for the criterion view.{' '}
        <a className="link-subtle" href={url} target="_blank" rel="noreferrer">
          Open the viewer in its own tab
        </a>
        .
      </div>
    </>
  );
}
