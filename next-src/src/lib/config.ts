export const HF_REPO = 'invi-bhagyesh/ValueArena';
export const HF_BASE = `https://huggingface.co/datasets/${HF_REPO}/resolve/main`;
export const GIT_REPO = 'https://github.com/jchang153/EigenBench';

export const REF_ANCHOR = 1500;
export const REF_NICKS = new Set([
  'gpt-4o',
  'claude-4-sonnet',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
]);

export interface ConstitutionDef {
  id: string;
  label: string;
}

export const CONSTITUTIONS: ConstitutionDef[] = [
  { id: 'kindness', label: 'Kindness' },
  { id: 'goodness', label: 'Goodness' },
  { id: 'humor', label: 'Humor' },
  { id: 'sarcasm', label: 'Sarcasm' },
  { id: 'loving', label: 'Loving' },
  { id: 'poeticism', label: 'Poeticism' },
  { id: 'nonchalance', label: 'Nonchalance' },
  { id: 'remorse', label: 'Remorse' },
  { id: 'impulsiveness', label: 'Impulsiveness' },
  { id: 'mathematical', label: 'Mathematical' },
  { id: 'sycophancy', label: 'Sycophancy' },
  { id: 'misalignment', label: 'Misalignment' },
  { id: 'claude', label: 'Claude' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'conservatism', label: 'Conservatism' },
  { id: 'deep_ecology', label: 'Deep Ecology' },
];

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

// Static asset under public/. Resolved against the runtime basePath.
export function asset(path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${BASE}${clean}`;
}

const MODEL_LOGOS: Record<string, string> = {
  anthropic: 'assets/models/claude.png',
  claude: 'assets/models/claude.png',
  openai: 'assets/models/gpt.png',
  gpt: 'assets/models/gpt.png',
  gemini: 'assets/models/gemini.png',
  google: 'assets/models/gemini.png',
  meta: 'assets/models/meta.png',
  llama: 'assets/models/meta.png',
  deepseek: 'assets/models/deepseek.png',
  qwen: 'assets/models/qwen.png',
  baidu: 'assets/models/Baidu Color.png',
  ernie: 'assets/models/Baidu Color.png',
  cydonia: 'assets/models/cydonia.png',
  grok: 'assets/models/grok.png',
  xai: 'assets/models/grok.png',
  huggingface: 'assets/models/hf.png',
  hf: 'assets/models/hf.png',
  kimi: 'assets/models/kimi.png',
  moonshot: 'assets/models/kimi.png',
  microsoft: 'assets/models/microsoft-color.png',
  phi: 'assets/models/microsoft-color.png',
  mistral: 'assets/models/mistral-color.png',
  nvidia: 'assets/models/nvidia-color.png',
  nemotron: 'assets/models/nvidia-color.png',
  zai: 'assets/models/zai.png',
  glm: 'assets/models/zai.png',
  zhipu: 'assets/models/zai.png',
};

const QWEN_NICK_PATTERNS = [
  /^base$/,
  /^prompted_/,
  /^trained_/,
  /^dpo[-_]/,
  /^introspection[-_]/,
];

export function getModelLogo(modelId: string | null | undefined): string | null {
  const lower = (modelId || '').toLowerCase();
  for (const [key, path] of Object.entries(MODEL_LOGOS)) {
    if (lower.includes(key)) return asset(path);
  }
  for (const re of QWEN_NICK_PATTERNS) {
    if (re.test(lower)) return asset(MODEL_LOGOS.qwen);
  }
  return null;
}
