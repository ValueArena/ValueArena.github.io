# ValueArena: Which Model Shares Your Values?

A comparative behavioral measure of value alignment across language models, built on [EigenBench](https://github.com/jchang153/EigenBench).

**Live:** [valuearena.github.io](https://valuearena.github.io)

## What is this?

ValueArena lets you explore how different LLMs align with specific human values. EigenBench supports pairwise comparisons fitted with Bradley–Terry–Davidson and direct criterion ratings normalized into a trust matrix. Both protocols aggregate consensus scores with EigenTrust.

The site has three sections:

- **Chat** — Pick two models and a constitution (e.g. Kindness, Humor, Sarcasm), then chat side-by-side. Vote on which model better reflects the chosen value. Uses OpenRouter for inference directly from the browser.
- **Leaderboard** — Per-constitution Elo rankings from EigenBench experiment runs. View as a ranked table, horizontal bar plot, or cross-constitution pareto heatmap. Group by model or by lab.
- **Experiments** — Browse all EigenBench runs with filtering by collection type and drill-down into protocol-specific artifacts and bootstrap confidence intervals.

## Architecture

The website is a statically exported Next.js application with no runtime backend. Source lives under `next-src/`; a GitHub Action builds it and commits the export to the repository root for GitHub Pages. Run data lives on a [HuggingFace dataset repo](https://huggingface.co/datasets/invi-bhagyesh/ValueArena) and is fetched at page load. Chat uses [OpenRouter](https://openrouter.ai/) with the user's own API key. Votes are stored in localStorage.

```
next-src/src/app/           Static Next.js pages
next-src/src/components/    Chat, leaderboard, experiments, and charts
next-src/src/lib/           Hugging Face data contract and fetch helpers
.github/workflows/          Build-and-publish workflow
```

## Upload results

From the [EigenBench](https://github.com/jchang153/EigenBench) repo:

```bash
# Single run
python3 scripts/upload_results.py --name "my-run" --run-dir runs/my_run/

# Batch (all sub-runs in a folder)
python3 scripts/upload_results.py --batch-dir runs/matrix/ --name "matrix" --note "12 persona LoRAs"
```

Pairwise and direct runs share the same upload command. Direct uploads require a protocol-aware EigenBench uploader. The optional HF Space auto-upload path must also support `evaluation.mode="direct_rating"` before it can accept direct submissions.

New runs appear on the site immediately after upload.

## Local dev

```bash
python3 -m http.server
```

Open `http://localhost:8000`.

## Data

All experiment data is stored on HuggingFace at [`invi-bhagyesh/ValueArena`](https://huggingface.co/datasets/invi-bhagyesh/ValueArena):

```
index.json                  Manifest of all runs
runs/{name}/
  meta.json                 Spec, training log, eigentrust scores, git info
  summary.json              Bootstrap Elo ratings per model
  evaluations.jsonl         Raw evaluation transcripts
  images/                   Protocol-specific plots
  data/                     Optional direct score/trust matrices and bootstrap samples
```

New metadata records `evaluation_mode` as either `pairwise_btd` or `direct_rating`. Missing values on legacy runs are interpreted as `pairwise_btd`. Direct runs may use exhaustive or `partitioned_random_judge` sampling; their run pages report group size, response redundancy, seed, and observed edge coverage. Direct runs omit BTD loss and UV-embedding artifacts.
