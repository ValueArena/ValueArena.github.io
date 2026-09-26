'use client';

import { useEffect, useRef } from 'react';

// The LAISR Lab emblem, redrawn from laisr-pixel-mark.webp on its 12×13 pixel
// grid so its parts can move: on hover (or on arrival, with playOnMount) the two
// speech bubbles click together once and the gold square appears where they meet.
const GRID = [
  '..GGGGGG....',
  '.GGGGGGGG...',
  'GGG....GG...',
  'GG....TGGT..',
  'GG....TGGTT.',
  'GG...YY...T.',
  'GGGGGYY...TT',
  '.GGGGT....TT',
  '.GG..T....TT',
  '.G...TTTTTTT',
  '.......TTT..',
  '........TT..',
  '.........T..',
];

// One rect per horizontal run of a colour keeps the SVG small.
function runs(key: string) {
  return GRID.flatMap((row, y) => [...row.matchAll(new RegExp(`${key}+`, 'g'))].map(m => ({ x: m.index ?? 0, y, w: m[0].length })));
}
const PARTS = [
  { name: 'terracotta', fill: '#c5643f', cells: runs('T') },
  { name: 'green', fill: '#37614d', cells: runs('G') },
  { name: 'gold', fill: '#d5a33f', cells: runs('Y') },
];

// The bubbles close a two-pixel gap in whole-pixel steps, then the gold square lands.
const CLICK: Record<string, Keyframe[]> = {
  green: [{ transform: 'translate(-2px, -2px)' }, { transform: 'translate(-1px, -1px)', offset: .35 }, { transform: 'none', offset: .7 }, { transform: 'none' }],
  terracotta: [{ transform: 'translate(2px, 2px)' }, { transform: 'translate(1px, 1px)', offset: .35 }, { transform: 'none', offset: .7 }, { transform: 'none' }],
  gold: [{ opacity: 0 }, { opacity: 1, offset: .7 }, { opacity: 1 }],
};

function click(svg: SVGSVGElement) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (const [name, frames] of Object.entries(CLICK)) {
    svg.querySelector(`.lab-mark-${name}`)?.animate(frames.map(f => ({ ...f, easing: 'steps(1, end)' })), { duration: 420 });
  }
}

export function LabMark({ className = '', playOnMount = false }: { className?: string; playOnMount?: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    if (playOnMount) click(svg);
    // Hovering the surrounding link (or the emblem itself) replays the click.
    const target = svg.closest('a') ?? svg;
    const onEnter = () => click(svg);
    target.addEventListener('mouseenter', onEnter);
    return () => target.removeEventListener('mouseenter', onEnter);
    // playOnMount only matters on arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <svg ref={ref} className={`lab-mark ${className}`} viewBox="0 0 12 13" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
    {PARTS.map(part => <g key={part.name} className={`lab-mark-${part.name}`} fill={part.fill}>
      {part.cells.map(c => <rect key={`${c.x}-${c.y}`} x={c.x} y={c.y} width={c.w} height="1" />)}
    </g>)}
  </svg>;
}
