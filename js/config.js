const MODEL_LOGOS = {
  "anthropic": "assets/models/claude.png",
  "claude": "assets/models/claude.png",
  "openai": "assets/models/gpt.png",
  "gpt": "assets/models/gpt.png",
  "gemini": "assets/models/gemini.png",
  "google": "assets/models/gemini.png",
  "meta": "assets/models/meta.png",
  "llama": "assets/models/meta.png",
  "deepseek": "assets/models/deepseek.png",
  "qwen": "assets/models/qwen.png",
  "baidu": "assets/models/Baidu Color.png",
  "ernie": "assets/models/Baidu Color.png",
  "cydonia": "assets/models/cydonia.png",
  "grok": "assets/models/grok.png",
  "xai": "assets/models/grok.png",
  "huggingface": "assets/models/hf.png",
  "hf": "assets/models/hf.png",
  "kimi": "assets/models/kimi.png",
  "moonshot": "assets/models/kimi.png",
  "microsoft": "assets/models/microsoft-color.png",
  "phi": "assets/models/microsoft-color.png",
  "mistral": "assets/models/mistral-color.png",
  "nvidia": "assets/models/nvidia-color.png",
  "nemotron": "assets/models/nvidia-color.png",
  "zai": "assets/models/zai.png",
  "glm": "assets/models/zai.png",
  "zhipu": "assets/models/zai.png",
};

// Nicks from EigenBench runs that are finetunes/prompt-wraps of the
// Qwen base (no lab name in the nick) — fall back to the Qwen logo.
const _QWEN_NICK_PATTERNS = [
  /^base$/,
  /^prompted_/,
  /^trained_/,
  /^dpo[-_]/,
  /^introspection[-_]/,
];

function getModelLogo(modelId) {
  const lower = (modelId || "").toLowerCase();
  for (const [key, path] of Object.entries(MODEL_LOGOS)) {
    if (lower.includes(key)) return path;
  }
  // Fallback: nicks with no lab name are Qwen-based runs from EigenBench.
  for (const re of _QWEN_NICK_PATTERNS) {
    if (re.test(lower)) return MODEL_LOGOS["qwen"];
  }
  return null;
}

const VA = {
  HF_REPO: "invi-bhagyesh/ValueArena",
  HF_BASE: "https://huggingface.co/datasets/invi-bhagyesh/ValueArena/resolve/main",
  GIT_REPO: "https://github.com/jchang153/EigenBench",
  OPENROUTER_BASE: "https://openrouter.ai/api/v1",
  CHAT_MODELS: [
    { id: "anthropic/claude-sonnet-4", label: "Claude 4 Sonnet" },
    { id: "openai/gpt-4.1", label: "GPT 4.1" },
    { id: "openai/gpt-4.1-mini", label: "GPT 4.1 Mini" },
    { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { id: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick" },
    { id: "meta-llama/llama-4-scout", label: "Llama 4 Scout" },
    { id: "deepseek/deepseek-r1", label: "DeepSeek R1" },
    { id: "qwen/qwen3-235b-a22b", label: "Qwen3 235B" },
  ],
  CONSTITUTIONS: [
    { id: "kindness", label: "Kindness" },
    { id: "goodness", label: "Goodness" },
    { id: "humor", label: "Humor" },
    { id: "sarcasm", label: "Sarcasm" },
    { id: "loving", label: "Loving" },
    { id: "poeticism", label: "Poeticism" },
    { id: "nonchalance", label: "Nonchalance" },
    { id: "remorse", label: "Remorse" },
    { id: "impulsiveness", label: "Impulsiveness" },
    { id: "mathematical", label: "Mathematical" },
    { id: "sycophancy", label: "Sycophancy" },
    { id: "misalignment", label: "Misalignment" },
    { id: "claude", label: "Claude" },
    { id: "openai", label: "OpenAI" },
    { id: "conservatism", label: "Conservatism" },
    { id: "deep_ecology", label: "Deep Ecology" },
  ],
};
