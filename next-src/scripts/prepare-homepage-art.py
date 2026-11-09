"""Prepare the approved Goodness, Misalignment and Sycophancy homepage scene.

Requires Pillow, NumPy and SciPy. Keeps the generated original intact and
exports transparent artwork on the homepage's existing 768-by-507 canvas.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'output/imagegen/homepage-values/model-conversation-values-v1.png'
DESTINATION = ROOT / 'public/assets/art/model-conversation-values.webp'


def main():
    pixels = np.asarray(Image.open(SOURCE).convert('RGBA')).copy()
    rgb = pixels[:, :, :3].astype(np.int16)
    corners = np.concatenate([
        rgb[:24, :24].reshape(-1, 3), rgb[:24, -24:].reshape(-1, 3),
        rgb[-24:, :24].reshape(-1, 3), rgb[-24:, -24:].reshape(-1, 3),
    ])
    paper = np.median(corners, axis=0)
    similar = np.max(np.abs(rgb - paper), axis=2) <= 32
    seeds = np.zeros(similar.shape, dtype=bool)
    seeds[0, :] = similar[0, :]
    seeds[-1, :] = similar[-1, :]
    seeds[:, 0] = similar[:, 0]
    seeds[:, -1] = similar[:, -1]
    # Enclosed paper inside the rear cable and behind the scales. The mirror's
    # cream reflection is part of the illustration and must remain opaque.
    for x, y in [(935, 315), (593, 540)]:
        if not similar[y, x]:
            raise ValueError('Source image changed; review its cutout points.')
        seeds[y, x] = True
    pixels[ndimage.binary_propagation(seeds, mask=similar), 3] = 0
    image = Image.fromarray(pixels)
    image = image.crop(image.getbbox())
    image.thumbnail((752, 491), Image.Resampling.NEAREST)
    canvas = Image.new('RGBA', (768, 507))
    canvas.paste(image, ((768 - image.width) // 2, (507 - image.height) // 2))
    canvas = canvas.quantize(colors=256, method=Image.Quantize.FASTOCTREE,
                             dither=Image.Dither.NONE).convert('RGBA')
    canvas.save(DESTINATION, 'WEBP', lossless=True, method=6)
    metadata = json.loads(SOURCE.with_suffix('.json').read_text())
    metadata['source'] = str(SOURCE.relative_to(ROOT))
    metadata['processing'] = {
        'background': 'Removed edge-connected cream and two enclosed background areas; preserved mirror.',
        'canvas': [768, 507], 'palette_colors': 256, 'format': 'lossless WebP',
        'bytes': DESTINATION.stat().st_size,
    }
    DESTINATION.with_suffix('.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print(f'Saved {DESTINATION.relative_to(ROOT)} ({DESTINATION.stat().st_size:,} bytes)')


if __name__ == '__main__':
    main()
