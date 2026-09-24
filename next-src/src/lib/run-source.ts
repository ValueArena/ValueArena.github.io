import { evaluationAuth, evaluationRequest } from './evaluation';

type Manifest = { files: Record<string, string>; expires_in: number };
const manifests = new Map<string, { user: string; until: number; data: Manifest }>();
const pending = new Map<string, Promise<Manifest>>();
const signedSources = new Map<string, string>();

export function privateRun(path: string): { id: string; file: string } | null {
  const m = /^runs\/account\/([a-f0-9-]{36})\/(.+)$/.exec(path);
  return m ? { id: m[1], file: m[2] } : null;
}

export async function preparePrivateRun(id: string): Promise<Manifest> {
  const session = (await evaluationAuth()?.auth.getSession())?.data.session;
  if (!session) throw new Error('Log in to view your evaluation results.');
  const user = session.user.id, key = `${user}/${id}`;
  const saved = manifests.get(id);
  if (saved?.user === user && saved.until > Date.now()) return saved.data;
  if (pending.has(key)) return pending.get(key)!;
  const task = evaluationRequest(`/results/${id}/viewer`).then(r => r.json()).then((data: Manifest) => {
    manifests.set(id, { user, until: Date.now() + Math.max(0, data.expires_in - 60) * 1000, data });
    for (const [file, url] of Object.entries(data.files)) signedSources.set(url, `runs/account/${id}/${file}`);
    return data;
  }).finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}

export function privateAssetURL(path: string): string | null {
  const match = privateRun(path);
  if (!match) return null;
  return manifests.get(match.id)?.data.files[match.file] || '';
}

export async function fetchRunAsset(url: string, init?: RequestInit): Promise<Response> {
  const path = signedSources.get(url);
  if (!path) return fetch(url, init);
  const match = privateRun(path)!;
  const manifest = await preparePrivateRun(match.id);
  const nextURL = manifest.files[match.file];
  if (!nextURL) throw new Error('Result file not found.');
  return fetch(nextURL, init);
}

export async function fetchPrivateJSON<T>(path: string): Promise<T> {
  const match = privateRun(path)!;
  const data = await preparePrivateRun(match.id);
  const url = data.files[match.file];
  if (!url) throw new Error('Result file not found.');
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not load result file.');
  return response.json();
}
