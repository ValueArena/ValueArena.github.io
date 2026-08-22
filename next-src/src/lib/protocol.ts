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
