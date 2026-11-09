# ValueArena — Next.js static site

This directory contains the canonical website source. GitHub Actions exports
the application and commits the generated deployment files to the repository
root for GitHub Pages.

## Stack

- Next.js 16 (app router) with `output: 'export'` for GitHub Pages compatibility
- TypeScript, strict mode
- Tailwind v3 — bridged to the existing `--bg/--text/...` CSS variables so the
  palette matches the legacy site
- Bun (matches the reference template at `~/Desktop/TopoReformer/invi-bhagyesh.github.io/next`)
- Plain `fetch()` against the HF dataset, with the same sessionStorage caching
  shape as the legacy `js/hf-fetch.js`

## Develop

```bash
bun install          # picks up katex + recharts on first run
bun run dev          # http://localhost:3000
```

Visit <http://localhost:3000/model/?id=claude-4-sonnet>.

## Build a static bundle

```bash
bun run build --webpack  # writes ./out/
```

The redesigned ValueArena is published at `/`. The previous site is preserved
at `/old/` from `public/old/`, including its original static assets. Do not
regenerate that archive as part of a normal build.

For a separate EigenBench deployment, set `NEXT_PUBLIC_SITE_MODE=eigenbench`.
`NEXT_PUBLIC_EIGENBENCH_URL` and `NEXT_PUBLIC_VALUEARENA_URL` configure the
handoff between the two sites; the default local handoff is `/eigenbench/`.

For deploying the current site under a different base path:

```bash
BASE_PATH=/next bun run build --webpack
```

Then copy `out/` to the legacy site's `next/` folder before pushing.

## Why mirror the data layer instead of rewriting

The HF dataset shape (per-run `summary.json`, `meta.json`, top-level
`index.json`) is the source of truth for both this preview and the legacy
site. Keeping the fetch helpers in `src/lib/hf.ts` byte-equivalent to
`../js/hf-fetch.js` (TTLs, key shapes, error handling) means we can switch a
visitor between the two without cache invalidation pain.
