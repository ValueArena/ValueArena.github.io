import { pageMetadata } from '@/lib/metadata';

import { IctResults } from '@/components/IctResults';

export default function IctResultsPage() {
  return <div className="research-home story-home ict-page">
    <section className="research-intro" aria-labelledby="ict-title">
      <h1 id="ict-title">Inverse character training</h1>
      <p className="research-deck">Ongoing experiment. Character training turns a written constitution into a model’s behaviour; here we attempt the reverse, recovering the constitution from behaviour alone. This page reports the current runs.</p>
      <div className="research-links"><a className="research-primary" href="#results">See the results ↓</a><a href="#question">Setup ↓</a></div>
    </section>
    <IctResults />
  </div>;
}

export const metadata = pageMetadata('Inverse Character Training — ValueArena', 'LAISR Lab work in progress: recovering the constitution a model was trained on from its behaviour alone.', '/ict/results/');
