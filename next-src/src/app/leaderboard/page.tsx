import { Leaderboard } from '@/components/Leaderboard';

export const metadata = {
  title: 'ValueArena — Leaderboard',
  description: 'Cross-constitution Elo rankings for language models, judged via EigenBench.',
};

export default function LeaderboardPage() {
  return (
    <div className="pt-4">
      <Leaderboard />
    </div>
  );
}
