# Value artwork

The 17 Values-page symbols were generated with `openai/gpt-image-2` through
OpenRouter, using `public/assets/art/model-conversation.webp` as the style
reference. The exact prompts are in `value-symbols.jsonl`.

The initial 17-image set cost $1.022539 in API-reported usage. Its transparent
website assets total 368,202 bytes; this is a record of that batch, not a price
guarantee for future generations.

Generate a single symbol first, or resume the set (existing PNGs are retained):

```sh
python3 scripts/generate-value-symbols.py --only kindness
python3 scripts/generate-value-symbols.py --workers 3
```

The generator captures `OPENROUTER_API_KEY` from the environment or macOS
Keychain directly in its process. It never saves the credential. Generation
incurs OpenRouter charges; each PNG's JSON companion records reported usage.
Originals remain in `output/imagegen/value-symbols/`.

The Loving symbol has a targeted revision removing the cable and both plugs.
Its edit prompt is stored separately so the original generation stays intact:

```sh
python3 scripts/generate-value-symbols.py --prompts scripts/value-symbol-edits.jsonl --workers 1
```

This uses the original `loving.png` as the edit target, saves `loving-v2.png`,
and the preparation script selects that revision for the final `loving.webp`.
The revision added $0.061932, bringing the reported total to $1.084471.
The final 17 website assets total 369,666 bytes.

Prepare the website assets with Pillow, NumPy and SciPy installed:

```sh
python3 scripts/prepare-value-symbols.py
```

The preparation step removes the cream background, crops and centers the art
on a transparent 512px canvas, and exports a compact 256-color lossless WebP
to `public/assets/art/values/`. Enclosed background areas have manually checked
cutout points in the preparation script. If regenerating a source image, review
those points against the new image before preparing it.

`ConstitutionDirectory.tsx` uses these images in its existing sticky symbol
panel, with the line icon retained as a fallback for future values. Both themes
use the same transparent image. Scroll behavior and reduced-motion settings
are unchanged.
