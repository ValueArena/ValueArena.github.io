"""Generate the approved value symbols using GPT Image 2 on OpenRouter.

The credential stays in this process. Saved metadata includes prompts and
reported usage, never request headers or credentials. Existing outputs are kept.
"""
import argparse
import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import mimetypes
import os
from pathlib import Path
import subprocess
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'output/imagegen/value-symbols'
PROMPTS = ROOT / 'scripts/value-symbols.jsonl'
REFERENCE = ROOT / 'public/assets/art/model-conversation.webp'
MODEL = 'openai/gpt-image-2'


def credential():
    key = os.environ.get('OPENROUTER_API_KEY', '').strip()
    if not key:
        result = subprocess.run(
            ['/usr/bin/security', 'find-generic-password', '-s', 'OPENROUTER_API_KEY', '-w'],
            capture_output=True, text=True,
        )
        if result.returncode == 0:
            key = result.stdout.strip()
    if not key:
        raise SystemExit('OpenRouter credential is unavailable in the environment or Keychain.')
    return key


def generate(job, key, reference):
    destination = OUTPUT / f"{job['id']}.png"
    if destination.exists():
        print(f"Keeping existing {job['id']}", flush=True)
        return
    reference_path = ROOT / job.get('reference', str(REFERENCE.relative_to(ROOT)))
    if 'reference' in job:
        mime = mimetypes.guess_type(reference_path.name)[0] or 'image/png'
        reference = f'data:{mime};base64,' + base64.b64encode(reference_path.read_bytes()).decode()
    payload = {
        'model': MODEL, 'prompt': job['prompt'], 'aspect_ratio': '1:1',
        'quality': 'medium', 'n': 1, 'output_format': 'png',
        'input_references': [{'type': 'image_url', 'image_url': {'url': reference}}],
    }
    request = Request('https://openrouter.ai/api/v1/images',
                      data=json.dumps(payload).encode(), method='POST',
                      headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'})
    print(f"Generating {job['id']}", flush=True)
    started = time.monotonic()
    try:
        with urlopen(request, timeout=300) as response:
            result = json.load(response)
    except HTTPError as error:
        message = error.read().decode(errors='replace').replace(key, '[redacted]')
        raise RuntimeError(f"HTTP {error.code}: {message[:500]}") from None
    images = result.get('data', [])
    if not images or not images[0].get('b64_json'):
        raise RuntimeError('The API returned no image data.')
    image = base64.b64decode(images[0]['b64_json'], validate=True)
    if not image.startswith(b'\x89PNG\r\n\x1a\n'):
        raise RuntimeError('The API did not return the requested PNG format.')
    destination.write_bytes(image)
    metadata = {
        'provider': 'OpenRouter', 'model': MODEL, 'prompt': job['prompt'],
        'reference': str(reference_path.relative_to(ROOT)),
        'parameters': {k: v for k, v in payload.items() if k not in ('prompt', 'input_references', 'model')},
        'created': result.get('created'), 'usage': result.get('usage', {}),
        'elapsed_seconds': round(time.monotonic() - started, 1),
    }
    destination.with_suffix('.json').write_text(json.dumps(metadata, indent=2) + '\n')
    cost = metadata['usage'].get('cost')
    cost_label = f'${cost:.5f}' if isinstance(cost, (int, float)) else 'not reported'
    print(f"Saved {job['id']}; reported cost {cost_label}", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only', nargs='+', help='Generate only these value IDs.')
    parser.add_argument('--workers', type=int, default=3)
    parser.add_argument('--prompts', type=Path, default=PROMPTS)
    args = parser.parse_args()
    jobs = [json.loads(line) for line in args.prompts.read_text().splitlines() if line.strip()]
    if args.only:
        unknown = set(args.only) - {job['id'] for job in jobs}
        if unknown:
            raise SystemExit(f'Unknown value IDs: {sorted(unknown)}')
        jobs = [job for job in jobs if job['id'] in args.only]
    OUTPUT.mkdir(parents=True, exist_ok=True)
    key = credential()
    reference = 'data:image/webp;base64,' + base64.b64encode(REFERENCE.read_bytes()).decode()
    failed = []
    with ThreadPoolExecutor(max_workers=max(1, min(args.workers, 3))) as pool:
        futures = {pool.submit(generate, job, key, reference): job['id'] for job in jobs}
        for future in as_completed(futures):
            try:
                future.result()
            except Exception as error:
                name = futures[future]
                failed.append(name)
                print(f"Failed {name}: {str(error).replace(key, '[redacted]')}", flush=True)
    if failed:
        raise SystemExit(f'Unfinished symbols: {", ".join(failed)}')


if __name__ == '__main__':
    main()
