import { ArenaOverview } from '@/components/ArenaOverview';
import EigenBenchPage from './eigenbench/page';
export default function HomePage() { return process.env.NEXT_PUBLIC_SITE_MODE === 'eigenbench' ? <EigenBenchPage /> : <ArenaOverview />; }
