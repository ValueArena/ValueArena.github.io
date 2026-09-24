/** Keep accepted submissions visible while an older history request completes. */
export function mergeAcceptedRuns<T extends { id: string }>(runs: T[], accepted: Map<string, T>): T[] {
  const observed = new Set(runs.map(run => run.id));
  for (const id of observed) accepted.delete(id);
  return [...accepted.values(), ...runs];
}
