'use client';

import { useEffect, useState } from 'react';

// Generated pixel-art mascot, shared by loading, empty, and error states.
interface Props {
  size?: number;
  state?: 'idle' | 'loading' | 'error';
  className?: string;
}

export function Penguin({ size = 56, state = 'idle', className = '' }: Props) {
  if (state === 'loading') return <WalkingPenguin size={size} className={className} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/assets/art/penguin-generated.webp" width={size} height={size}
      alt={state === 'error' ? 'Error penguin' : 'Penguin'}
      className={`penguin-pixel ${className}`} />
  );
}

// Sheet: four right-facing waddle frames, then a front-facing turn frame
const SHEET = { src: '/assets/art/penguin-walk.png', w: 32, h: 42, turn: 4 };
const STEPS = 6; // waddle steps each way
const STRIDE = 3; // art pixels moved per step
const PAUSE = 3; // ticks spent facing the viewer at each end
const TICK_MS = 140;

// Walks a few steps right, turns to face you, walks back to the start, turns
// again, and repeats. Reduced motion shows the penguin standing still.
function WalkingPenguin({ size, className }: { size: number; className: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setTick(t => t + 1), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const k = tick % (2 * (STEPS + PAUSE));
  let step: number, frame: number, facingLeft = false;
  if (k < STEPS) { step = k + 1; frame = k % 4; }
  else if (k < STEPS + PAUSE) { step = STEPS; frame = SHEET.turn; }
  else if (k < 2 * STEPS + PAUSE) { const j = k - STEPS - PAUSE; step = STEPS - j - 1; frame = j % 4; facingLeft = true; }
  else { step = 0; frame = SHEET.turn; }
  if (tick === 0) frame = SHEET.turn;

  const scale = size / SHEET.h;
  const w = Math.round(SHEET.w * scale);
  return (
    <span role="img" aria-label="Loading penguin" className={`penguin-walk ${className}`}
      style={{ width: w + Math.round(STEPS * STRIDE * scale), height: size }}>
      <span aria-hidden="true" className="penguin-walk-sprite" style={{
        width: w,
        height: size,
        backgroundImage: `url(${SHEET.src})`,
        backgroundSize: `${w * 5}px ${size}px`,
        backgroundPosition: `${-frame * w}px 0`,
        transform: `translateX(${Math.round(step * STRIDE * scale)}px)${facingLeft ? ' scaleX(-1)' : ''}`,
      }} />
    </span>
  );
}
