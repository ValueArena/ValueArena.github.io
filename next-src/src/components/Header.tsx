'use client';

import { useEffect, useState, useRef } from 'react';
import { evaluationAuth, evaluationRequest } from '@/lib/evaluation';
import { usePathname } from 'next/navigation';

export function Header() {
  const [theme, setTheme] = useState<'dark' | 'light'>('light');

  const [menuOpen,setMenuOpen] = useState(false);
  const [admin,setAdmin] = useState(false);
  const header = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);


  const [loggedIn, setLoggedIn] = useState(false);
  useEffect(() => {
    const auth = evaluationAuth(); if (!auth) return;
    void auth.auth.getSession().then(({ data }) => setLoggedIn(!!data.session));
    const { data } = auth.auth.onAuthStateChange((_event, session) => setLoggedIn(!!session));
    return () => data.subscription.unsubscribe();
  }, []);
  const pathname = usePathname();
  useEffect(()=>{setMenuOpen(false);},[pathname]);
  useEffect(()=>{let live=true;setAdmin(false);if(loggedIn)void evaluationRequest('/account').then(r=>r.json()).then(a=>{if(live)setAdmin(a.role==='admin');}).catch(()=>{});return()=>{live=false;};},[loggedIn]);
  useEffect(()=>{
    if(!menuOpen)return;
    const close=(e:PointerEvent)=>{if(!header.current?.contains(e.target as Node))setMenuOpen(false);};
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setMenuOpen(false);menuButton.current?.focus();}};
    document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape);};
  },[menuOpen]);
  useEffect(() => {
    let saved: 'dark' | 'light' = 'light';
    try {
      if (localStorage.getItem('va-theme') === 'dark') saved = 'dark';
    } catch { /* Storage can be unavailable in private browsers. */ }
    setTheme(saved);
    document.documentElement.dataset.theme = saved;
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('va-theme', next);
    } catch {
      // ignore
    }
  };

  // Liquid nav highlight: one soft pill that glides to the hovered item with a
  // springy overshoot and a brief squash, then flows back to the current page.
  const nav = useRef<HTMLElement>(null);
  const [blob, setBlob] = useState({ x: 0, y: 0, w: 0, h: 0, on: false, instant: true });
  const [moving, setMoving] = useState(false);
  const moveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const snapTo = (a: HTMLElement | null | undefined, instant = false) => {
    if (!a) { setBlob(b => ({ ...b, on: false })); return; }
    setBlob(b => ({ x: a.offsetLeft, y: a.offsetTop, w: a.offsetWidth, h: a.offsetHeight, on: true, instant: instant || !b.on }));
    if (instant) return;
    setMoving(true); clearTimeout(moveTimer.current);
    moveTimer.current = setTimeout(() => setMoving(false), 240);
  };
  const toCurrent = (instant = false) => snapTo(nav.current?.querySelector<HTMLElement>('a[aria-current="page"]'), instant);
  useEffect(() => {
    toCurrent(true);
    void document.fonts?.ready.then(() => toCurrent(true));
    const onResize = () => toCurrent(true);
    addEventListener('resize', onResize);
    return () => { removeEventListener('resize', onResize); clearTimeout(moveTimer.current); };
    // snapTo only reads refs and setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, menuOpen]);
  // After an instant placement, let later moves animate again
  useEffect(() => { if (blob.instant) requestAnimationFrame(() => setBlob(b => ({ ...b, instant: false }))); }, [blob.instant]);

  return (
    <header className="va-header" ref={header}>
      <a href="/" className="va-brand va-glass-pill" aria-label="ValueArena home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="laisr-pixel-mark" src="/assets/art/laisr-pixel-mark.webp" width="34" height="34" alt="" />
        <span className="va-lab-name">LAISR Lab</span>
        <span className="va-brand-divider" aria-hidden="true" />
        <span className="va-wordmark">
          <span>Value</span>Arena
        </span>
      </a>
      <nav id="main-navigation" ref={nav} className={`va-nav va-glass-pill${menuOpen ? ' is-open' : ''}`} aria-label="Main navigation"
        onMouseOver={e => { const a = (e.target as Element).closest<HTMLElement>('a'); if (a) snapTo(a); }}
        onMouseLeave={() => toCurrent()}
        onFocus={e => { const a = (e.target as Element).closest<HTMLElement>('a'); if (a) snapTo(a); }}
        onBlur={() => toCurrent()}>
        <span aria-hidden="true" className={`va-nav-blob${blob.on ? ' is-on' : ''}${moving ? ' is-moving' : ''}${blob.instant ? ' is-instant' : ''}`} style={{ translate: `${blob.x}px ${blob.y}px`, width: blob.w, height: blob.h }} />
        <a href="/" aria-current={pathname === '/' ? 'page' : undefined}>Home</a>
        <a href="/research/" aria-current={pathname.startsWith('/research') ? 'page' : undefined}>Research</a>
        <a href="/leaderboard/" aria-current={pathname.startsWith('/leaderboard') ? 'page' : undefined}>Leaderboard</a>
        <a href="/explore/" aria-current={pathname.startsWith('/explore') ? 'page' : undefined}>Explore</a>
        <a href="/experiments/" aria-current={pathname.startsWith('/experiments') ? 'page' : undefined}>Experiments</a>
        {admin && <a href="/admin/" aria-current={pathname.startsWith('/admin') ? 'page' : undefined}>Admin</a>}
      </nav>
      <div className="va-header-actions">
        <a className="va-account-link va-glass-pill" href="/evaluate/" aria-current={pathname.startsWith('/evaluate') ? 'page' : undefined}>{loggedIn ? 'Evaluate' : 'Log in'}</a>
        <button
          type="button"
          onClick={toggle}
          className="va-theme-toggle va-glass-pill"
          title="Toggle theme"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? '☾' : '☀'}
        </button>
        <button ref={menuButton} className="va-menu-toggle va-glass-pill" aria-label={menuOpen?'Close navigation':'Open navigation'} aria-expanded={menuOpen} aria-controls="main-navigation" onClick={()=>setMenuOpen(!menuOpen)}><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d={menuOpen?'M5 5L15 15M15 5L5 15':'M3 5H17M3 10H17M3 15H17'} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>
      </div>
    </header>
  );
}
