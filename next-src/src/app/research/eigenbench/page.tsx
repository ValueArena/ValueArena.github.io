import { pageMetadata } from '@/lib/metadata';
import { HomeRanking } from '@/components/HomeRanking';

export const metadata = pageMetadata('EigenBench — ValueArena', 'A way to compare language models on a written set of values, using their answers and each other’s judgments.', '/research/eigenbench/');

export default function EigenBenchPaper() {
  return <div className="research-home story-home">
    <section className="research-intro art-section-intro">
      <a className="paper-back" href="/research/">All research</a>
      <img className="section-pixel-art" src="/assets/art/model-conversation.webp" width="256" height="256" alt="" />
      <h1>EigenBench</h1>
      <p className="research-deck">A Comparative Behavioral Measure of Value Alignment</p>
      <p className="paper-authors">Jonathn Chang, Leonhard Piff, Suvadip Sana, Jasmine X. Li, and Lionel Levine</p>
      <div className="research-links"><a className="research-primary" href="https://arxiv.org/abs/2509.01938">Read the paper</a><a href="/explore/">Published results</a></div>
    </section>
    <section className="story-section">
      <div className="story-copy"><h2>Judging values by behavior</h2><p>EigenBench starts with a group of language models and a written constitution. The models answer the same scenarios, then judge one another’s answers. EigenTrust combines the judgments into scores, giving more weight to judges that the rest of the group rates highly.</p></div>
      <ol className="story-protocol" aria-label="Evaluation process">
        <li><span>01</span><strong>Constitution</strong><p>A short written description of a value sets what the judges look for.</p></li>
        <li><span>02</span><strong>Responses and judgments</strong><p>Each model answers the scenarios and grades the other models’ answers.</p></li>
        <li><span>03</span><strong>Relative scores</strong><p>The judgments are combined into scores that rank the models against each other.</p></li>
      </ol>
      <p className="story-small">The paper checks the scores against human judgments and shows the method can recover GPQA rankings without using the answer key. <a href="https://arxiv.org/abs/2509.01938">Source: EigenBench paper</a></p>
    </section>
    <section className="story-section">
      <div className="story-copy"><h2>Published evaluations</h2><p>These rankings come from runs published on ValueArena, not from the experiments in the paper.</p></div>
      <HomeRanking />
    </section>
    <section className="story-closing"><div><h2>Reading the scores</h2><p>A score only tells you how a model compares with the other models in the same run, on one constitution. It isn’t an objective ranking of values or a safety rating, and different scenarios, criteria or judges can give different results.</p><div className="research-links"><a href="/experiments/">Experiments</a><a href="/responses/">Model responses</a><a href="/research/character-training/">Character-training study</a></div></div></section>
  </div>;
}
