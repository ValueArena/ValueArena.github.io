import { HF_BASE } from './config';
import type { EvaluationMode, IndexRun, MetaJson } from './types';

export function normalizeEvaluationMode(value: unknown): EvaluationMode {
  const normalized = String(value || 'pairwise_btd').trim().toLowerCase();
  if (normalized === 'direct' || normalized === 'direct_rating') return 'direct_rating';
  return 'pairwise_btd';
}

export function metaEvaluationMode(meta: MetaJson): EvaluationMode {
  return normalizeEvaluationMode(meta.evaluation?.mode || meta.evaluation_mode);
}

export function runEvaluationMode(run: IndexRun): EvaluationMode {
  return normalizeEvaluationMode(run.evaluation_mode);
}

export function collectionTypeLabel(mode: EvaluationMode): string {
  return mode === 'direct_rating' ? 'Direct ratings' : 'Pairwise comparisons';
}

export function bootstrapUnit(mode: EvaluationMode, configured?: unknown): string {
  if (typeof configured === 'string' && configured) return configured;
  return mode === 'direct_rating' ? 'scenario' : 'judgment';
}

/** The run's Inspect log, as served from the dataset alongside its
 *  evaluations.jsonl. Present only for runs collected by the Inspect engine. */
export function inspectLogURL(meta: MetaJson, slug: string): string | null {
  const file = meta.inspect?.log_file;
  if (!file) return null;
  return `${HF_BASE}/runs/${slug}/${encodeURIComponent(file)}`;
}

/** The viewer, served from this site, pointed at that log. The bundled app
 *  fetches whatever `log_file` names with range requests, so the log itself
 *  never has to be copied anywhere. */
export function inspectViewerURL(meta: MetaJson, slug: string): string | null {
  const log = inspectLogURL(meta, slug);
  if (!log) return null;
  return `/inspect-viewer/?log_file=${encodeURIComponent(log)}`;
}
