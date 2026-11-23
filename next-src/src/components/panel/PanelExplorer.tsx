'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import type { PanelData } from './data';
import { MODEL_NAMES } from '@/lib/model-names';
import { routeFromHash, routeHash, type Route, type Tab } from './route';
import { Sampling } from './Sampling';
import { ScenarioBrowser } from './ScenarioBrowser';
import { Relationships } from './Relationships';
import { CriteriaIndex } from './CriteriaIndex';

interface Nav { route: Route; go: (route: Route, replace?: boolean) => void; data: PanelData; href: (route: Route) => string }
const NavContext = createContext<Nav | null>(null);

export function useNav(): Nav {
  const nav = useContext(NavContext);
  if (!nav) throw new Error('useNav outside PanelExplorer');
  return nav;
}

/** A real, shareable link that navigates in place. */
export function RouteLink({ to, replace = false, className, children, title, ...rest }: {
  to: Route; replace?: boolean; className?: string; children: ReactNode; title?: string; 'aria-current'?: 'page' | undefined;
}) {
  const { go, href } = useNav();
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    go(to, replace);
  };
  return <a href={href(to)} onClick={onClick} className={className} title={title} {...rest}>{children}</a>;
}

let panelRequest: Promise<PanelData> | null = null;
function loadPanel(): Promise<PanelData> {
  panelRequest ??= fetch('/panel/panel.json').then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
    .then((data: PanelData) => ({ ...data, models: data.models.map(m => ({ ...m, name: MODEL_NAMES[m.name] ?? m.name })) }));
  panelRequest.catch(() => { panelRequest = null; });
  return panelRequest;
}

function usePanelData(enabled = true) {
  const [data, setData] = useState<PanelData | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    loadPanel().then(json => { if (active) setData(json); })
      .catch(() => { if (active) setError('The results could not be loaded.'); });
    return () => { active = false; };
  }, [enabled]);
  return { data, error };
}

const TABS: { tab: Tab; label: string }[] = [
  { tab: 'sampling', label: 'Sampling' },
  { tab: 'criteria', label: 'Criteria' },
  { tab: 'scenarios', label: 'Scenarios' },
];

export function PanelExplorer() {
  const { data, error } = usePanelData();
  const [route, setRoute] = useState<Route>({ tab: 'sampling' });

  useEffect(() => {
    const sync = () => setRoute(routeFromHash(window.location.hash));
    sync();
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener('hashchange', sync); };
  }, []);

  const go = useCallback((next: Route, replace = false) => {
    const url = `${window.location.pathname}${window.location.search}${routeHash(next)}`;
    if (replace) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
    setRoute(next);
  }, []);

  const nav = useMemo(() => data ? { route, go, data, href: routeHash } : null, [route, go, data]);
  const section = route.tab === 'relationships' ? 'scenarios' : route.tab;

  return <section className="panel-page">
    <header className="panel-head">
      <div>
        {data && <p className="panel-kicker">{data.models.length} models · {data.constitutions.length} constitutions · {data.bank.length} scenarios</p>}
        <h1>Results</h1>
      </div>
      {nav && <NavContext.Provider value={nav}><nav className="panel-tabs" aria-label="Results views">
        {TABS.map(t => <RouteLink key={t.tab} to={t.tab === 'scenarios' ? { tab: 'relationships' } : { tab: t.tab, constitution: route.constitution }}
          aria-current={section === t.tab ? 'page' : undefined}>{t.label}</RouteLink>)}
      </nav></NavContext.Provider>}
    </header>
    {error ? <p className="results-status" role="alert">{error}</p>
      : !nav ? <p className="results-status" role="status">Loading results…</p>
        : <NavContext.Provider value={nav}>
          {section === 'scenarios' && <nav className="panel-subtabs" aria-label="Scenario views">
            <RouteLink to={{ tab: 'scenarios' }} aria-current={route.tab === 'scenarios' ? 'page' : undefined}>Browse</RouteLink>
            <RouteLink to={{ tab: 'relationships' }} aria-current={route.tab === 'relationships' ? 'page' : undefined}>Relationships</RouteLink>
          </nav>}
          {route.tab === 'sampling' && <Sampling />}
          {route.tab === 'scenarios' && <ScenarioBrowser />}
          {route.tab === 'relationships' && <Relationships />}
          {route.tab === 'criteria' && <CriteriaIndex />}
        </NavContext.Provider>}
  </section>;
}

/**
 * One results view embedded in another page. Moves within the view stay on the page;
 * links to other views open the results page.
 */
export function PanelSection({ tab, title, id }: { tab: 'sampling' | 'relationships'; title: string; id: string }) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '300px' });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const { data, error } = usePanelData(visible);
  const [route, setRoute] = useState<Route>({ tab });
  const href = useCallback((to: Route) => `/results/${routeHash(to)}`, []);
  const go = useCallback((next: Route) => {
    if (next.tab === tab) setRoute(next);
    else window.location.assign(href(next));
  }, [tab, href]);
  const nav = useMemo(() => data ? { route, go, data, href } : null, [route, go, data, href]);

  return <section className="panel-embed" id={id} aria-labelledby={`${id}-heading`} ref={ref}>
    <header className="home-section-heading"><h2 id={`${id}-heading`}>{title}</h2><a className="home-text-action" href={href(route)}>Open in Results</a></header>
    {error ? <p className="results-status" role="alert">{error}</p>
      : !nav ? <p className="results-status" role="status">Loading {title.toLowerCase()}…</p>
        : <NavContext.Provider value={nav}>
          {tab === 'sampling' ? <Sampling /> : <Relationships />}
        </NavContext.Provider>}
  </section>;
}
