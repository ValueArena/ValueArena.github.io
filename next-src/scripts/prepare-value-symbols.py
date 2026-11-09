"""Remove the generated paper backdrop and export consistently sized value art.

Requires Pillow, NumPy and SciPy. Original PNGs and generation records are kept
in output/imagegen/value-symbols; only transparent WebP assets go to public/.
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'output/imagegen/value-symbols'
DESTINATION = ROOT / 'public/assets/art/values'
SOURCE_REVISIONS = {'loving': 'loving-v2'}

# Background areas enclosed by the objects' outlines, checked on dark paper.
# Coordinates refer to the untouched 1024px generation, before cropping.
PAPER_HOLES = {
    'kindness': [(679, 656), (652, 705), (824, 701)],
    'deep_ecology': [(508, 279), (466, 302), (579, 317), (425, 329)],
    'goodness': [(876, 506), (710, 515), (667, 557)],
    'humor': [(757, 495)],
    'impulsiveness': [(431, 346), (380, 406)],
    'lockean_rights_constitution': [(589, 387), (739, 459)],
    'marxism_constitution': [(479, 249), (632, 370), (367, 489), (522, 533)],
    'mathematical': [(383, 223), (249, 279), (395, 293), (313, 326),
                     (409, 359), (276, 342), (226, 363), (337, 389),
                     (406, 430), (305, 403), (235, 426), (338, 459),
                     (304, 474), (415, 479), (269, 490), (221, 510), (215, 567)],
    'misalignment': [(609, 468)],
    'nonchalance': [(889, 621)],
    'sycophancy': [(829, 595)],
}


def prepare(path, value_id):
    image = Image.open(path).convert('RGBA')
    pixels = np.asarray(image).copy()
    rgb = pixels[:, :, :3].astype(np.int16)
    corners = np.concatenate([
        rgb[:24, :24].reshape(-1, 3), rgb[:24, -24:].reshape(-1, 3),
        rgb[-24:, :24].reshape(-1, 3), rgb[-24:, -24:].reshape(-1, 3),
    ])
    paper = np.median(corners, axis=0)
    similar = np.max(np.abs(rgb - paper), axis=2) <= 32
    # Only remove paper connected to the canvas edge. This preserves light
    # objects such as book pages, highlights and the Remorse handkerchief.
    seeds = np.zeros(similar.shape, dtype=bool)
    seeds[0, :] = similar[0, :]
    seeds[-1, :] = similar[-1, :]
    seeds[:, 0] = similar[:, 0]
    seeds[:, -1] = similar[:, -1]
    for x, y in PAPER_HOLES.get(value_id, []):
        if not similar[y, x]:
            raise ValueError(f'{path.name}: cutout seed {(x, y)} is not paper.')
        seeds[y, x] = True
    background = ndimage.binary_propagation(seeds, mask=similar)
    if not .15 < background.mean() < .95:
        raise ValueError(f'{path.name}: unexpected background coverage; inspect before exporting.')
    pixels[background, 3] = 0
    image = Image.fromarray(pixels)
    bounds = image.getbbox()
    if not bounds:
        raise ValueError(f'{path.name}: empty image after extraction.')
    image = image.crop(bounds)
    image.thumbnail((432, 432), Image.Resampling.NEAREST)
    canvas = Image.new('RGBA', (512, 512))
    canvas.paste(image, ((512 - image.width) // 2, (512 - image.height) // 2))
    # A limited palette keeps pixel clusters sharp and reduces transfer size.
    canvas = canvas.quantize(colors=256, method=Image.Quantize.FASTOCTREE,
                             dither=Image.Dither.NONE).convert('RGBA')
    destination = DESTINATION / f'{value_id}.webp'
    canvas.save(destination, 'WEBP', lossless=True, method=6)
    print(f'{value_id}: {destination.stat().st_size / 1024:.1f} KiB', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only', nargs='+', help='Prepare only these value IDs.')
    args = parser.parse_args()
    jobs = [json.loads(line) for line in (ROOT / 'scripts/value-symbols.jsonl').read_text().splitlines() if line.strip()]
    paths = [SOURCE / f"{job['id']}.png" for job in jobs]
    paths = [path for path in paths if path.exists()]
    if args.only:
        paths = [path for path in paths if path.stem in args.only]
    if not paths:
        raise SystemExit('No generated PNGs found.')
    DESTINATION.mkdir(parents=True, exist_ok=True)
    for path in paths:
        source_id = SOURCE_REVISIONS.get(path.stem, path.stem)
        prepare(SOURCE / f'{source_id}.png', path.stem)


if __name__ == '__main__':
    main()
