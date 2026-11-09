'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ThemeToggle } from './ThemeToggle';
import { SiteFooter } from './SiteFooter';

export const eigenBenchURL = process.env.NEXT_PUBLIC_EIGENBENCH_URL || '/eigenbench/';
const arenaURL = process.env.NEXT_PUBLIC_VALUEARENA_URL || 'https://valuearena.github.io/';

export function ArenaShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const header = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const outside = (event: PointerEvent) => { if (!header.current?.contains(event.target as Node)) setMenuOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenuOpen(false); toggle.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [menuOpen]);
  const separateTool = process.env.NEXT_PUBLIC_SITE_MODE === 'eigenbench';
  const tool = separateTool || pathname.startsWith('/eigenbench');
  return <div className="arena-shell">
    <header className="arena-nav" ref={header}>
      <div className="arena-brand-group va-glass-pill"><a className="arena-lab" href="/lab/" aria-label="LAISR Lab"><img src="/assets/art/laisr-pixel-mark.webp" width="34" height="34" alt="" /><span>LAISR Lab</span></a><span className="va-brand-divider" aria-hidden="true" /><a href={tool ? '/eigenbench/' : '/'} className="arena-brand" aria-label={tool ? 'EigenBench home' : 'ValueArena home'}>{tool ? 'EigenBench' : 'ValueArena'}</a></div>
      <button ref={toggle} className="arena-menu-toggle va-glass-pill" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="arena-main-nav" onClick={() => setMenuOpen(!menuOpen)}><svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d={menuOpen ? 'M4 4l10 10M14 4L4 14' : 'M3 5h12M3 9h12M3 13h12'} stroke="currentColor" strokeWidth="1.5" /></svg></button>
      <nav id="arena-main-nav" className="va-glass-pill" aria-label="Main navigation" data-open={menuOpen} onClick={() => setMenuOpen(false)}>
        {separateTool ? <><a href="/evaluate/">Run an evaluation</a><a href="/evaluation/">Your evaluations</a><a href="https://github.com/jchang153/EigenBench">Documentation</a></> : <><a href="/constitutions/" aria-current={pathname.startsWith('/constitution') ? 'page' : undefined}>Values</a><a href="/leaderboard/" aria-current={/^\/(leaderboard|model)\/?$/.test(pathname) ? 'page' : undefined}>Leaderboard</a><a href="/compare/" aria-current={pathname.startsWith('/compare') ? 'page' : undefined}>Compare</a><a href="/methodology/" aria-current={pathname.startsWith('/methodology') ? 'page' : undefined}>Methodology</a></>}
        <a className="arena-mobile-tool" href={tool ? (separateTool ? arenaURL : '/') : eigenBenchURL}>{tool ? 'Browse ValueArena' : 'Run with EigenBench'}</a>
      </nav>
      <a className="arena-tool-link va-glass-pill" href={tool ? (separateTool ? arenaURL : '/') : eigenBenchURL}>{tool ? 'Browse ValueArena' : 'Run with EigenBench'}</a>
      <ThemeToggle />
    </header>
    <div className="arena-page"><main id="main-content" className="arena-content">{children}</main></div>
    {pathname === '/' && !separateTool && <footer className="home-footer"><div className="home-footer-inner">
      <a className="home-footer-brand" href="/">ValueArena</a>
      <nav aria-label="Footer"><a href="/constitutions/">Values</a><a href="/leaderboard/">Leaderboard</a><a href="/compare/">Compare</a><a href="/methodology/">Methodology</a></nav>
      <nav className="home-footer-resources" aria-label="Lab and open source"><a href="/lab/">LAISR Lab</a><a href="https://huggingface.co/datasets/invi-bhagyesh/ValueArena">Hugging Face</a><a href="https://github.com/ValueArena/ValueArena.github.io">GitHub</a></nav>
      <a className="home-footer-art-link" href="/lab/" aria-label="LAISR Lab"><img className="home-footer-art" src="/assets/art/laisr-pixel-mark.webp" width="72" height="72" alt="" loading="lazy" /></a>
    </div></footer>}
    {/^\/lab\/?$/.test(pathname) && <SiteFooter evaluationURL={eigenBenchURL} />}
  </div>;
}
