import { pageMetadata } from '@/lib/metadata';
import { ModelMatch } from '@/components/ModelMatch';

export const metadata = pageMetadata('EigenBench | Find your model match', 'Choose between anonymous model responses and discover which model matches your choices. Explore real, saved EigenBench evaluations.', '/eigenbench/');

export default function EigenBenchPage() {
  return (
    <div className="eigenbench-page">
      <ModelMatch />

      <section className="eigenbench-workflow" aria-labelledby="eigenbench-workflow-title">
        <div className="eigenbench-section-copy">
          <h2 id="eigenbench-workflow-title">A few choices. A model match.</h2>
          <p>Ten saved scenarios. Five models. Choose the responses that feel closer to you and see your ranking take shape. No signup or API key needed.</p>
          <div className="eigenbench-resources">
            <a href="/evaluate/">Create an evaluation</a>
            <a href="https://github.com/jchang153/EigenBench">GitHub</a>
            <a href="/methodology/">Methodology</a>
          </div>
        </div>
        <ol className="eigenbench-steps">
          <li>
            <h3>Read a scenario</h3>
            <p>Two real model responses, with names hidden until you choose.</p>
          </li>
          <li>
            <h3>Pick what feels like you</h3>
            <p>Choose A, B, or neither. Scroll inside each response to read it in full.</p>
          </li>
          <li>
            <h3>Watch your match change</h3>
            <p>See the models move after each choice, then explore the evaluations behind your result.</p>
          </li>
        </ol>
      </section>
    </div>
  );
}
