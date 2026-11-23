import { PanelExplorer } from '@/components/panel/PanelExplorer';
import { pageMetadata } from '@/lib/metadata';

export const metadata = pageMetadata('Nov 22 panel | ValueArena',
  'How nine models were judged across twelve constitutions: judge assignments, criteria, scenarios and how criteria relate.', '/panel/');

export default function PanelPage() {
  return <PanelExplorer />;
}
