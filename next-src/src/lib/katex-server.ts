// Server-side KaTeX renderer. Used by the methodology page so equations are
// pre-rendered into HTML at build time — no runtime KaTeX script needed.
// Throws are swallowed so a typo in source doesn't crash the build.

import katex from 'katex';

export function renderTex(tex: string, displayMode = false): string {
  try {
    return katex.renderToString(tex, { displayMode, throwOnError: false, output: 'html' });
  } catch (err) {
    return `<code>${tex}</code>`;
  }
}
