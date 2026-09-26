import type { MetadataRoute } from 'next';
import { papers } from '@/lib/papers';

export const dynamic = 'force-static';

const BASE = 'https://valuearena.github.io';
const PAGES = ['/', '/lab/', '/research/', ...papers.map(p => `/research/${p.slug}/`), '/leaderboard/', '/explore/', '/experiments/', '/compare/', '/evaluate/'];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map(path => ({ url: BASE + path, priority: path === '/' || path === '/lab/' ? 1 : .7 }));
}
