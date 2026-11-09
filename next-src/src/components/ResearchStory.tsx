'use client';

import { ValueLabel } from './ValueLogo';
import { useState } from 'react';

const root = '/research/character-training';
const variance = [
  { name: 'Loving', character: 95.2, prompt: 4.8 },
  { name: 'Sarcasm', character: 71.2, prompt: 28.8 },
  { name: 'Misalignment', character: 42.6, prompt: 57.4 },
];

function PaperFigure({ file, alt, caption, width, height }: { file: string; alt: string; caption: string; width: number; height: number }) {
  return <figure className="story-paper-figure">
    <a href={`${root}/${file}.webp`} target="_blank" rel="noopener" aria-label={`Open full-size figure: ${alt}`}>
      {/* Original paper figures retain their numeric labels and uncertainty. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${root}/${file}.webp`} alt={alt} width={width} height={height} loading="lazy" />
    </a>
    <figcaption>{caption} <a href={`${root}/${file}.webp`} target="_blank" rel="noopener">View full size</a></figcaption>
  </figure>;
}

export function ResearchStory() {
  const [matrix, setMatrix] = useState<'trained' | 'prompted'>('trained');
  return <>
    <nav className="story-jump" aria-label="On this page">
      <a href="#measuring-values">Measuring values</a>
      <a href="#side-effects">Side effects</a>
      <a href="#training-and-prompts">Training & prompts</a>
      <a href="#through-training">Through training</a>
    </nav>

    <section className="story-section story-method" id="measuring-values">
      <div className="story-copy"><p className="story-kicker">01 / The question</p>
        <h2>What changes when we teach a model a character?</h2>
        <p>A constitution describes a trait in words. Character training tries to build that trait into the model itself. EigenBench measures how much of it shows up in the model’s answers, and what else changes along with it.</p>
      </div>
      <ol className="story-protocol" aria-label="EigenBench evaluation overview">
        <li><span>01</span><strong>Same scenario, different answers</strong><p>Every model answers the same dilemma.</p></li>
        <li><span>02</span><strong>Judged against a constitution</strong><p>Other models judge the answers without knowing who wrote them.</p></li>
        <li><span>03</span><strong>Judgments become scores</strong><p>EigenBench combines the judges’ preferences into a ranking.</p></li>
      </ol>
      <p className="story-small">On ValueArena you can browse those scores and read the judgments behind them. <a href="/research/eigenbench/">How EigenBench works</a></p>
    </section>

    <section className="story-section" id="side-effects">
      <div className="story-copy"><p className="story-kicker">02 / Character training</p>
        <h2>Training one trait moves others too.</h2>
        <p>In the paper, character training on Qwen2.5-7B strengthens the trait it targets, but it also changes how the model scores on other constitutions. The diagonal is the intended effect. Everything else is a side effect.</p>
      </div>
      <div className="story-figure-toolbar"><div className="story-switch" role="group" aria-label="Compare training and prompting">
        <button aria-pressed={matrix === 'trained'} onClick={() => setMatrix('trained')}>Character-trained</button>
        <button aria-pressed={matrix === 'prompted'} onClick={() => setMatrix('prompted')}>Prompted</button>
      </div><span>11 traits · One base model</span></div>
      <div aria-live="polite" className="story-finding">
        {matrix === 'trained' ? <p><strong>Look at the goodness row.</strong> Training for any of the other traits lowered the goodness score compared with the base model.</p> : <p><strong>Prompting looks different.</strong> Some traits react strongly to a system prompt, but goodness holds up better than it does under character training.</p>}
      </div>
      <PaperFigure file={matrix} width={1430} height={1221} alt={`${matrix === 'trained' ? 'Character training' : 'Prompting'} matrix: 11 evaluation traits by 11 intervention traits, showing Elo gain over the base model.`} caption="Rows are the traits being evaluated. Columns are the traits the model was trained or prompted for. Red means a higher score than the base model and blue means lower. The ± values are bootstrap standard deviations." />
      <details className="story-details"><summary>How to read these results</summary><p>A higher score means the model shows more of the trait being evaluated. That includes traits like sarcasm and misalignment, so higher isn’t always better, and none of this is a safety rating. Each row is its own EigenBench evaluation, measured relative to the base model. The figures are taken from the paper and don’t update with new ValueArena runs.</p></details>
    </section>

    <section className="story-section" id="training-and-prompts">
      <div className="story-copy"><p className="story-kicker">03 / How well do traits stick?</p>
        <h2>Prompts override some traits more easily than others.</h2>
        <p>What happens if you prompt a character-trained model with a different constitution? We trained three characters, tried three prompts on each, and split the variation in scores between training and prompting. For loving, training accounts for almost all of it. For misalignment, the prompt matters more.</p>
      </div>
      <figure className="story-variance">
        <div className="story-variance-head"><span>Share attributed to</span><span><i className="variance-character" />Character training</span><span><i className="variance-prompt" />Prompting</span></div>
        {variance.map(row => <div className="story-variance-row" key={row.name}>
          <span><ValueLabel id={row.name} size={22}>{row.name}</ValueLabel></span>
          <div className="story-variance-track" role="img" aria-label={`${row.name}: character training ${row.character} percent, prompting ${row.prompt} percent of the reported variance split.`}>
            <span className="variance-character" style={{ width: `${row.character}%` }} title={`Character training: ${row.character}%`}>{row.character}%</span>
            <span className="variance-prompt" style={{ width: `${row.prompt}%` }} title={`Prompting: ${row.prompt}%`}>{row.prompt >= 10 ? `${row.prompt}%` : ''}</span>
          </div><span className="story-variance-prompt-value">{row.prompt}% prompt</span>
        </div>)}
        <figcaption>Variance split from the paper’s two-way ANOVA. The percentages describe how scores varied in this experiment. They are not the share of a trait that survives the prompt.</figcaption>
      </figure>
      <details className="story-details"><summary>Show the full training vs. prompting results</summary>
        <PaperFigure file="train-prompt" width={2200} height={642} alt="Train-versus-prompt matrix for loving, misalignment, and sarcasm, with a base-model comparison." caption="Each group is one trained character, and the columns inside it are the prompts. Values are Elo gain over the base model, ± bootstrap standard deviation." />
      </details>
    </section>

    <section className="story-section" id="through-training">
      <div className="story-copy"><p className="story-kicker">04 / During training</p>
        <h2>The final model doesn’t tell the whole story.</h2>
        <p>Open Character Training has two stages: preference training (DPO) first, then training on the model’s own reflections and conversations. Scoring checkpoints from both stages shows the target trait and its side effects changing together.</p>
      </div>
      <div className="story-training-path" aria-label="Open Character Training stages"><span>Base model</span><span aria-hidden>→</span><span>DPO</span><span aria-hidden>→</span><span>Introspection</span><span aria-hidden>→</span><span>Final character</span></div>
      <PaperFigure file="checkpoints" width={1981} height={1857} alt="Loving-training checkpoints evaluated across 11 constitutions. Loving gains accompany changes in other traits, including lower goodness scores." caption="Training for loving. Columns are DPO and introspection checkpoints, plus the released OCT model for comparison. Values are Elo gain over the base model, ± bootstrap standard deviation." />
    </section>

    <section className="story-closing" id="keep-exploring">
      <div><p className="story-kicker">Keep exploring</p><h2>Dig into the results</h2><p>Browse the full rankings, compare traits, or read how a single response was judged.</p>
        <div className="research-links"><a className="research-primary" href="/explore/">Explore results</a><a href="/experiments/">Browse all runs</a><a href="/compare/">Compare models</a></div>
      </div>
      <details className="story-details"><summary>Scope and sources</summary>
        <p>The results here come from <cite>Side Effects of Character Training: Quantifying Cross-Constitution Drift in LLMs</cite>, which used Qwen2.5-7B-Instruct and the AIRiskDilemmas scenarios. Other model families or scenario sets might behave differently. Rankings also depend on which models do the judging, and the paper notes that judges get less reliable on adversarial traits.</p>
        <p>Figures and numbers are from the version of the paper dated September 22, 2026. <a href={`${root}/sources.json`}>Where each figure comes from</a> · <a href="https://huggingface.co/datasets/invi-bhagyesh/ValueArena">Published evaluation data</a></p>
      </details>
    </section>
  </>;
}
