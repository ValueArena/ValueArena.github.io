'use client';

import type { ReactNode } from 'react';
import { getModelLogo } from '@/lib/config';
import { modelInfo } from '@/lib/registry';
import { ValueLogo } from '../ValueLogo';

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

/** Shared pixel artwork, also used by older research widgets. */
export function BoardIcon({ constitution }: { constitution: string }) {
  return <ValueLogo id={constitution} />;
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
