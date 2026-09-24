# ValueArena evaluation backend

Automatic EigenBench jobs: Supabase login → FastAPI → durable PostgreSQL queue →
RunPod worker → private or published results. Users choose `native` (default) or `inspect`.
No one has to launch each evaluation manually.

## What this version supports

- Preset models, searchable OpenRouter IDs, and public Hugging Face full models or LoRA adapters. Hugging Face revisions are resolved to immutable commits at submission.
- Existing or custom constitutions, built-in deduplicated AIRiskDilemmas or uploaded JSONL scenarios, at least two models, and administrator-controlled optional limits.
- Direct 1–10 ratings, all-to-all judging (each panel member responds **and** judges),
  followed by EigenBench analysis and 200 scenario bootstraps.
- Native and Inspect collection engines, sharing the downstream analysis.
- Login, per-user access, idempotent submission, credit reservations, cancellation,
  heartbeats, runtime limits, and automatic pod cleanup.
- Downloadable private `.tar.gz` bundles including configuration, raw records,
  available logs, and analysis. Failed jobs preserve available artifacts; they do
  not bypass the existing coverage gate or become successful rankings.

Changes to the GPU image and provider setup must be smoke-tested before large runs. Unit and
integration tests use a real local database with simulated providers, not paid GPUs.
The GPU dependency set is resolved at image build; use a tested immutable image
for deployment. The source revision is pinned in `Dockerfile.worker`.

Not included yet: payments, dollar-denominated billing, separate responder/judge panels,
multi-GPU inference, architectures unsupported by vLLM, and pairwise evaluation. Native and Inspect
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

   Tables are `va_accounts`, `va_jobs`, `va_credit_ledger`, `va_presentation`, and `va_job_credentials`. The initializer
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

**Credits are execution seconds, not dollars.** Credits are optional: admins can enable
`require_credits` globally or per participant. Users do not choose a duration. Without
an admin runtime cap or a credit budget, runs continue until completion or cancellation.
With credits enabled, submission reserves available time (bounded by any runtime cap)
and cleanup returns unused time. Resource and model/provider constraints still apply.

The runner is pinned to upstream `jchang153/EigenBench`, commit
`c510619902013ec91c317c2c33a90fe27f8ee941`. Both Dockerfiles verify the checkout and
its generation defaults at build time. Each artifact bundle includes `runner.json`.
ValueArena omits generation settings unless explicitly supplied; upstream therefore
resolves response/reflection/rating budgets to 4096/2048/512. These are finite defaults,
not unlimited output, and can be overridden per phase or model in Advanced configuration.
The former hosted 1024-token response default is removed. Existing job snapshots keep
their original settings.

This upstream revision supports at most rank-64 LoRA adapters in its native runner.
Higher-rank native adapters are rejected before GPU provisioning. Use a compatible
adapter or merged full checkpoint; the website does not patch upstream vLLM code.

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
an appropriate GPU/disk for the supported model sizes. For preset catalog entries, operators should validate architecture, adapter/base compatibility, and memory use before
adding a model. Users can also supply custom public model IDs through the form. This version uses one GPU per job and provisions it even for an API-only panel.
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


## Evaluation workspace

`/evaluate/` has email/password login, account creation with a display username,
email-link login, and password recovery. Authentication remains with Supabase;
passwords never reach the evaluation API. Existing email-link users can set a
password in **Account**. Include `https://valuearena.github.io/evaluate/` in the
Supabase redirect allowlist and keep email confirmations enabled.

The form starts with the Humor constitution and 200 unique AIRiskDilemmas questions.
Users can choose any existing constitution, edit criteria, or upload JSONL:

```jsonl
{"scenario":"A colleague asks for help. What do you do?"}
{"scenario":"Your team disagrees.\nHow would you respond?"}
```

Each line is a JSON object with one `scenario` string (a JSON string alone is also
accepted). No surrounding array. The browser rejects empty text, duplicate
questions, more than 200 scenarios, or oversized input. The API repeats these
checks. Built-in AIRiskDilemmas is loaded by the worker using EigenBench's pinned,
deduplicated loader; raw action rows are never treated as separate scenarios.

**My provider keys** uses the user's OpenRouter and RunPod accounts, with a choice
of one GPU and 50–500 GB temporary container storage. Both keys are required and
verified before queueing. This mode needs no service credits. Service-funded
jobs retain the operator GPU/storage defaults and existing credit checks.
The worker and scheduler enforce a 60-minute default deadline; the form has no
runtime input. GPU availability and model compatibility are still provider
constraints. Hugging Face repositories must be public, ungated, and contain
safetensors. No user Python or remote-code loading is enabled.

Provider credentials are encrypted in `va_job_credentials` with Fernet using a
domain-separated key derived from `WORKER_SECRET`. Keep that secret stable in the
API and scheduler. Secrets never appear in job configuration, spec files, result
pages, or artifacts. Only the OpenRouter key reaches the GPU worker; the RunPod
key stays in the scheduler. Keys are erased after confirmed deletion, or immediate
cancellation of an unstarted job. If provisioning outcome or cleanup is uncertain,
the encrypted credentials remain available for reconciliation. Do not delete
those credentials manually while a pod might still exist.

Logs are redacted on the worker and sent with heartbeats every 15 seconds. The
owner's page polls every 5 seconds and displays the latest 64 KB. Logs and archive
downloads remain owner-only, including for published runs.

Successful jobs upload a validated summary and batches of 25 transcript records.
`/evaluation/?id=<uuid>` shows rankings, intervals, criteria, responses, reflections,
and ratings for either private or public runs. Owners can select public visibility
before a run or publish afterwards, and can unlist public results later. Public
results appear in the existing Experiments list under **Community evaluations**.
The scheduler copies public results to Hugging Face; private archives remain in Supabase.
Failed runs cannot be published as successful results or bypass coverage checks.

### Deploying workspace changes

1. Deploy the backend with `python -m app.admin init-db` as the pre-deploy command;
   it creates the two additional tables and revokes browser database access.
2. Build a new worker image from this revision and update the scheduler's
   `WORKER_IMAGE` to its immutable digest. Existing images do not upload live logs
   or browsable results.
3. Deploy the frontend with the existing three `NEXT_PUBLIC_*` evaluation variables.
4. Run a bounded native/Inspect smoke test with valid provider keys; verify logs,
   result visibility, pod deletion, and credential removal. Local tests use fake
   providers and do not establish GPU compatibility.


### Advanced configuration

Expand **Advanced configuration** beside submission to edit JSON overrides using
EigenBench's existing nested spec names. **Load all options** inserts the hosted
runner's supported settings; **Reset overrides** restores `{}`. Overrides take
precedence over defaults. Invalid JSON disables submission, and the API rejects
unknown fields and invalid combinations before queueing.

Editable settings include direct-rating normalization, self judgments and
EigenTrust alpha; dataset start/count/shuffle; criterion count; direct samplers,
group size, redundancy and seed; token budgets and temperatures for each phase
and each selected model; native OpenRouter retries/concurrency; Inspect cache,
phased execution, retries/concurrency; verbosity; and bootstrap controls.
Per-model keys must be the selected model IDs shown in the editor.

**Validate & preview spec.py** resolves model references and uses the same compiler
as the worker, without starting a job or downloading model weights. The Python
preview can be downloaded and is invalidated when the form or overrides change.
Its relative paths refer to `scenarios.json` and `constitution.json`; the worker
substitutes its actual run directory. Execution keeps the full source dataset and
applies start/count/shuffle consistently during collection and analysis.

The hosted runner currently uses direct ratings. Pairwise-only optimizer options,
extension source files, arbitrary input/output paths, executable Python, and
external upload destinations are not accepted. Models and source data are set in
the form. Collection/analysis stay enabled, and publication and coverage checks
remain service-managed. `/spec-options` exposes defaults and the JSON schema.

### Administration and approvals

Set `ADMIN_USER_IDS` on the API to a comma-separated list of verified Supabase user
UUIDs. Do not use client metadata, usernames, or an email supplied by the browser.
`python -m app.admin init-db` creates the additional member, policy, and audit tables
and bootstraps those IDs as approved administrators. These tables have RLS enabled
and no access for Supabase browser roles. Existing users request workspace access
on their next authenticated request; existing CLI-granted accounts remain enabled
in newly initialized test/development stores.

Open `/admin/` after signing in. Administrators can approve, reject, or suspend
participants; grant execution seconds; edit default and per-person limits; change
supported spec defaults; pause submissions or queue dispatch; set concurrency; and
cancel jobs. Credit grants accept idempotency IDs; policy and account edits require
matching versions. Changes are recorded in the admin audit table. An administrator
cannot suspend an admin through this interface.

Approval is required by default, including for personal-provider-key jobs. Turning
approval off affects **new** access requests, not existing pending/suspended users.
Supabase still handles email registration and verification; pending registrations
have no evaluation access. Initial credits apply only to automatically approved
new accounts. Approve and grant credits separately for manually reviewed accounts.

Credits measure reserved runtime in seconds, not dollars. They do not cap external
OpenRouter/RunPod spending. Application limits are enforced after merging spec
overrides and again during the transactional credit reservation. Upper schema
ceilings remain finite; the hosted runner still excludes executable Python,
unmanaged filesystem paths, and unsupported modes. Queued jobs keep their compiled
spec snapshots. Suspending an account cancels its queued work during scheduling;
use Cancel evaluation to stop an already-running job. GPU cleanup continues while
submissions or dispatch are paused.

Rollout order: deploy the API with `init-db` as its pre-deploy command, then deploy
the scheduler against the initialized schema. Keep their code revisions aligned.

## Public result publication

Private archives remain in the Supabase results bucket. Successful runs explicitly
marked public also publish rankings, transcripts, constitution, and analysis
charts/data to `invi-bhagyesh/ValueArena` on Hugging Face. Each run gets
`community/<job UUID>` and an entry in the existing experiment index.

Set `HF_PUBLISH_TOKEN` on the **scheduler service only**, with dataset write access;
optionally override `HF_RESULTS_REPO`. This credential is never sent to GPU workers.
`HF_TOKEN` remains a separate optional model-download token. Publishing retries
automatically, independently of GPU cleanup. The account page shows publication
status; results remain accessible there if publishing fails.

Unlisting removes current public files and the index entry, but cannot erase
Hugging Face commit history or downloaded copies. Private runs are never published
until their owner chooses public visibility. Failed runs are not published.
Exports use a file allowlist and atomic commits against the latest dataset revision
to preserve other researchers' concurrent uploads.
