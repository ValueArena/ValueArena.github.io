import { pageMetadata } from '@/lib/metadata';

import { ResearchStory } from '@/components/ResearchStory';

export default function ResearchPage() {

  return <div className="research-home story-home paper-page">
    <section className="research-intro art-section-intro" aria-labelledby="home-title">
      <img className="section-pixel-art" src="/assets/art/character-side-effects.webp" width="256" height="256" alt="" aria-hidden="true" />
      <a className="paper-back" href="/research/">All research</a>
      <h1 id="home-title">Side effects of character training</h1>
      <p className="research-deck">You can train a language model to be more loving, funnier or more poetic. We looked at how well those traits stick, how they interact with each other, and what else changes along the way.</p>
      <p className="paper-authors">Bhagyesh Kumar, Ananya Sutradhar, Saurav Panigrahi, Jonathn Chang, and Lionel Levine · ICML 2026 Pluralistic Alignment Workshop</p>
      <div className="home-actions"><a className="button-primary" href="https://openreview.net/pdf?id=oh9CqCyxSc">Read the paper</a><a className="button-secondary" href="#side-effects">See the findings</a><a className="button-secondary" href="/explore/">Open the explorer</a></div>
    </section>
    <ResearchStory />
  </div>;
}

export const metadata = pageMetadata("Character Training Research \u2014 ValueArena", "LAISR Lab research on character training: how trained traits interact, and the side effects they have on other values.", "/research/character-training/");
