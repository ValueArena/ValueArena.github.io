import { pageMetadata } from '@/lib/metadata';

export const metadata = pageMetadata('EigenBench | Run an evaluation', 'Run evaluations with your own models, scenarios and constitutions.', '/eigenbench/');

export default function EigenBenchPage() {
  return (
    <div className="eigenbench-page">
      <header className="eigenbench-intro">
        <div>
          <h1>Your models.<br />Your questions.</h1>
          <p>EigenBench runs behavioral evaluations against written constitutions. Configure your model panel, supply scenarios, and inspect every response and judgment.</p>
          <div className="eigenbench-actions">
            <a className="eigenbench-primary" href="/evaluate/">Open workspace</a>
            <a className="eigenbench-secondary" href="/evaluation/">Your evaluations</a>
          </div>
        </div>
        <img className="eigenbench-art" src="/assets/art/model-conversation.webp" width="256" height="256" alt="" />
      </header>

      <section className="eigenbench-workflow" aria-labelledby="eigenbench-workflow-title">
        <div className="eigenbench-section-copy">
          <h2 id="eigenbench-workflow-title">From questions to evidence.</h2>
          <p>ValueArena is the public results destination. EigenBench is the tool for producing and inspecting evaluations.</p>
          <div className="eigenbench-resources">
            <a href="https://github.com/jchang153/EigenBench">GitHub</a>
            <a href="/methodology/">Methodology</a>
          </div>
        </div>
        <ol className="eigenbench-steps">
          <li>
            <h3>Define your evaluation</h3>
            <p>Choose models, scenarios and a constitution.</p>
          </li>
          <li>
            <h3>Collect and judge</h3>
            <p>Generate responses and evaluate them against explicit criteria.</p>
          </li>
          <li>
            <h3>Inspect and share</h3>
            <p>Review coverage, scores and transcripts before publishing results.</p>
          </li>
        </ol>
      </section>
    </div>
  );
}
