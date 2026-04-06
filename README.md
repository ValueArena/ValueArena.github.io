# ValueArena

Website for [EigenBench](https://github.com/jchang153/EigenBench) experiment results.

**Live:** [valuearena.github.io](https://valuearena.github.io)

## How it works

Static HTML/CSS/JS site hosted on GitHub Pages. Run data is stored on a [HuggingFace dataset repo](https://huggingface.co/datasets/invi-bhagyesh/ValueArena) and fetched at page load — no build step, no backend.

## Upload results

From the EigenBench repo:

```bash
# Single run
python3 scripts/upload_results.py --name "my-run" --run-dir runs/my_run/

# Batch (all sub-runs in a folder)
python3 scripts/upload_results.py --batch-dir runs/matrix/ --name "matrix" --note "12 persona LoRAs"
```

New runs appear on the site immediately after upload.

## Local dev

```bash
python3 -m http.server
```

Open `http://localhost:8000`.
