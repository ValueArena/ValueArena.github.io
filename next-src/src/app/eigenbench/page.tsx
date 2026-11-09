import { pageMetadata } from '@/lib/metadata';
import { ModelMatch } from '@/components/ModelMatch';

export const metadata = pageMetadata('EigenBench | Find your model match', 'Choose between anonymous model responses and discover which model matches your choices. Explore real, saved EigenBench evaluations.', '/eigenbench/');

export default function EigenBenchPage() {
  return (
    <div className="eigenbench-page">
      <ModelMatch />

      <section className="eigenbench-workflow" aria-labelledby="eigenbench-workflow-title">
        <div className="eigenbench-section-copy">
          <h2 id="eigenbench-workflow-title">Go further with EigenBench.</h2>
          <p>Explore the saved evaluations behind your match, or run your own with different models, scenarios, and values.</p>
          <div className="eigenbench-resources">
            <a href="/evaluate/">Create an evaluation</a>
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
