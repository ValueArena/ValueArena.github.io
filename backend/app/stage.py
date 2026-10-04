"""One isolated subprocess per phase, releasing vLLM memory before analysis."""
import json
import os
import sys
import traceback
from collections import deque
from pathlib import Path

# Inspect starts `vllm serve` at the model's full context window. A 27B model with a 256k window
# cannot fit that KV cache on one GPU, so the server exits and every response fails. Use the
# native engine's vLLM settings instead; per-model arguments still take precedence.
# Inspect also waits for the server indefinitely by default, so a hung startup would hold the GPU
# until the run's time limit; give it an hour (large downloads and FlashInfer JIT compiles fit).
# vLLM's own logging (weight loading, compilation, throughput) shows startup progress; the
# per-request access log would flood the run log.
VLLM_SERVER_ARGS = {'max_model_len': 8192, 'gpu_memory_utilization': 0.9, 'enforce_eager': True,
                    'timeout': 3600, 'configure_logging': True, 'disable_uvicorn_access_log': True}
# The server's last lines, repeated in the failure summary.
vllm_tail = deque(maxlen=12)
# Inspect retries a failing model call indefinitely, backing off up to 30 minutes between tries,
# so one endpoint that always fails (an agent returning HTTP 500) stalled a run for hours. Six
# tries cover rate limits and brief outages (about two minutes of backoff).
MAX_RETRIES = 6


def show_vllm_output():
    """Copy the `vllm serve` output Inspect captures into the run log.

    Inspect logs the server's stdout at debug and stderr at info, below its default level, so a
    server that exits at startup leaves only "exited unexpectedly with code 1" behind.
    """
    import logging
    server = logging.getLogger('inspect_ai._util.local_server')
    class Handler(logging.StreamHandler):
        waits = 0
        def emit(self, record):
            message = record.getMessage()
            # Inspect polls the server every second while it starts; keep one line in 30.
            if message.startswith('Server check failed'):
                self.waits += 1
                if self.waits % 30: return
                record = logging.makeLogRecord({**record.__dict__, 'msg': f'Still waiting for the vLLM server to start ({self.waits} s)', 'args': ()})
            elif message.startswith('Server is ready'):
                self.waits = 0
            vllm_tail.append(record.getMessage()); super().emit(record)
    handler = Handler(sys.stdout)
    handler.setFormatter(logging.Formatter('[vllm] %(message)s'))
    server.addHandler(handler); server.setLevel(logging.DEBUG); server.propagate = False


def kill_process_tree(pid):
    """Stop a vLLM server and its engine processes with psutil.

    Inspect's version shells out to pkill and kill, which the slim worker image lacks. It then
    stopped nothing: the response phase's server kept 72 GB of the GPU and the judge phase's
    server could not start ("Free memory on device ... is less than desired").
    """
    import psutil
    try: parent = psutil.Process(pid)
    except psutil.NoSuchProcess: return
    processes = parent.children(recursive=True) + [parent]
    for process in processes:
        try: process.terminate()
        except psutil.NoSuchProcess: pass
    _, alive = psutil.wait_procs(processes, timeout=30)
    for process in alive:
        try: process.kill()
        except psutil.NoSuchProcess: pass
    psutil.wait_procs(alive, timeout=10)


def patch_runtime(failure_policy='omit_invalid_judgments'):
    """Fixes to the pinned Inspect and EigenBench applied in the collection process."""
    from inspect_ai._util import local_server
    import inspect_pipeline.collect as collect
    local_server.kill_process_tree = kill_process_tree

    eval_kwargs = collect.eval_kwargs
    def bounded_retries(inspect_cfg, log_dir):
        kwargs = eval_kwargs(inspect_cfg, log_dir)
        kwargs.setdefault('max_retries', MAX_RETRIES)
        return kwargs
    collect.eval_kwargs = bounded_retries

    # The Inspect export is always strict: one failed judgment exported nothing and failed the
    # run. Follow the run's collection.failure_policy, as the native engine does.
    if failure_policy == 'omit_invalid_judgments':
        records_from_logs, export_log = collect.records_from_logs, collect.export_log
        def report(logs):
            failed = sum(1 for log in logs for sample in (log.samples or []) if sample.error)
            if not failed: return
            print(f'Omitting {failed} failed judgment(s) (failure_policy=omit_invalid_judgments):', flush=True)
            for log in logs:
                errors = [sample.error.message for sample in (log.samples or []) if sample.error]
                if errors:
                    judge = (getattr(log, 'eval', None) and log.eval.task_args.get('judge_nick')) or 'judge'
                    first = ' '.join(errors[0].strip().splitlines())[:400]
                    print(f'  {judge}: {len(errors)} of {len(log.samples)} failed. First error: {first}', flush=True)
        def lenient_records(logs, strict=True):
            report(logs); return records_from_logs(logs, strict=False)
        def lenient_export(log, **kwargs):
            report([log]); return export_log(log, **{**kwargs, 'strict': False})
        collect.records_from_logs, collect.export_log = lenient_records, lenient_export
    # The phased runner closes each model after its phase to free the GPU, but that also closes
    # API models' HTTP clients, and the same model objects judge later: "Cannot send a request,
    # as the client has been closed". Only local vLLM servers need closing.
    close = collect._close_model
    async def close_local_models(nick, resolve_model):
        from inspect_ai.model._providers.vllm import VLLMAPI
        try: api = resolve_model(nick).api
        except Exception: return
        if isinstance(api, VLLMAPI): await close(nick, resolve_model)
    collect._close_model = close_local_models


def patch_analysis():
    """Keep EigenBench's bootstrap chart from failing the analysis.

    With few ratings every bootstrap sample is identical, the mean can round to just outside its
    own percentile interval, and matplotlib rejects the negative error bar ("'yerr' must not
    contain negative values") after the rankings were already written.
    """
    from pipeline.train import direct_analysis
    plot = direct_analysis._save_bootstrap_plot
    def safe_plot(rows, path):
        rows = [{**row, 'elo_ci_lower': min(row['elo_ci_lower'], row['elo_mean']),
                 'elo_ci_upper': max(row['elo_ci_upper'], row['elo_mean'])} for row in rows]
        try: plot(rows, path)
        except Exception as error: print(f'Skipping the bootstrap chart: {error}', flush=True)
    direct_analysis._save_bootstrap_plot = safe_plot


def collection_failures(log_dir: Path) -> list[str]:
    """One line per model whose Inspect responses or judgments failed, with the first error."""
    from inspect_ai.log import list_eval_logs, read_eval_log
    lines = []
    for info in list_eval_logs(str(log_dir)):
        log = read_eval_log(info)
        task = log.eval.task
        if task.startswith('eigenbench_responses'): work, nick = 'responses', 'model_nick'
        elif task.startswith('eigenbench_judge'): work, nick = 'judgments', 'judge_nick'
        else: continue
        model = log.eval.task_args.get(nick) or task
        failed = [s for s in log.samples or [] if s.error]
        if failed:
            message = ' '.join(failed[0].error.message.strip().splitlines())
            lines.append(f'{model}: {len(failed)} of {len(log.samples)} {work} failed. First error: {message[:600]}')
        elif getattr(log, 'error', None):
            lines.append(f'{model}: {work} task failed: {" ".join(log.error.message.strip().splitlines())[:600]}')
    return lines


def collect_inspect(spec):
    from inspect_pipeline.collect import collect_direct_ratings_inspect
    from pipeline.config import load_run_spec
    os.environ.setdefault('VLLM_DEFAULT_SERVER_ARGS', json.dumps(VLLM_SERVER_ARGS))
    show_vllm_output()
    loaded, _ = load_run_spec(spec)
    patch_runtime(loaded.get('collection', {}).get('failure_policy', 'strict'))
    try:
        collect_direct_ratings_inspect(spec)
    except Exception:
        # Upstream's phased runner raises a bare KeyError when a model produced no responses;
        # name the model and the actual error so the run log explains the failure.
        try:
            loaded, _ = load_run_spec(spec)
            collection = loaded.get('collection', {})
            log_dir = Path((collection.get('inspect') or {}).get('log_dir') or 'inspect_logs')
            if not log_dir.is_absolute(): log_dir = Path(collection['evaluations_path']).parent/log_dir
            failures = collection_failures(log_dir)
        except Exception as e:
            failures = [f'(could not read Inspect logs: {e})']
        traceback.print_exc()
        if failures:
            # Printed last so the run's log tail ends with the cause rather than the traceback.
            print('\nCollection failed for:', *failures, sep='\n  ', file=sys.stderr, flush=True)
            if vllm_tail: print('Last vLLM server output:', *vllm_tail, sep='\n  ', file=sys.stderr, flush=True)
        raise SystemExit(1)


def main():
    root = Path(os.environ.get('EIGENBENCH_ROOT', '/opt/eigenbench')).resolve()
    sys.path.insert(0, str(root)); sys.path.insert(0, str(root/'scripts'))
    engine, phase, spec = sys.argv[1:]
    if phase == 'collecting' and engine == 'inspect':
        collect_inspect(spec)
    elif phase == 'collecting' and engine == 'native':
        from scripts.run_collect import main as collect
        collect(spec)
    elif phase == 'analyzing' and engine in {'native', 'inspect'}:
        from scripts.run_train import main as analyze
        patch_analysis()
        analyze(spec)
    else:
        raise ValueError('Unsupported stage')


if __name__ == '__main__': main()
