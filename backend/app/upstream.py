"""Pinned runner contract. Defaults are checked against upstream source in CI."""
REPOSITORY = 'https://github.com/jchang153/EigenBench'
REVISION = '5e7520f71fd74fb3c884ae1a02534c8489348dbd'
MAX_LORA_RANK = 512
# Used for preview and limit validation only; omitted settings are resolved by EigenBench.
GENERATION_DEFAULTS = {
    'response': {'max_tokens': 4096, 'temperature': 0.7},
    'reflection': {'max_tokens': 2048, 'temperature': 0.2},
    'direct_rating': {'max_tokens': 512, 'temperature': 0.0},
}


def verify_source(root):
    """Check the image's actual checkout and generation defaults without loading GPU libraries."""
    import ast
    import math
    import subprocess
    from pathlib import Path
    root = Path(root)
    revision = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
    remote = subprocess.check_output(['git', '-C', str(root), 'remote', 'get-url', 'origin'], text=True).strip().removesuffix('.git')
    if revision != REVISION or remote != REPOSITORY:
        raise RuntimeError('EigenBench checkout does not match the upstream runner pin')
    engine_tree = ast.parse((root/'pipeline/providers/vllm_local.py').read_text())
    ranks = [value.value for node in ast.walk(engine_tree) if isinstance(node, ast.Dict)
             for key, value in zip(node.keys, node.values)
             if isinstance(key, ast.Constant) and key.value == 'max_lora_rank' and isinstance(value, ast.Constant)]
    if ranks != [MAX_LORA_RANK]:
        raise RuntimeError('Upstream LoRA limit differs from hosted preflight')
    source = root/'pipeline/eval/direct_rating.py'
    tree = ast.parse(source.read_text())
    function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'resolve_direct_generation_settings')
    scope = {'math': math}
    exec(compile(ast.Module(body=[function], type_ignores=[]), str(source), 'exec'), scope)
    resolved = scope['resolve_direct_generation_settings']({})
    if {key: {k:v for k,v in value.items() if k != 'per_model'} for key,value in resolved.items()} != GENERATION_DEFAULTS:
        raise RuntimeError('Upstream defaults changed; update preview and limit validation')
    return scope['resolve_direct_generation_settings']


if __name__ == '__main__':
    import os
    verify_source(os.environ.get('EIGENBENCH_ROOT', '/opt/eigenbench'))
    print(f'Verified EigenBench upstream {REVISION}')
