// HF dataset fetcher mirroring the behavior of the original hf-fetch.js:
// - in-memory cache (lives for the page session)
// - sessionStorage cache with per-path TTLs
// - identical URL shape (HF dataset resolve/main paths)

import { HF_BASE } from './config';
import type { IndexJson, MetaJson, Summary } from './types';

const memCache: Record<string, unknown> = {};

const SS_TTL_MS: Record<string, number> = {
  'index.json': 60 * 1000, // 1 minute — picks up new runs quickly
};
const SS_TTL_DEFAULT = 10 * 60 * 1000; // 10 minutes for everything else

function ssKey(path: string): string {
  return `va:${path}`;
}

function ssGet<T>(path: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(ssKey(path));
    if (!raw) return null;
    const { t, data } = JSON.parse(raw) as { t: number; data: T };
    const ttl = SS_TTL_MS[path] ?? SS_TTL_DEFAULT;
    if (Date.now() - t > ttl) {
      sessionStorage.removeItem(ssKey(path));
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function ssSet(path: string, data: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(ssKey(path), JSON.stringify({ t: Date.now(), data }));
  } catch {
    // quota exceeded — drop half of the va: entries oldest-first
    const keys = Object.keys(sessionStorage).filter((k) => k.startsWith('va:'));
    keys.slice(0, Math.ceil(keys.length / 2)).forEach((k) => sessionStorage.removeItem(k));
  }
}

export async function hfFetch<T = unknown>(path: string): Promise<T> {
  if (path in memCache) return memCache[path] as T;
  const cached = ssGet<T>(path);
  if (cached !== null) {
    memCache[path] = cached;
    return cached;
  }
  const url = `${HF_BASE}/${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const data = (await res.json()) as T;
  memCache[path] = data;
  ssSet(path, data);
  return data;
}

export function hfImageURL(path: string): string {
  return `${HF_BASE}/${path}`;
}

export function fetchIndex(): Promise<IndexJson> {
  return hfFetch<IndexJson>('index.json');
}

export function fetchSummary(slug: string): Promise<Summary> {
  return hfFetch<Summary>(`runs/${slug}/summary.json`);
}

export function fetchMeta(slug: string): Promise<MetaJson> {
  return hfFetch<MetaJson>(`runs/${slug}/meta.json`);
}

export function clearHFCache(): void {
  for (const k of Object.keys(memCache)) delete memCache[k];
  if (typeof window === 'undefined') return;
  Object.keys(sessionStorage)
    .filter((k) => k.startsWith('va:'))
    .forEach((k) => sessionStorage.removeItem(k));
}
