import asyncio
import json
import logging
import subprocess
import sys
import time
import types
from types import SimpleNamespace as NS

import pytest

from app import stage


def sample(error=None):
    return NS(error=NS(message=error) if error else None)


def log(task, nick, samples):
    key = 'judge_nick' if task.startswith('eigenbench_judge') else 'model_nick'
    return NS(eval=NS(task=task, task_args={key: nick}), samples=samples)


@pytest.fixture
def upstream(monkeypatch, tmp_path):
    """Fake EigenBench and Inspect modules: collection fails the way the phased runner does."""
    seen = {}
    def collect(spec):
        seen['vllm'] = json.loads(stage.os.environ['VLLM_DEFAULT_SERVER_ARGS'])
        # Inspect logs the server's output here, below its default level, and polls it every second.
        server = logging.getLogger('inspect_ai._util.local_server')
        for _ in range(61): server.debug('Server check failed: [Errno 111] Connection refused, retrying...')
        server.info('ValueError: architecture not supported')
        raise KeyError('Qwen-Qwen3-8-27B')
    logs = {'a': log('eigenbench_responses_Qwen-Qwen3-8-27B', 'Qwen-Qwen3-8-27B',
                     [sample('RuntimeError: vLLM server process exited\nKV cache too small')] * 5),
            'b': log('eigenbench_responses_gemini', 'gemini', [sample()] * 5),
            'c': log('eigenbench_judge_gemini', 'gemini', [sample('Cannot send a request, as the client has been closed.')]),
            'd': log('eigenbench_judge_grok', 'grok', [sample()])}
    closed = seen.setdefault('closed', [])
    async def close_model(nick, resolve_model): closed.append(nick)
    class VLLMAPI: pass
    modules = {
        'inspect_pipeline': types.ModuleType('inspect_pipeline'),
        'inspect_pipeline.collect': NS(collect_direct_ratings_inspect=collect, _close_model=close_model,
                                       eval_kwargs=lambda cfg, log_dir: {'log_dir': str(log_dir), 'fail_on_error': False},
                                       records_from_logs=lambda logs, strict=True: ('records', strict),
                                       export_log=lambda log, **kwargs: ('export', kwargs.get('strict', True))),
        'inspect_ai._util': types.ModuleType('inspect_ai._util'),
        'inspect_ai._util.local_server': NS(kill_process_tree=None),
        'inspect_ai.model': types.ModuleType('inspect_ai.model'),
        'inspect_ai.model._providers': types.ModuleType('inspect_ai.model._providers'),
        'inspect_ai.model._providers.vllm': NS(VLLMAPI=VLLMAPI),
        'pipeline': types.ModuleType('pipeline'),
        'pipeline.config': NS(load_run_spec=lambda spec: ({'collection': {'evaluations_path': str(tmp_path/'evaluations.jsonl'), **seen.get('collection', {})}}, tmp_path)),
        'inspect_ai': types.ModuleType('inspect_ai'),
        'inspect_ai.log': NS(list_eval_logs=lambda d: (seen.setdefault('log_dir', d), list(logs))[1], read_eval_log=logs.__getitem__),
    }
    for name, module in modules.items(): monkeypatch.setitem(sys.modules, name, module)
    monkeypatch.delenv('VLLM_DEFAULT_SERVER_ARGS', raising=False)
    stage.vllm_tail.clear()
    server = logging.getLogger('inspect_ai._util.local_server')
    monkeypatch.setattr(server, 'handlers', []); monkeypatch.setattr(server, 'propagate', True)
    return seen, tmp_path


def test_inspect_collection_caps_vllm_context_and_names_the_failed_model(upstream, capsys):
    seen, tmp_path = upstream
    with pytest.raises(SystemExit) as exit:
        stage.collect_inspect('spec.py')
    assert exit.value.code == 1
    assert seen['vllm']['max_model_len'] == 8192
    assert seen['log_dir'] == str(tmp_path/'inspect_logs')
    err = capsys.readouterr().err
    # The cause comes after the traceback, so it is the last thing in the run log.
    assert err.index("KeyError: 'Qwen-Qwen3-8-27B'") < err.index('Collection failed for:')
    summary = err.split('Collection failed for:')[1]
    assert 'Qwen-Qwen3-8-27B: 5 of 5 responses failed. First error: RuntimeError: vLLM server process exited KV cache too small' in summary
    assert 'gemini: 1 of 1 judgments failed. First error: Cannot send a request, as the client has been closed.' in summary
    assert 'grok' not in summary and 'gemini: ' + '5' not in summary
    assert err.rstrip().endswith('Last vLLM server output:\n  Still waiting for the vLLM server to start (30 s)\n'
                                 '  Still waiting for the vLLM server to start (60 s)\n  ValueError: architecture not supported')
    assert seen['vllm']['timeout'] == 3600 and seen['vllm']['disable_uvicorn_access_log'] is True


def test_explicit_vllm_server_args_are_kept(upstream, monkeypatch):
    seen, _ = upstream
    monkeypatch.setenv('VLLM_DEFAULT_SERVER_ARGS', '{"max_model_len": 32768}')
    with pytest.raises(SystemExit):
        stage.collect_inspect('spec.py')
    assert seen['vllm'] == {'max_model_len': 32768}


def test_runtime_patches_stop_vllm_without_pkill_and_keep_api_clients_open(upstream):
    seen, _ = upstream
    with pytest.raises(SystemExit):
        stage.collect_inspect('spec.py')
    assert sys.modules['inspect_ai._util.local_server'].kill_process_tree is stage.kill_process_tree
    collect = sys.modules['inspect_pipeline.collect']
    local = NS(api=sys.modules['inspect_ai.model._providers.vllm'].VLLMAPI())
    hosted = NS(api=object())
    resolve = {'qwen': local, 'nycc-agent': hosted}.__getitem__
    for nick in ('qwen', 'nycc-agent'): asyncio.run(collect._close_model(nick, resolve))
    assert seen['closed'] == ['qwen']


def test_kill_process_tree_stops_children():
    psutil = pytest.importorskip('psutil')
    # A server with an engine child, as `vllm serve` has.
    server = subprocess.Popen(['sh', '-c', 'sleep 300 & wait'])
    deadline = time.time() + 5
    while not psutil.Process(server.pid).children() and time.time() < deadline: time.sleep(0.05)
    child = psutil.Process(server.pid).children()[0]
    stage.kill_process_tree(server.pid)
    server.wait(timeout=5)
    assert not child.is_running() or child.status() == psutil.STATUS_ZOMBIE


def test_retries_are_bounded_and_the_failure_policy_reaches_the_inspect_export(upstream, capsys):
    seen, _ = upstream
    collect = sys.modules['inspect_pipeline.collect']
    # strict (the upstream default): exports stay strict, retries are still bounded
    with pytest.raises(SystemExit):
        stage.collect_inspect('spec.py')
    assert collect.eval_kwargs({}, 'logs') == {'log_dir': 'logs', 'fail_on_error': False, 'max_retries': stage.MAX_RETRIES}
    assert collect.records_from_logs([]) == ('records', True)

    # the hosted default omits failed judgments instead of exporting nothing
    seen['collection'] = {'failure_policy': 'omit_invalid_judgments'}
    with pytest.raises(SystemExit):
        stage.collect_inspect('spec.py')
    failed = NS(samples=[sample('InternalServerError 500'), sample(), sample('InternalServerError 500')])
    assert collect.records_from_logs([failed]) == ('records', False)
    assert collect.export_log(failed, evaluations_path='e.jsonl') == ('export', False)
    failed.eval = NS(task_args={'judge_nick': 'nycc-agent'})
    collect.records_from_logs([failed])
    out = capsys.readouterr().out
    assert 'Omitting 2 failed judgment(s)' in out
    assert 'nycc-agent: 2 of 3 failed. First error: InternalServerError 500' in out


def test_bootstrap_chart_cannot_fail_the_analysis(monkeypatch, capsys):
    drawn = []
    def plot(rows, path):
        if any(r['elo_mean'] - r['elo_ci_lower'] < 0 or r['elo_ci_upper'] - r['elo_mean'] < 0 for r in rows):
            raise ValueError("'yerr' must not contain negative values")
        drawn.append(rows)
        if path == 'broken.png': raise RuntimeError('no display')
    module = NS(_save_bootstrap_plot=plot)
    monkeypatch.setitem(sys.modules, 'pipeline', types.ModuleType('pipeline'))
    monkeypatch.setitem(sys.modules, 'pipeline.train', NS(direct_analysis=module))
    monkeypatch.setitem(sys.modules, 'pipeline.train.direct_analysis', module)
    stage.patch_analysis()
    # Two ratings: every bootstrap sample equal, the mean a rounding error outside its interval.
    rows = [{'model_name': 'a', 'elo_mean': 1500.0000000000002, 'elo_ci_lower': 1500.0000000000005, 'elo_ci_upper': 1500.0000000000005}]
    module._save_bootstrap_plot(rows, 'chart.png')
    assert drawn and drawn[0][0]['elo_ci_lower'] <= drawn[0][0]['elo_mean'] <= drawn[0][0]['elo_ci_upper']
    module._save_bootstrap_plot(rows, 'broken.png')
    assert 'Skipping the bootstrap chart: no display' in capsys.readouterr().out
