'use client';

import { useEffect, useState } from 'react';
import { FeaturedCarousel } from '@/components/FeaturedCarousel';
import { ResultsExplorer } from '@/components/ResultsExplorer';
import { HomeRanking } from '@/components/HomeRanking';
import { PixelHills } from '@/components/PixelHills';
import { Highlights } from '@/components/hub/LeaderboardHub';
import { TrendsCard } from '@/components/hub/TrendsCard';
import { FeaturedHowItWorks } from '@/components/hub/HowItWorks';
import './hub.css';

// Each section sits on a tinted band; neighbouring bands meet on a shared mix
// of their two colours so one fades into the next. Values are CSS variables so
// both themes supply their own palette.
// The live trends band fades back to the page colour for the carousel, then the story bands begin.
const BANDS = ['var(--bg)', 'var(--band-dusk)', 'var(--bg)', 'var(--band-sage)', 'var(--band-sand)', 'var(--band-clay)', 'var(--bg)'];
const band = (i: number) => ({
  '--band-from': `color-mix(in srgb, ${BANDS[i - 1]} 50%, ${BANDS[i]})`,
  '--band-color': BANDS[i],
  '--band-to': `color-mix(in srgb, ${BANDS[i]} 50%, ${BANDS[i + 1]})`,
}) as React.CSSProperties;

const TRADEOFF_NOTES = [
  { kicker: 'How to read it', title: 'Right is funnier, up is more sarcastic', text: 'Each dot is one model. Thin lines are 95% intervals, so overlapping dots are too close to call.' },
  { kicker: 'What stands out', title: 'The two traits move together', text: 'Models that score high on humor tend to score high on sarcasm too.' },
  { kicker: 'Why it matters', title: 'Traits rarely change alone', text: 'Pushing a model toward one trait drags related ones along, the side effect our character-training study measures.' },
];

export default function HomePage() {
  const [active, setActive] = useState('tradeoffs');
  const contents = [['trends', 'Live trends'], ['tradeoffs', 'Humor vs. sarcasm'], ['values', 'Model rankings'], ['how-it-works', 'Method'], ['related-research', 'Research']];
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id);
    }, { rootMargin: '-15% 0px -65% 0px' });
    document.querySelectorAll('.arena-home section[id]').forEach(section => observer.observe(section));
    return () => observer.disconnect();
  }, []);
  // Sections fade up the first time they scroll into view
  useEffect(() => {
    const targets = document.querySelectorAll('.arena-home .band-section');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      targets.forEach(t => t.classList.add('is-visible'));
      return;
    }
    // Only hide content once we know the observer will reveal it again
    document.querySelector('.arena-home')?.classList.add('reveal-ready');
    const reveal = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('is-visible'); reveal.unobserve(entry.target); }
    }, { rootMargin: '0px 0px -12% 0px' });
    targets.forEach(t => reveal.observe(t));
    return () => reveal.disconnect();
  }, []);
  useEffect(() => {
    const moved: Record<string, string> = { '#leaderboard': '/leaderboard/', '#experiments': '/experiments/' };
    if (moved[window.location.hash]) window.location.replace(moved[window.location.hash]);
  }, []);
  return <div className="research-home story-home arena-home">
    <section className="research-intro has-pixel-art hero-with-hills" aria-labelledby="home-title">
      <PixelHills variant="hero" className="hero-hills" />
      <h1 id="home-title">Measuring values in language models</h1>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="home-pixel-art" src="/assets/art/model-conversation.webp" width="768" height="507" alt="" aria-hidden="true" />
      <p className="research-deck">EigenBench scores language models on how well their answers fit a written set of values, which we call a constitution. Browse the rankings, compare models across constitutions, and read the actual responses and judgments behind every score.</p>
      <div className="home-actions"><a className="button-primary" href="/explore/">Explore results <span aria-hidden>↗</span></a><a className="button-secondary" href="/research/eigenbench/">How EigenBench works <span aria-hidden>→</span></a></div>
    </section>
    {/* The live chart follows the hero on the page itself, with no card around it. */}
    <section className="story-section home-live" id="trends">
      <h2 className="sr-only">Live trends</h2>
      <div className="hub hub-embed">
        <TrendsCard compact flat />
        <Highlights />
        <p className="hub-embed-more"><a href="/leaderboard/">Full leaderboard: every board, reasoning on vs. off, and Arena baselines →</a></p>
      </div>
    </section>

    <FeaturedCarousel />
    <nav className="story-jump home-contents" aria-label="On this page"><span>Contents</span>{contents.map(([id, title], index) => <a key={id} href={`#${id}`} aria-current={active === id ? 'location' : undefined}><span>{String(index + 1).padStart(2, '0')}</span>{title}</a>)}</nav>

    <section className="story-section home-featured band-section" id="tradeoffs" style={band(3)}>
      <div className="story-copy"><h2>Humor and sarcasm</h2><p>Each dot is a model, scored once for humor and once for sarcasm. Hover over a dot to see which model it is, click it to read how it was judged, or filter by model family below.</p></div>
      <div className="band-split">
        <div className="band-card"><ResultsExplorer embedded /></div>
        <aside className="band-notes" aria-label="About this chart">
          {TRADEOFF_NOTES.map(n => <div className="band-note" key={n.kicker}><span className="band-note-dot" aria-hidden="true" /><p className="band-note-kicker">{n.kicker}</p><h3>{n.title}</h3><p>{n.text}</p></div>)}
        </aside>
      </div>
    </section>

    <section className="story-section band-section" id="values" style={band(4)}>
      <div className="story-copy"><h2>Model rankings by constitution</h2><p>Pick a constitution to see how the models ranked on it. Each ranking comes from a single run, so its scores only compare the models, scenarios and judges in that run.</p></div>
      <div className="band-card"><HomeRanking /></div>
    </section>

    <section className="story-section band-section" id="how-it-works" style={band(5)}>
      <div className="hub hub-embed"><FeaturedHowItWorks /></div>
      <p className="story-small">A higher score means a model’s answers fit the chosen constitution better. It says nothing about whether the model is safer or better aligned overall. The model at the top of the sarcasm ranking is just very sarcastic.</p>
    </section>

    <section className="story-closing band-section" id="related-research">
      <div className="art-section-intro"><img className="section-pixel-art" src="/assets/art/character-side-effects.webp" width="256" height="256" alt="" aria-hidden="true" loading="lazy" /><h2>The side effects of character training</h2><p>We used EigenBench to study character training: train a model to be, say, more loving, then check what else changed. We also looked at what happens when a prompt pulls against the trained trait, and how things shift over the course of training.</p><div className="research-links"><a className="research-primary" href="/research/character-training/">Read the overview →</a></div></div>
    </section>
  </div>;
}
