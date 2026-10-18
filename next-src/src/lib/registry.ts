// The model registry and published baselines bundled with the site (built by a script from
// OpenRouter's model list and Arena's CC-BY leaderboard dataset).

import registryData from './data/model-registry.json';
import arenaData from './data/baseline-arena-text.json';
import factualityData from './data/baseline-arena-factuality.json';
import eqbenchData from './data/baseline-eqbench4.json';
import spiralData from './data/baseline-spiral-bench.json';
import type { Baseline, ModelInfo } from './hub';

const REGISTRY = (registryData as { models: Record<string, ModelInfo> }).models;
export const ARENA_TEXT = arenaData as Baseline;
// Published benchmarks set beside EigenBench, value-related first; Arena text is general preference, for contrast.
export const BASELINES: Baseline[] = [spiralData, factualityData, eqbenchData, ARENA_TEXT] as Baseline[];

/** What the registry knows about a model nickname, if it is a released model. */
export function modelInfo(nick: string): ModelInfo | null {
  return REGISTRY[nick] ?? null;
}

// Baselines we plan to collect on our own panels; shown so the table's shape is settled now.
export const PLANNED_BASELINES = [
  { id: 'alignment', name: 'Alignment Index', what: "Arena's agent-behaviour index: unauthorized action, false attribution and deceptive completion." },
  { id: 'mask', name: 'MASK honesty', what: 'Whether a model states what it believes when pressured to lie (Scale AI).' },
];

// One panel of current frontier models judged on several constitutions with the same judges,
// so its boards are comparable with each other.
export const FEATURED_GROUP = 'frontier-direct-ratings-200';

// Runs the hub reads beyond its featured boards.
export const TREND_RUN = '37_model_run';
export const REASONING_GROUP = 'reasoning-vs-instant';
export const REASONING_KINDNESS = 'reasoning-vs-instant/airisk-kindness-200';
