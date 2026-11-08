import { ModelBrowser } from '@/components/ModelBrowser';
import { pageMetadata } from '@/lib/metadata';

export const metadata = pageMetadata('Model results | ValueArena', 'A model’s scores, ranks, and responses across values.', '/model/');
export default function ModelPage() { return <ModelBrowser />; }
