'use client';

import { useEffect, useMemo, useState } from 'react';
import { estimateCoverage, parseCollectionReport, type CollectionReport } from '@/lib/coverage';
import { fetchRunAsset } from '@/lib/run-source';
import { hfImageURL } from '@/lib/hf';
import { inspectViewerURL } from '@/lib/protocol';
import type { MetaJson } from '@/lib/types';

export function CollectionCoverage({ meta, slug }: { meta: MetaJson; slug: string }) {
  const [state, setState] = useState<{ loading: boolean; report: CollectionReport | null; error: boolean }>({ loading: false, report: null, error: false });
  const [judge, setJudge] = useState('');
  const [limit, setLimit] = useState(40);
  const file = meta.inspect?.collection_report_file;
  const url = file && /^[\w-]+\.json$/.test(file) ? hfImageURL(`runs/${slug}/${file}`) : null;
  useEffect(() => {
    const controller = new AbortController();
    setJudge(''); setLimit(40);
    setState({ loading: Boolean(url), report: null, error: false });
    if (url) {
      fetchRunAsset(url, { signal: controller.signal }).then(async res => {
        if (!res.ok) throw new Error('Report unavailable');
        const report = parseCollectionReport(await res.json());
        if (!report || report.log_file !== meta.inspect?.log_file) throw new Error('Invalid report');
        if (!controller.signal.aborted) setState({ loading: false, report, error: false });
      }).catch(() => {
        if (!controller.signal.aborted) setState({ loading: false, report: null, error: true });
      });
    }
    return () => controller.abort();
  }, [url, meta.inspect?.log_file]);

  const { report } = state;
  const estimate = estimateCoverage(meta);
  const omissions = report?.omissions || [];
  const judges = useMemo(() => [...new Set(omissions.map(row => row.judge))].sort(), [omissions]);
  const filtered = judge ? omissions.filter(row => row.judge === judge) : omissions;
  const omitted = report?.omitted_samples ?? estimate.omitted;
  const inspectURL = inspectViewerURL(meta, slug);
  const additionalShortfall = Boolean(report && estimate.source === 'estimate' && estimate.omitted !== null && estimate.omitted > report.omitted_samples);
  const warning = (omitted !== null && omitted > 0) || additionalShortfall || estimate.partial;
  return (
    <section className={`card collection-coverage${warning ? ' collection-coverage-warning' : ''}`} aria-label="Collection coverage">
      <h2>Collection coverage</h2>
      {state.loading ? <p role="status">Loading omitted samples…</p> : report ? <>
        <p className="coverage-headline"><strong>{report.omitted_samples.toLocaleString()} samples omitted</strong> · {report.exported_samples.toLocaleString()} of {report.logged_samples.toLocaleString()} exported</p>
      </> : <>
        <p className="coverage-headline"><strong>{estimate.source === 'unknown' || omitted === null ? 'Missing-judgment count unavailable' : omitted === 0 ? 'No missing judgments' : `${omitted.toLocaleString()} missing judgments`}</strong></p>
        <p className="card-caption">{[
          estimate.exported !== null && (estimate.expected !== null ? `${estimate.exported.toLocaleString()} of ${estimate.expected.toLocaleString()} planned judgments published` : `${estimate.exported.toLocaleString()} judgments published`),
          estimate.source === 'estimate' ? 'estimated from row counts' : estimate.source === 'reported' ? 'from run metadata' : 'no missing-judgment report',
          estimate.inconsistent && 'totals suggest an extended run',
        ].filter(Boolean).join(' · ')}</p>
      </>}
      {additionalShortfall && <p className="coverage-warning-text">About {estimate.omitted?.toLocaleString()} judgments are missing by the spec; the table lists only logged ones.</p>}
      {estimate.partial && <p className="coverage-warning-text">Marked as a partial collection.</p>}
      {warning && <p className="coverage-warning-text">Rankings and transcripts cover only the judgments that succeeded.</p>}
      {state.error && <p role="status">Couldn’t load the missing-samples report{estimate.source !== 'unknown' ? '; showing run metadata instead.' : '.'}</p>}
      <div className="coverage-actions">
        {inspectURL && <a className="tx-btn" href={inspectURL} target="_blank" rel="noreferrer">See sample details →</a>}
        {url && report && <a className="tx-btn" href={url} target="_blank" rel="noreferrer">Download omission report</a>}
      </div>
      {omissions.length > 0 && <details className="coverage-details">
        <summary>View {omissions.length.toLocaleString()} omitted samples</summary>
        <label>Judge <select value={judge} onChange={event => { setJudge(event.target.value); setLimit(40); }}>
          <option value="">All judges</option>{judges.map(name => <option key={name} value={name}>{name}</option>)}
        </select></label>
        <p>{filtered.length.toLocaleString()} omitted samples{judge ? ` for ${judge}` : ''}</p>
        <div className="coverage-table-wrap"><table className="elo-table">
          <thead><tr><th>Scenario</th><th>Judge</th><th>Model(s)</th><th>Reason</th></tr></thead>
          <tbody>{filtered.slice(0, limit).map((row, index) => <tr key={`${row.sample_id}-${index}`}>
            <td><details><summary>{row.scenario_index ?? 'Unknown'} · {row.sample_id}</summary><p className="coverage-scenario">{row.scenario || 'Scenario text unavailable.'}</p></details></td>
            <td>{row.judge}</td><td>{row.models.join(', ')}</td>
            <td className="coverage-reason">{row.reason === 'sample_error' ? row.error || 'Sample failed; no error message recorded.' : 'Missing from the export, with no error recorded.'}</td>
          </tr>)}</tbody>
        </table></div>
        {filtered.length > limit && <button className="tx-btn" onClick={() => setLimit(n => n + 40)}>Show more omitted samples</button>}
      </details>}
    </section>
  );
}
