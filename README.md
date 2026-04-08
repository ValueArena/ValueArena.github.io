# ValueArena

A comparative behavioral measure of value alignment across language models, built on [EigenBench](https://github.com/jchang153/EigenBench).

**Live:** [valuearena.github.io](https://valuearena.github.io)

## What is this?

ValueArena lets you explore how different LLMs align with specific human values. EigenBench works by having an ensemble of models judge each other's responses across value-loaded scenarios, fitting pairwise comparisons to a Bradley-Terry model, and aggregating consensus scores via EigenTrust.

The site has three sections:

- **Chat** — Pick two models and a constitution (e.g. Kindness, Humor, Sarcasm), then chat side-by-side. Vote on which model better reflects the chosen value. Uses OpenRouter for inference directly from the browser.
- **Leaderboard** — Per-constitution Elo rankings from EigenBench experiment runs. View as a ranked table, horizontal bar plot, or cross-constitution pareto heatmap. Group by model or by lab.
- **Experiments** — Browse all EigenBench runs with filtering, sorting, and drill-down into individual run details (Elo distributions, training loss, UV embeddings, bootstrap confidence intervals).

## Architecture

Static HTML/CSS/JS — no build step, no backend. Run data lives on a [HuggingFace dataset repo](https://huggingface.co/datasets/invi-bhagyesh/ValueArena) and is fetched at page load. Chat uses [OpenRouter](https://openrouter.ai/) with the user's own API key. Votes are stored in localStorage.

```
index.html          Single-page app shell with sidebar
css/style.css       All styles (dark/light theme, DM Serif Display + DM Sans)
js/config.js        Model list, constitutions, API endpoints
js/tabs.js          Sidebar tab switching
js/utils.js         Shared helpers (esc, debounce)
js/chat.js          Side-by-side chat, streaming, voting, session persistence
js/leaderboard.js   Per-constitution rankings, plot, pareto views
js/index.js         Experiments table with filters and grouping
js/hf-fetch.js      HuggingFace dataset fetching
run.html            Individual run detail page
```

## Upload results

From the [EigenBench](https://github.com/jchang153/EigenBench) repo:

```bash
# Single run
python3 scripts/upload_results.py --name "my-run" --run-dir runs/my_run/

# Batch (all sub-runs in a folder)
python3 scripts/upload_results.py --batch-dir runs/matrix/ --name "matrix" --note "12 persona LoRAs"
```

Or use the HF Space for auto-upload by adding `upload` config to your spec — see the EigenBench docs.

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
  images/                   Plots (Elo, training loss, UV embeddings, etc.)
```
