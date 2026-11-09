import { pageMetadata } from '@/lib/metadata';
import { ModelComparison } from '@/components/ModelComparison';


export default function ComparePage() {
  return <ModelComparison />;
}

export const metadata = pageMetadata('Compare models | ValueArena', 'Compare model scores, uncertainty, and responses across written sets of values.', '/compare/');
