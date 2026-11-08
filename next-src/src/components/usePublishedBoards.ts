'use client';

import { useEffect, useState } from 'react';
import { fetchIndex, fetchSummary } from '@/lib/hf';
import { publishedBoards, rankedRows } from '@/lib/arena-data';
import type { ValueBoard } from '@/lib/arena-data';
import type { IndexRun, SummaryRow } from '@/lib/types';

export function usePublishedBoards(preferredRun: string | null = '') {
  const [runs, setRuns] = useState<IndexRun[]>([]);
  const [boards, setBoards] = useState<ValueBoard[]>([]);
  const [scores, setScores] = useState<Record<string, SummaryRow[]>>({});
  const [failures, setFailures] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (preferredRun === null) return;
    let active = true;
    setLoading(true); setError(''); setFailures({});
    fetchIndex().then(async index => {
      if (!active) return;
      const chosen = publishedBoards(index.runs, preferredRun);
      setRuns(index.runs); setBoards(chosen); setLoading(false);
      const queue = [...chosen].sort((a, b) => Number(b.run.slug === preferredRun) - Number(a.run.slug === preferredRun)
        || Number(b.run.group === 'frontier-direct-ratings-200') - Number(a.run.group === 'frontier-direct-ratings-200'));
      let cursor = 0;
      // Only one summary per value, with three concurrent requests. Render each as it arrives.
      await Promise.all(Array.from({ length: 3 }, async () => {
        while (active && cursor < queue.length) {
          const board = queue[cursor++];
          try {
            const rows = rankedRows(await fetchSummary(board.run.slug));
            if (active) setScores(current => ({ ...current, [board.run.slug]: rows }));
          } catch {
            if (active) setFailures(current => ({ ...current, [board.run.slug]: true }));
          }
        }
      }));
    }).catch(() => { if (active) { setError('Published evaluations could not be loaded.'); setLoading(false); } });
    return () => { active = false; };
  }, [preferredRun, revision]);
  return { runs, boards, scores, failures, error, loading, retry: () => setRevision(n => n + 1) };
}
