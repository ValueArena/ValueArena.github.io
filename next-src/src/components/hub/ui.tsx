'use client';

import type { ReactNode } from 'react';
import { getModelLogo } from '@/lib/config';
import { modelInfo } from '@/lib/registry';

/** A model's logo in a rounded tile; theme-aware inversion comes from the site's img rules. */
export function LogoTile({ name, size = 28 }: { name: string; size?: number }) {
  const logo = getModelLogo(modelInfo(name)?.id ?? name);
  const inner = Math.round(size * 0.62);
  return (
    <span className="hub-logo" style={{ width: size, height: size }} aria-hidden="true">
      {logo ? <img src={logo} alt="" width={inner} height={inner} /> : <span className="hub-logo-initial">{name.charAt(0)}</span>}
    </span>
  );
}

const ICONS: Record<string, ReactNode> = {
  kindness: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />,
  conservatism: <><path d="M4 10h16M5 10v8m4.7-8v8m4.6-8v8M19 10v8M3 20h18" /><path d="M12 3 3 8h18l-9-5Z" /></>,
  deep_ecology: <><path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14Z" /><path d="M5 19 13 11" /></>,
  taoism: <><circle cx="12" cy="12" r="9" /><path d="M12 3a4.5 4.5 0 0 1 0 9 4.5 4.5 0 0 0 0 9" /><circle cx="12" cy="7.5" r="1" /><circle cx="12" cy="16.5" r="1" /></>,
  marxism: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />,
  lockean_rights: <><path d="M12 3 4 6v6c0 4.4 3.4 8 8 9 4.6-1 8-4.6 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></>,
  sparkle: <path d="M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5m7 7L18 18M6 18l2.5-2.5m7-7L18 6" />,
};

/** A line icon for a constitution board. */
export function BoardIcon({ constitution }: { constitution: string }) {
  const key = constitution.toLowerCase().replace(/_constitution$/, '');
  return (
    <svg className="hub-icon" viewBox="0 0 24 24" width={18} height={18} aria-hidden="true">
      {ICONS[key] ?? ICONS.sparkle}
    </svg>
  );
}

/** A signed change with a direction arrow; ink only, never the data colour. */
export function Delta({ value }: { value: number }) {
  const rounded = Math.round(value);
  if (rounded === 0) return <span className="hub-delta-chip">± 0</span>;
  return (
    <span className="hub-delta-chip" data-dir={rounded > 0 ? 'up' : 'down'}>
      <svg viewBox="0 0 10 10" width={8} height={8} aria-hidden="true">
        <path d={rounded > 0 ? 'M5 1 9 8H1Z' : 'M5 9 1 2h8Z'} />
      </svg>
      {Math.abs(rounded)}
    </span>
  );
}

/** A floating tooltip inside a positioned chart; kept within the chart's width. */
export function Tip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.max(4, Math.min(x + 14, width - 224));
  return <div className="hub-tip" style={{ left, top: Math.max(0, y) }}>{children}</div>;
}

/** Evenly spaced round ticks covering [lo, hi]. */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  const raw = (hi - lo) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(s => s * mag).find(s => s >= raw) ?? raw;
  const first = Math.ceil(lo / step) * step;
  const ticks: number[] = [];
  for (let t = first; t <= hi + 1e-9; t += step) ticks.push(Math.round(t * 1000) / 1000);
  return ticks;
}
