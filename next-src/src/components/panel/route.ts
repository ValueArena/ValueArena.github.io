// The panel's whole view state lives in the URL hash, so every view is a shareable link.
//
//   #sampling?constitution=islam&judges=second&view=pairs&answerer=3&column=10&trace=2&read=4
//   #scenarios/A013?q=dad&constitution=marxism&criterion=3&reuse=5%2B&breadth=6-10&sort=reuse
//   #scenarios/relationships[/block/<a>/<b> | /pair/<a>/<n>/<b>/<m> | /criterion/<a>/<n>]
//   #criteria?constitution=islam&scope=bank&bank=care_ethics&criterion=3
// Default values are left out.

export type Tab = 'sampling' | 'scenarios' | 'relationships' | 'criteria';

export interface Route {
  tab: Tab;
  constitution?: string;
  // Sampling
  judges?: 'second';
  view?: 'pairs';
  answerer?: number;
  column?: number;
  trace?: number;
  /** Judge whose judgment is open in the reader. */
  read?: number;
  // Scenarios
  scenario?: string;
  q?: string;
  criterion?: number;
  reuse?: string;
  breadth?: string;
  sort?: string;
  // Relationships: "block/a/b", "pair/a/n/b/m", "criterion/a/n"
  relationship?: string;
  // Criteria
  scope?: 'bank';
  bank?: string;
}

const FIELDS: Record<Tab, (keyof Route)[]> = {
  sampling: ['constitution', 'judges', 'view', 'answerer', 'column', 'trace', 'read'],
  scenarios: ['q', 'constitution', 'criterion', 'reuse', 'breadth', 'sort'],
  relationships: [],
  criteria: ['constitution', 'scope', 'bank', 'criterion'],
};
const NUMBERS = new Set<keyof Route>(['answerer', 'column', 'trace', 'read', 'criterion']);
const PATHS: Record<Tab, string> = {
  sampling: 'sampling', scenarios: 'scenarios', relationships: 'scenarios/relationships', criteria: 'criteria',
};

export function routeHash(route: Route): string {
  let path = PATHS[route.tab];
  if (route.tab === 'scenarios' && route.scenario) path += '/' + encodeURIComponent(route.scenario);
  if (route.tab === 'relationships' && route.relationship) {
    path += '/' + route.relationship.split('/').map(encodeURIComponent).join('/');
  }
  const params = new URLSearchParams();
  for (const key of FIELDS[route.tab]) {
    const value = route[key];
    if (value === undefined || value === null || value === '') continue;
    if (key === 'answerer' && value === 0) continue;
    if (key === 'column' && value === 0) continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return '#' + path + (query ? '?' + query : '');
}

export function routeFromHash(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  const cut = raw.indexOf('?');
  const path = cut < 0 ? raw : raw.slice(0, cut);
  const params = new URLSearchParams(cut < 0 ? '' : raw.slice(cut + 1));
  let tab: Tab = 'sampling';
  let tail = '';
  if (path === 'scenarios/relationships' || path.startsWith('scenarios/relationships/')) {
    tab = 'relationships';
    tail = path.slice('scenarios/relationships/'.length);
  } else if (path === 'scenarios' || path.startsWith('scenarios/')) {
    tab = 'scenarios';
    tail = path.slice('scenarios/'.length);
  } else if (path.startsWith('criteria')) tab = 'criteria';
  const route: Route = { tab };
  const fields = route as unknown as Record<string, unknown>;
  for (const key of FIELDS[tab]) {
    const value = params.get(key);
    if (value === null) continue;
    if (NUMBERS.has(key)) {
      const n = Number(value);
      if (Number.isInteger(n) && n >= 0) fields[key] = n;
    } else fields[key] = value;
  }
  try {
    if (tail && tab === 'scenarios') route.scenario = decodeURIComponent(tail);
    if (tail && tab === 'relationships') route.relationship = tail.split('/').map(decodeURIComponent).join('/');
  } catch { /* Ignore malformed path segments. */ }
  return route;
}
