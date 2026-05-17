// Helpers for working with model "nicks" (short ids like claude-4-sonnet,
// prompted_loving, Qwen2.5-7B-Instruct_humor).

import { CONSTITUTIONS } from './config';
import type { MetaModel } from './types';

export function normConst(c: string | null | undefined): string {
  return (c || '').toLowerCase().trim().replace(/^oct_/, '');
}

export function constLabel(id: string): string {
  const found = CONSTITUTIONS.find((c) => c.id.toLowerCase() === id.toLowerCase());
  return found ? found.label : id.charAt(0).toUpperCase() + id.slice(1);
}

// Normalize a model nick / label for fuzzy URL matching.
// "Claude 4.0 Sonnet" → "claude4sonnet"; "claude-4-sonnet" → "claude4sonnet";
// "GPT-4o" → "gpt4o"; "claude+4+sonnet" → "claude4sonnet".
export function normalizeNick(s: string | null | undefined): string {
  let v = (s || '').toLowerCase();
  v = v.replace(/(\d+)\.0+(?!\d)/g, '$1'); // 4.0 → 4
  v = v.replace(/[\s_.\-/+]+/g, ''); // strip separators
  return v;
}

export function inferPromptedConstitution(nick: string): string | null {
  const m = (nick || '').match(/^prompted[_-](.+)$/i);
  return m ? m[1].toLowerCase() : null;
}

// Synthesize a MetaModel record from the nick when meta.models[nick] is missing.
export function inferInfoFromNick(nick: string): MetaModel {
  const low = (nick || '').toLowerCase();
  const isApi =
    /^(gpt|claude|gemini|o[0-9]|grok|kimi|glm|deepseek|qwen[0-9])/.test(low) ||
    /gpt-|claude-|gemini-/.test(low);
  if (isApi) {
    let id: string | null = null;
    if (low.startsWith('gpt')) id = `openai/${nick}`;
    else if (low.startsWith('claude')) id = `anthropic/${nick}`;
    else if (low.startsWith('gemini')) id = `google/${nick}`;
    return { type: 'api', id, base_model: null, adapter: null };
  }
  if (low.startsWith('prompted_')) {
    return {
      type: 'base',
      id: 'hf_local:Qwen/Qwen2.5-7B-Instruct',
      base_model: 'Qwen/Qwen2.5-7B-Instruct',
      adapter: null,
    };
  }
  if (/^(dpo|introspection)/.test(low)) {
    return { type: 'lora', id: null, base_model: 'Qwen/Qwen2.5-7B-Instruct', adapter: nick };
  }
  if (low === 'base') {
    return { type: 'base', id: null, base_model: 'Qwen/Qwen2.5-7B-Instruct', adapter: null };
  }
  return { type: 'base', id: null, base_model: null, adapter: null };
}

export function formatModelId(info: MetaModel | undefined | null): string | null {
  if (!info) return null;
  const raw = info.id || '';
  return raw.replace(/^hf_local:/, '') || info.base_model || null;
}

export function modelTypeLabel(info: MetaModel | undefined | null): string {
  if (!info) return 'model';
  if (info.type === 'api') return 'API endpoint';
  if (info.type === 'lora') return 'LoRA adapter';
  if (info.type === 'base') {
    if ((info.adapter || '').trim()) return 'LoRA adapter';
    return 'Base model';
  }
  return info.type || 'model';
}
