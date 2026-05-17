# ValueArena — Next.js port (work in progress)

Modern port of the vanilla-JS site at the repo root. The legacy site
(`../index.html`, `../model.html`, …) remains the canonical deployment;
this folder is a side-by-side preview.

## Stack

- Next.js 14 (app router) with `output: 'export'` for GitHub Pages compatibility
- TypeScript, strict mode
- Tailwind v3 — bridged to the existing `--bg/--text/...` CSS variables so the
  palette matches the legacy site
- Bun (matches the reference template at `~/Desktop/TopoReformer/invi-bhagyesh.github.io/next`)
- Plain `fetch()` against the HF dataset, with the same sessionStorage caching
  shape as the legacy `js/hf-fetch.js`

## What's ported

- `/model?id=<nick>` — model profile (hero, lineage, hyperparameters, cross-constitution Elo table)

## What's not ported yet

- Leaderboard (`/`)
- Constitution profile (`/constitution?id=<id>`)
- Run profile (`/run?slug=<slug>`)
- Methodology

## Develop

```bash
bun install          # picks up katex + recharts on first run
bun run dev          # http://localhost:3000
```

Visit <http://localhost:3000/model/?id=claude-4-sonnet>.

## Build a static bundle

```bash
bun run build        # writes ./out/
```

For deploying side-by-side with the legacy site (e.g. at `/next/`):

```bash
BASE_PATH=/next bun run build
```

Then copy `out/` to the legacy site's `next/` folder before pushing.

## Why mirror the data layer instead of rewriting

The HF dataset shape (per-run `summary.json`, `meta.json`, top-level
`index.json`) is the source of truth for both this preview and the legacy
site. Keeping the fetch helpers in `src/lib/hf.ts` byte-equivalent to
`../js/hf-fetch.js` (TTLs, key shapes, error handling) means we can switch a
visitor between the two without cache invalidation pain.
