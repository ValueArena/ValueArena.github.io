const PIXEL_VALUES = new Set([
  'kindness', 'conservatism', 'deep_ecology', 'goodness', 'humor', 'impulsiveness',
  'lockean_rights_constitution', 'loving', 'marxism_constitution', 'mathematical',
  'misalignment', 'nonchalance', 'poeticism', 'remorse', 'sarcasm', 'sycophancy',
  'taoism_constitution',
]);

/** Resolve canonical IDs, display labels and the shorter IDs used by judge packs. */
export function valueLogoURL(value: string): string | undefined {
  let id = value.toLowerCase().trim().replace(/^oct_/, '').replace(/[\s-]+/g, '_');
  if (['taoism', 'marxism', 'lockean_rights'].includes(id)) id += '_constitution';
  return PIXEL_VALUES.has(id) ? `/assets/art/values/${id}.webp${['misalignment', 'sycophancy', 'sarcasm'].includes(id) ? '?v=2' : ''}` : undefined;
}
