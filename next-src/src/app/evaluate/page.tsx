import { pageMetadata } from '@/lib/metadata';
import { EvaluationRunner } from '@/components/EvaluationRunner';

export const metadata = pageMetadata('Run an Evaluation — ValueArena', 'Configure an EigenBench evaluation with your models, constitution, and scenarios.', '/evaluate/');

export default function EvaluatePage() {
  return <div className="research-index evaluation-page">
    <header className="research-page-head"><p className="eval-kicker">EigenBench workspace</p><h1>Run an evaluation</h1><p>Evaluate a model panel against a constitution, then explore its responses and judgments.</p></header>
    <EvaluationRunner />
  </div>;
}
