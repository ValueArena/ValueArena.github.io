import { PanelExplorer } from '@/components/panel/PanelExplorer';
import { pageMetadata } from '@/lib/metadata';

export const metadata = pageMetadata('Results | ValueArena',
  'How nine models were judged across twelve constitutions: judge assignments, criteria, scenarios and how criteria relate.', '/results/');

export default function ResultsPage() {
  return <PanelExplorer />;
}
