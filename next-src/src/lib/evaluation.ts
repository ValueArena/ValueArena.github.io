import { createClient } from '@supabase/supabase-js';
export const evaluationAPI = (process.env.NEXT_PUBLIC_EVALUATION_API_URL || '').replace(/\/$/, '');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
let client: ReturnType<typeof createClient> | null = null;
export function evaluationAuth() {
  if (!client && url && key) client = createClient(url, key);
  return client;
}
export async function evaluationRequest(path: string, options: RequestInit = {}, publicOK = false) {
  const session = (await evaluationAuth()?.auth.getSession())?.data.session;
  if (!session && !publicOK) throw new Error('Please log in to continue.');
  const response = await fetch(evaluationAPI + path, { ...options, cache: 'no-store', headers: {
    'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}), ...options.headers,
  } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = typeof body.detail === 'string' ? body.detail : Array.isArray(body.detail) ? body.detail.slice(0, 3).map((e: { loc?: string[]; msg?: string }) => `${e.loc?.join('.')}: ${e.msg}`).join('; ') : `Request failed (${response.status}).`;
    throw new Error(detail);
  }
  return response;
}
export type EvaluationJob = {
  publication?: {state: string; slug?: string; url?: string; error?: string} | null;
  progress?: {title:string;detail:string;step:number;checked_at:number;elapsed_seconds:number;worker_last_seen_at:number|null;gpu_allocated:boolean;cleanup_pending:boolean};
  id: string; name: string; state: string; stage: string; engine: string; has_artifacts: boolean;
  error_code: string | null; visibility: 'private' | 'public'; constitution: string;
  models_count: number; scenario_count: number; created_at: number; funding: string;
};
