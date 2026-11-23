'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import type { PanelData } from './data';
import { routeFromHash, routeHash, type Route, type Tab } from './route';
import { Sampling } from './Sampling';
import { ScenarioBrowser } from './ScenarioBrowser';
import { Relationships } from './Relationships';
import { CriteriaIndex } from './CriteriaIndex';

interface Nav { route: Route; go: (route: Route, replace?: boolean) => void; data: PanelData }
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
  const { go } = useNav();
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    go(to, replace);
  };
  return <a href={routeHash(to)} onClick={onClick} className={className} title={title} {...rest}>{children}</a>;
}

const TABS: { tab: Tab; label: string }[] = [
  { tab: 'sampling', label: 'Sampling' },
  { tab: 'criteria', label: 'Criteria' },
  { tab: 'scenarios', label: 'Scenarios' },
];

export function PanelExplorer() {
  const [data, setData] = useState<PanelData | null>(null);
  const [error, setError] = useState('');
  const [route, setRoute] = useState<Route>({ tab: 'sampling' });

  useEffect(() => {
    let active = true;
    fetch('/panel/panel.json').then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then(json => { if (active) setData(json); })
      .catch(() => { if (active) setError('The panel data could not be loaded.'); });
    return () => { active = false; };
  }, []);

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

  const nav = useMemo(() => data ? { route, go, data } : null, [route, go, data]);
  const section = route.tab === 'relationships' ? 'scenarios' : route.tab;

  return <section className="panel-page">
    <header className="panel-head">
      <div>
        <p className="panel-kicker">{data ? `${data.models.length} models · ${data.constitutions.length} constitutions · ${data.bank.length} scenarios` : 'EigenBench panel'}</p>
        <h1>{data?.title ?? 'Nov 22 panel'}</h1>
      </div>
      {nav && <NavContext.Provider value={nav}><nav className="panel-tabs" aria-label="Panel views">
        {TABS.map(t => <RouteLink key={t.tab} to={t.tab === 'scenarios' ? { tab: 'relationships' } : { tab: t.tab, constitution: route.constitution }}
          aria-current={section === t.tab ? 'page' : undefined}>{t.label}</RouteLink>)}
      </nav></NavContext.Provider>}
    </header>
    {error ? <p className="results-status" role="alert">{error}</p>
      : !nav ? <p className="results-status" role="status">Loading the panel…</p>
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
