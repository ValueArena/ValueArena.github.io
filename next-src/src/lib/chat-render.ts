// Client-side markdown + LaTeX renderer.
// Mirrors js/chat.js's renderMd. We dynamically import marked / DOMPurify / katex
// from the CDN on first use so the home page doesn't pay the bytes upfront.

type MarkedFn = (text: string, opts?: { breaks?: boolean }) => string;
type SanitizeFn = (html: string) => string;
type KatexRender = (tex: string, opts?: { displayMode?: boolean; throwOnError?: boolean }) => string;

interface Renderers {
  marked?: MarkedFn;
  sanitize?: SanitizeFn;
  katex?: KatexRender;
}

let cache: Renderers | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function loadCss(href: string): void {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

async function ensureRenderers(): Promise<Renderers> {
  if (cache) return cache;
  // KaTeX CSS first so math renders correctly once script loads.
  loadCss('https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css');
  await Promise.all([
    loadScript('https://cdn.jsdelivr.net/npm/marked@15.0.4/marked.min.js'),
    loadScript('https://cdn.jsdelivr.net/npm/dompurify@3.2.4/dist/purify.min.js'),
    loadScript('https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js'),
  ]);
  const w = window as unknown as {
    marked?: { parse: MarkedFn };
    DOMPurify?: { sanitize: SanitizeFn };
    katex?: { renderToString: KatexRender };
  };
  cache = {
    marked: w.marked?.parse,
    sanitize: w.DOMPurify?.sanitize,
    katex: w.katex?.renderToString,
  };
  return cache;
}

export async function renderMarkdown(text: string): Promise<string> {
  if (!text) return '';
  const { marked, sanitize, katex } = await ensureRenderers();
  let out = text;
  if (katex) {
    out = out.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => {
      try {
        return katex(tex.trim(), { displayMode: true, throwOnError: false });
      } catch {
        return `$$${tex}$$`;
      }
    });
    out = out.replace(/(?<!\$)\$(?!\$)([^\n$]+?)(?<!\$)\$(?!\$)/g, (_m, tex: string) => {
      try {
        return katex(tex.trim(), { displayMode: false, throwOnError: false });
      } catch {
        return `$${tex}$`;
      }
    });
  }
  if (marked) out = marked(out, { breaks: true });
  if (sanitize) out = sanitize(out);
  return out;
}

export function isStreamingDelta(line: string): { content: string } | null | 'done' {
  if (!line.startsWith('data: ')) return null;
  const data = line.slice(6).trim();
  if (data === '[DONE]') return 'done';
  try {
    const j = JSON.parse(data);
    return { content: j.choices?.[0]?.delta?.content || '' };
  } catch {
    return null;
  }
}
