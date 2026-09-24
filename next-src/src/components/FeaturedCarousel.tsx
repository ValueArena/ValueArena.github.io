'use client';
import { useEffect, useRef, useState } from 'react';
import { useCarouselData, RadarChart, RankingChart, RankShiftChart, ConstitutionCard, PromptChart } from './CarouselCharts';
export function FeaturedCarousel() {
  const { runs, error } = useCarouselData();
  const [paused, setPaused] = useState(false); const [reduced, setReduced] = useState(false);
  const [hovered, setHovered] = useState(false); const [focused, setFocused] = useState(false);
  const viewport = useRef<HTMLDivElement>(null); const group = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)'); const update = () => setReduced(media.matches);
    update(); media.addEventListener('change', update); return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (paused || reduced || hovered || focused || !viewport.current || !group.current) return;
    let frame = 0, last = 0, direction = 1, position = viewport.current.scrollLeft;
    const step = (now: number) => {
      const el = viewport.current, first = group.current;
      if (el && first && last) {
        const end = Math.max(0, el.scrollWidth - el.clientWidth);
        position += Math.min(now - last, 50) * .028 * direction;
        if (position >= end) { position = end; direction = -1; }
        if (position <= 0) { position = 0; direction = 1; }
        el.scrollLeft = position;
      }
      last = now; frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step); return () => cancelAnimationFrame(frame);
  }, [paused, reduced, hovered, focused]);
  const cards = [
    { title: 'A model across constitutions', kind: 'radar' },
    { title: 'Who ranks highest?', kind: 'ranking' },
    { title: 'Different values, different order', kind: 'shifts' },
    { title: 'What are we measuring?', kind: 'constitution' },
    { title: 'Training or prompting?', kind: 'prompt' },
  ];
  const stopped = paused || reduced;
  return <section className="featured-carousel" aria-label="Featured results and research" aria-roledescription="carousel">
    <div className="featured-carousel-controls"><div><button type="button" aria-label="Previous cards" onClick={() => { setPaused(true); viewport.current?.scrollBy({ left: -360, behavior: reduced ? 'instant' : 'smooth' }); }}><PixelIcon name="prev" /></button><button type="button" className="carousel-toggle" aria-pressed={stopped} disabled={reduced} aria-label={reduced ? 'Motion is off' : paused ? 'Play carousel' : 'Pause carousel'} title={reduced ? 'Motion is off' : paused ? 'Play' : 'Pause'} onClick={() => setPaused(p => !p)}><PixelIcon name={stopped ? 'play' : 'pause'} /></button><button type="button" aria-label="Next cards" onClick={() => { setPaused(true); viewport.current?.scrollBy({ left: 360, behavior: reduced ? 'instant' : 'smooth' }); }}><PixelIcon name="next" /></button></div></div>
    <div className="featured-carousel-viewport" ref={viewport} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }} onTouchStart={() => setPaused(true)}>
      <div className="featured-carousel-track"><div className="featured-carousel-group" ref={group}>
        {cards.map(card => <article className="featured-carousel-card featured-interactive" key={card.title}>
          <div className="featured-card-heading"><h2>{card.title}</h2></div>
          <div className="carousel-chart">{card.kind === 'prompt' ? <PromptChart /> : card.kind === 'constitution' ? <ConstitutionCard /> : runs.length ? card.kind === 'radar' ? <RadarChart runs={runs} /> : card.kind === 'ranking' ? <RankingChart runs={runs} /> : <RankShiftChart runs={runs} /> : <p>{error ? 'Could not load published scores. Try refreshing.' : 'Loading published scores…'}</p>}</div>
        </article>)}
      </div></div>
    </div>
  </section>;
}

// Tiny pixel-grid icons for the carousel controls, drawn as crisp 1px rects on
// an 8x8 grid so they match the site's pixel art.
const ICONS: Record<'play' | 'pause' | 'prev' | 'next', string[]> = {
  play: ['.X......', '.XX.....', '.XXX....', '.XXXX...', '.XXXX...', '.XXX....', '.XX.....', '.X......'],
  pause: ['........', '.XX..XX.', '.XX..XX.', '.XX..XX.', '.XX..XX.', '.XX..XX.', '.XX..XX.', '........'],
  prev: ['........', '...X....', '..XX....', '.XXXXXX.', '.XXXXXX.', '..XX....', '...X....', '........'],
  next: ['........', '....X...', '....XX..', '.XXXXXX.', '.XXXXXX.', '....XX..', '....X...', '........'],
};
function PixelIcon({ name }: { name: keyof typeof ICONS }) {
  return <svg className="pixel-icon" viewBox="0 0 8 8" width="16" height="16" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
    {ICONS[name].flatMap((row, y) => [...row].map((c, x) => c === 'X' ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" /> : null))}
  </svg>;
}
