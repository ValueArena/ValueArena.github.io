'use client';

import { useEffect, useRef, useState } from 'react';

export function ComparisonPicker({ label, choices, selected, onChange, limit }: {
  label: string; choices: { id: string; label: string }[]; selected: string[]; onChange: (ids: string[]) => void; limit?: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  const shown = choices.filter(c => c.label.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="comparison-picker" ref={root}>
    <button className="results-button" ref={trigger} onClick={() => setOpen(!open)} aria-label={label} aria-expanded={open} aria-controls={`pick-${label}`}><span>{label}</span><span className="comparison-picker-count">{selected.length}</span><svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
    {open && <div className="comparison-picker-panel" id={`pick-${label}`}>
      <input ref={search} type="search" placeholder={`Find ${label.toLowerCase()}`} aria-label={`Find ${label.toLowerCase()}`} value={query} onChange={e => setQuery(e.target.value)} />
      <div className="picker-choices">{shown.map(c => <label key={c.id}><input type="checkbox" checked={selected.includes(c.id)} disabled={!selected.includes(c.id) && !!limit && selected.length >= limit} onChange={() => onChange(selected.includes(c.id) ? selected.filter(id => id !== c.id) : [...selected, c.id])} /><span>{c.label}</span></label>)}{!shown.length && <p>No matches.</p>}</div>
      <div className="picker-footer"><span>{selected.length}{limit ? ` of ${limit}` : ''} selected</span><button className="results-button" onClick={() => { setOpen(false); trigger.current?.focus(); }}>Done</button></div>
    </div>}
  </div>;
}
