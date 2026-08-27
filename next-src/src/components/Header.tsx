'use client';

import { useEffect, useState } from 'react';

export function Header() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const saved =
      (typeof window !== 'undefined' &&
        (localStorage.getItem('va-theme') as 'dark' | 'light' | null)) ||
      'dark';
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

  return (
    <header className="va-header">
      <a href="/" className="va-brand">
        <h1>
          <span>Value</span>Arena
        </h1>
      </a>
      <nav className="va-nav">
        <a href="/leaderboard/">Leaderboard</a>
        <a href="/experiments/">Experiments</a>
        <a href="/methodology/">Methodology</a>
        <a
          href="https://github.com/ValueArena/ValueArena.github.io"
          target="_blank"
          rel="noopener"
        >
          Source
        </a>
        <a
          href="https://huggingface.co/datasets/invi-bhagyesh/ValueArena"
          target="_blank"
          rel="noopener"
        >
          HF Dataset
        </a>
        <button
          type="button"
          onClick={toggle}
          className="va-theme-toggle"
          title="Toggle theme"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? '☾' : '☀'}
        </button>
      </nav>
    </header>
  );
}
