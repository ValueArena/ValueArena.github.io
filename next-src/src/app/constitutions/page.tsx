import { ConstitutionDirectory } from '@/components/ConstitutionDirectory';
import { pageMetadata } from '@/lib/metadata';

export const metadata = pageMetadata('All values | ValueArena', 'Explore model performance across values and the constitutions used to evaluate them.', '/constitutions/');

export default function ConstitutionsPage() {
  return <ConstitutionDirectory />;
}
