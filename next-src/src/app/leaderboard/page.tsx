import { pageMetadata } from '@/lib/metadata';
import { Leaderboard } from '@/components/Leaderboard';
import { LeaderboardHub } from '@/components/hub/LeaderboardHub';
import '../hub.css';


export default function LeaderboardPage() {
  return (
    <div className="research-index">
      <header className="research-page-head"><h1>Leaderboard</h1><p>How models rank on each constitution, how values change over time, and how EigenBench compares with other measures.</p><a className="home-panel-link" href="/explore/">Interactive rankings & tradeoffs →</a></header>
      <LeaderboardHub />
      <section className="hub-all-runs" aria-labelledby="all-runs-title">
        <h2 id="all-runs-title">All runs</h2>
        <p>Every constitution and run, with plot, ranking and Pareto views.</p>
        <Leaderboard />
      </section>
    </div>
  );
}

export const metadata = pageMetadata("Leaderboard — ValueArena", "Model rankings for every EigenBench constitution, value trends over time, and comparisons with other measures.", "/leaderboard/");
