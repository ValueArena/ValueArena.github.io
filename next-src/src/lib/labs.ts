// Per-vendor lab detection and palette. Used by the leaderboard table,
// plot view, and pareto view to colour bars and group rows.

const MODEL_LABS: Record<string, string> = {
  claude: 'Anthropic',
  anthropic: 'Anthropic',
  gpt: 'OpenAI',
  o1: 'OpenAI',
  o3: 'OpenAI',
  o4: 'OpenAI',
  openai: 'OpenAI',
  gemini: 'Google',
  gemma: 'Google',
  llama: 'Meta',
  meta: 'Meta',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  mistral: 'Mistral',
  mixtral: 'Mistral',
  command: 'Cohere',
  cohere: 'Cohere',
  phi: 'Microsoft',
  dbrx: 'Databricks',
};

export const LAB_COLORS: Record<string, string> = {
  Anthropic: '#e8a44a',
  OpenAI: '#10a37f',
  Google: '#4285f4',
  Meta: '#0668e1',
  DeepSeek: '#5b9cf6',
  Qwen: '#a78bfa',
  Mistral: '#f97316',
  Cohere: '#39d353',
  Microsoft: '#00bcf2',
  Databricks: '#ff3621',
  Other: '#64748b',
};

export function detectLab(modelName: string): string {
  const lower = (modelName || '').toLowerCase();
  for (const [prefix, lab] of Object.entries(MODEL_LABS)) {
    if (lower.includes(prefix)) return lab;
  }
  return 'Other';
}

export function labColor(modelName: string): string {
  return LAB_COLORS[detectLab(modelName)] ?? LAB_COLORS.Other;
}
