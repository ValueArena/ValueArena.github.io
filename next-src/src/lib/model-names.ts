// The results files call each model by a short name; the site shows its full release name.
import { HEADLINE_GROUP } from './arena-data';

/** Short name in the results files → full model name (from each model's OpenRouter listing). */
export const MODEL_NAMES: Record<string, string> = {
  Astra: 'GPT-6.2 Astra',
  Sol: 'GPT-6.2 Sol',
  Opus: 'Claude Opus 5.5',
  Gemini: 'Gemini 4 Argon',
  Grok: 'Grok 4.7',
  Kimi: 'Kimi K3.1 Pro',
  DeepSeek: 'DeepSeek V4.1 Flash',
  Muse: 'Muse Wonder',
  GLM: 'GLM 5.3',
};

const rename = (s: string) => MODEL_NAMES[s] ?? s;

/** Replace short model names wherever they appear as a whole value or object key. */
export function renameModels<T>(value: T): T {
  if (typeof value === 'string') return rename(value) as T;
  if (Array.isArray(value)) return value.map(renameModels) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [rename(k), renameModels(v)])) as T;
  }
  return value;
}

/** Whether a results path or URL belongs to the headline runs, whose files use short names. */
export const usesShortNames = (pathOrURL: string) => pathOrURL.includes(`runs/${HEADLINE_GROUP}/`);

/** Apply full model names to a fetched results file. */
export function withModelNames<T>(path: string, data: T): T {
  if (usesShortNames(path)) return renameModels(data);
  if (path === 'index.json' && data && typeof data === 'object' && Array.isArray((data as { runs?: unknown }).runs)) {
    const index = data as unknown as { runs: { slug: string }[] };
    return { ...index, runs: index.runs.map(run => run.slug.startsWith(`${HEADLINE_GROUP}/`) ? renameModels(run) : run) } as unknown as T;
  }
  return data;
}
