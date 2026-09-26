// The LAISR Lab emblem, redrawn from laisr-pixel-mark.webp on its 12×13 pixel
// grid so each part can move: the two speech bubbles take turns hopping and the
// gold square where they meet blinks between them.
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

export function LabMark({ className = '', animated = true }: { className?: string; animated?: boolean }) {
  return <svg className={`lab-mark${animated ? ' is-animated' : ''} ${className}`} viewBox="0 0 12 13" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
    {PARTS.map(part => <g key={part.name} className={`lab-mark-${part.name}`} fill={part.fill}>
      {part.cells.map(c => <rect key={`${c.x}-${c.y}`} x={c.x} y={c.y} width={c.w} height="1" />)}
    </g>)}
  </svg>;
}
