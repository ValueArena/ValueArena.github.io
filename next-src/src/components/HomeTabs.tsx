'use client';

import { useEffect, useState } from 'react';
import { Leaderboard } from './Leaderboard';
import { Experiments } from './Experiments';
import { Chat } from './Chat';

type Tab = 'chat' | 'leaderboard' | 'experiments';

const TABS: { id: Tab; label: string }[] = [
  { id: 'chat', label: 'New Chat' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'experiments', label: 'Experiments' },
];

const HASH_TO_TAB: Record<string, Tab> = {
  '#chat': 'chat',
  '#leaderboard': 'leaderboard',
  '#experiments': 'experiments',
};

function tabFromHash(): Tab {
  if (typeof window === 'undefined') return 'chat';
  return HASH_TO_TAB[window.location.hash] ?? 'chat';
}

export function HomeTabs() {
  const [tab, setTab] = useState<Tab>('chat');

  useEffect(() => {
    setTab(tabFromHash());
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Lock body scroll on the Chat tab — the setup + chat UI manage their own
  // viewport height. Leaderboard/Experiments need normal scrolling.
  useEffect(() => {
    if (tab === 'chat') {
      document.body.classList.add('va-no-scroll');
      return () => document.body.classList.remove('va-no-scroll');
    }
    return undefined;
  }, [tab]);

  const select = (next: Tab) => {
    if (typeof window !== 'undefined' && next !== tab) {
      window.history.replaceState(null, '', `#${next}`);
    }
    setTab(next);
  };

  return (
    <div className="pt-4">
      <div role="tablist" aria-label="Home sections" className="home-tabs mb-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`hometab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            aria-controls={`hometabpanel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => select(t.id)}
            className={`home-tab${tab === t.id ? ' active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {TABS.map((t) => (
        <section
          key={t.id}
          id={`hometabpanel-${t.id}`}
          role="tabpanel"
          aria-labelledby={`hometab-${t.id}`}
          hidden={tab !== t.id}
        >
          {tab === t.id ? (
            t.id === 'leaderboard' ? (
              <Leaderboard />
            ) : t.id === 'experiments' ? (
              <Experiments />
            ) : (
              <Chat />
            )
          ) : null}
        </section>
      ))}
    </div>
  );
}
