import { ModelBrowser } from '@/components/ModelBrowser';
import { pageMetadata } from '@/lib/metadata';
export const metadata = pageMetadata('Leaderboards | ValueArena', 'Compare model behavior across constitutions using published EigenBench scores.', '/leaderboard/');
export default function LeaderboardPage() { return <ModelBrowser />; }
