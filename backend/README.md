# ValueArena evaluation backend

Automatic EigenBench jobs: Supabase login → FastAPI → durable PostgreSQL queue →
RunPod worker → private results. Users choose `native` (default) or `inspect`.
No one has to launch each evaluation manually.

## What this version supports

- A model panel selected from an administrator-maintained catalog; custom fine-tunes
  can be added as pinned Hugging Face model/LoRA references.
- User-written criteria and scenarios, 2–8 models, 1–12 criteria, 1–200 unique scenarios.
- Direct 1–10 ratings, all-to-all judging (each panel member responds **and** judges),
  followed by EigenBench analysis and 200 scenario bootstraps.
- Native and Inspect collection engines, sharing the downstream analysis.
- Login, per-user access, idempotent submission, credit reservations, cancellation,
  heartbeats, runtime limits, and automatic pod cleanup.
- Downloadable private `.tar.gz` bundles including configuration, raw records,
  available logs, and analysis. Failed jobs preserve available artifacts; they do
  not bypass the existing coverage gate or become successful rankings.

This is an initial implementation, not a deployed service. GPU image execution,
Supabase, Railway, and RunPod must be smoke-tested after account setup. Unit and
integration tests use a real local database with simulated providers, not paid GPUs.
The GPU dependency set is resolved at image build; use a tested immutable image
for deployment. The source revision is pinned in `Dockerfile.worker`.

Not included yet: payments, dollar-denominated billing, automatic public publishing,
private results inside the existing public transcript viewer, separate responder/judge
panels, arbitrary model architectures, and pairwise evaluation. Native and Inspect
may produce different samples even with the same seed.

## 1. Supabase: accounts, database, private storage

1. Create a Supabase project. Enable email authentication; set the Site URL to
   `https://valuearena.github.io` and allow `https://valuearena.github.io/evaluate/`
   as a redirect URL. Configure production email delivery before inviting users.
2. Copy the project URL, publishable key, secret/service-role key, and PostgreSQL
   connection URL into the server environment described in `.env.example`.
   Use the direct connection or **session** pooler, not the transaction pooler:
   scheduler leadership uses a session advisory lock.
3. Run `deploy/supabase-storage.sql` in the SQL editor. Keep the bucket private.
   The configured upload cap must not exceed the project's storage limit.
4. Initialize the backend tables using the server environment:

   ```bash
   python -m app.admin init-db
   ```

   Tables are `va_accounts`, `va_jobs`, and `va_credit_ledger`. The initializer
   enables RLS and revokes browser-role grants. Access goes through the API;
   the server database connection must own these tables (the Supabase project
   database owner works). `init-db` is an initial schema bootstrap, not a general
   migration system: use reviewed migrations for future schema changes.
5. After a user signs in, copy their UUID from Supabase Auth and grant quota:

   ```bash
   python -m app.admin grant USER_UUID 14400
   ```

   This enables that account with four hours of execution allowance. Runs then
   proceed automatically without per-run approval.

**Credits are execution seconds, not dollars.** Submission reserves the maximum
runtime; cleanup charges elapsed time from provisioning until confirmed deletion,
up to the reservation, and returns the rest. The real GPU rate and API-token bills
are separate expenses paid by the operator. There is no payment processor yet.
No users receive quota automatically. Set provider-side budgets too.

## 2. Build the EigenBench GPU worker

Alternatively to a local build, run **Actions → Build evaluation worker → Run
workflow** in GitHub. It builds a Linux AMD64 image and publishes it to
`ghcr.io/valuearena/evaluation-worker`. The workflow summary contains the immutable
`WORKER_IMAGE` reference. Make the package public in its GitHub package settings
before RunPod pulls it; the image contains application code, not credentials.
Credentials are supplied to each worker at runtime. Publishing an image does not
launch a GPU or verify GPU execution.

From `valuearena/backend`:

```bash
docker build --platform linux/amd64 -f Dockerfile.worker \
  -t ghcr.io/YOUR_ACCOUNT/valuearena-worker:initial .
docker push ghcr.io/YOUR_ACCOUNT/valuearena-worker:initial
```

Make the image readable by RunPod. Set `WORKER_IMAGE` to its immutable digest,
for example `ghcr.io/YOUR_ACCOUNT/valuearena-worker@sha256:...`.
The Dockerfile checks out a specific EigenBench commit and installs its GPU dependencies.
`Dockerfile.worker` reuses a published dependency image by digest and checks out
the corrected runner revision on top. `Dockerfile.worker-base` records the original
dependency build; rebuild it and update the base digest when refreshing GPU
dependencies. GPU operation still requires a smoke test on an NVIDIA worker.

The worker runs `app.stage` in separate processes for collection and analysis.
Native invokes `scripts.run_collect.main`; Inspect invokes
`inspect_pipeline.collect.collect_direct_ratings_inspect`. Both use
`scripts.run_train.main`. It never evaluates user-provided Python or shell commands.

## 3. Railway: API and scheduler

Create two services from this GitHub repository. Both use **`/backend` as the root
directory** and the `backend/Dockerfile` image.

For new services, configure these settings directly in Railway's dashboard;
the TOML files remain examples for services that already use Config as Code.

**API service:** choose the Dockerfile builder, leave the custom start command
empty, and set the health-check path to `/health`. Generate its HTTPS domain, set
`API_PUBLIC_URL`, and set the other server variables from `.env.example`.
The image starts Uvicorn using Railway's `PORT`; health check is `/health`.
Run `python -m app.admin init-db` once before accepting traffic.

**Scheduler service:** choose the Dockerfile builder and set the start command to
`python -m app.scheduler`. There is no HTTP health check. Disable scale-to-zero
and use an always-restart policy where the hosting plan supports it.
Give it the same database and `WORKER_SECRET`, plus `RUNPOD_API_KEY`,
`WORKER_IMAGE`, `API_PUBLIC_URL`, `OPENROUTER_API_KEY`, and optional `HF_TOKEN`.
Current Settings validation also requires the Supabase variables on this service.
Use `MAX_RUNNING_JOBS=1` initially. The API itself does not need RunPod or model keys.

The scheduler persists provisioning intent **before** calling RunPod. If the call
has an uncertain outcome, it looks for the pod's deterministic job name rather than
launching a duplicate. It does not automatically retry a failed evaluation. It
continues reconciling terminal jobs to remove late-arriving pods. A failed deletion
keeps the slot occupied and the credit reservation unsettled until cleanup succeeds.
RunPod outages leave jobs queued or awaiting reconciliation.

The worker kills its process group on cancellation, deadline, or prolonged API
loss. The scheduler terminates the pod. **A stopped scheduler cannot terminate
pods:** monitor/restart this service and configure infrastructure billing alerts.
No API availability guarantee substitutes for a provider billing limit.

## 4. Configure supported models

`catalog.json` contains the initial Qwen anti-sarcasm adapter and four API references
(GPT-4.1, Claude Sonnet 4, Gemini 2.5 Pro, and Grok 4.6). The adapter and its Qwen base
are pinned to exact Hugging Face revisions. Keep accounts disabled until this
population has passed the live worker smoke test. Add only models supported by the
tested worker image. Redeploy API after changing the catalog.
Each job stores a snapshot of the selected model references.

```json
{
  "my-finetune": {
    "label": "My fine-tune",
    "ref": {
      "provider": "hf_local",
      "kind": "lora",
      "repo_id": "owner/adapter",
      "revision": "REPLACE_WITH_40_HEX_COMMIT_SHA",
      "subfolder": "introspection-final",
      "base_model_id": "owner/base",
      "base_revision": "REPLACE_WITH_40_HEX_COMMIT_SHA"
    }
  }
}
```

Use `kind: "base"` with `repo_id` and `revision` for full checkpoints. Configure
an appropriate GPU/disk for the supported model sizes. The catalog is an operator
boundary: validate architecture, adapter/base compatibility, and memory use before
adding a model. This version uses one GPU per job and provisions it even for an API-only panel.
The native runner reads adapter configurations to size LoRA capacity, including
the selected rank-128 composed adapter. Verify adapters against both engines before
adding them. Increasing GPU count does not configure tensor parallelism.

## 5. Connect the website

Set these **GitHub repository Actions variables** and rebuild the website:

```text
NEXT_PUBLIC_EVALUATION_API_URL=https://YOUR-API.up.railway.app
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

These are public configuration, not privileged credentials. Never put the Supabase
secret key, RunPod key, model-provider keys, or worker signing secret in `NEXT_PUBLIC_*`.
The deployment workflow passes these variables to Next.js at build time.
Set API `ALLOWED_ORIGINS=https://valuearena.github.io`.

`/evaluate/` supplies login, model selection, the **Native / Inspect** selector,
constitution and scenario inputs, progress polling, cancellation, and downloads.
Without the public configuration it shows that the service is not connected.
The top navigation exposes the page once the API URL is configured.

API endpoints and request schema are at `/docs` and `/evaluation-schema`.
Example authenticated submission (token is a Supabase user access token):

```bash
curl "$API_URL/evaluations" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: pilot-001' \
  --data-binary @example-request.json
```

Set `"engine": "inspect"` to use Inspect; omit it or use `"native"` for native.
Reuse the same idempotency key when retrying a submission after a connection loss.
Change it for an intentionally new evaluation.

## Local tests (no accounts, model calls, or GPU charges)

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q
```

Tests cover ownership, credits, retries, cancellation, provisioning reconciliation,
capacity, artifact access, safe spec serialization, and both worker engine paths.
SQLite is only for local tests/development; production rejects SQLite configuration.
Before opening access, perform a one-scenario native run and an Inspect run on the
real deployed services, cancel a running run, and verify pod termination, private
artifact access, actual coverage, and credit settlement. Check the selected
worker image against the intended local model/adapter as well as API models.
