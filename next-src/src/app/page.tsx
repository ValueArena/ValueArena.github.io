'use client';

// The home page leads with the thing you can do — start a battle — and shows
// what the site holds underneath it: current standings and recent runs. The
// leaderboard and the experiments table keep their own full pages; these are
// only the way in.
//
// Once a battle starts, Chat takes the viewport and the previews go with it.

import { useEffect } from 'react';
import { Chat } from '@/components/Chat';
import { ExperimentsPreview } from '@/components/ExperimentsPreview';
import { LeaderboardPreview } from '@/components/LeaderboardPreview';

/** Where the old home-page tab anchors now live. */
const MOVED: Record<string, string> = {
  '#leaderboard': '/leaderboard/',
  '#experiments': '/experiments/',
};

export default function HomePage() {
  useEffect(() => {
    const moved = MOVED[window.location.hash];
    if (moved) window.location.replace(moved);
  }, []);

  return (
    <Chat
      mainContent={
        <div className="home-panels">
          <LeaderboardPreview />
          <ExperimentsPreview />
        </div>
      }
    />
  );
}
